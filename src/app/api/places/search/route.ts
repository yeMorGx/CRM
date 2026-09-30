import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { excludeExistingPlaces, loadLeadIdentities } from "@/lib/lead-identity";

const APIFY_API = "https://api.apify.com/v2";
const MAPS_SCRAPER_ACTOR = "compass~crawler-google-places";
const MAX_RESULTS = 20;
const MAX_RUN_CHARGE_USD = 0.5;
const ACTIVE_RUN_STATES = new Set(["READY", "RUNNING", "ABORTING"]);

type AuthorizedUser = { userId: string } | { error: NextResponse };

type ApifyRun = {
  id?: string;
  actId?: string;
  status?: string;
  defaultDatasetId?: string;
};

type ApifyPlace = {
  placeId?: string;
  place_id?: string;
  cid?: string;
  title?: string;
  name?: string;
  address?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  url?: string;
};

async function getAuthorizedUser(): Promise<AuthorizedUser> {
  const supabase = await createClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: "Autenticação do Supabase não está configurada." }, { status: 503 }) };
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", auth.user.id).eq("is_allowed", true).maybeSingle();
  if (!profile) return { error: NextResponse.json({ error: "Usuário não autorizado." }, { status: 403 }) };

  return { userId: auth.user.id };
}

function getApifyToken() {
  return process.env.APIFY_API_TOKEN?.trim() || null;
}

function signRunId(runId: string, userId: string, token: string) {
  return createHmac("sha256", token).update(`${runId}:${userId}`).digest("hex");
}

function isValidRunSignature(runId: string, userId: string, signature: string, token: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signRunId(runId, userId, token), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function normalizePlaces(items: unknown) {
  if (!Array.isArray(items)) return [];

  const unique = new Map<string, { placeId: string; name: string; address: string; phone: string; website: string; source: string }>();
  for (const item of items as ApifyPlace[]) {
    const name = item.title?.trim() || item.name?.trim() || "";
    const address = item.address?.trim() || "";
    if (!name) continue;

    const placeId = item.placeId?.trim() || item.place_id?.trim() || item.cid?.trim() || item.url?.trim() || `${name}|${address}`;
    unique.set(placeId, {
      placeId,
      name,
      address,
      phone: item.phone?.trim() || item.phoneUnformatted?.trim() || "",
      website: item.website?.trim() || "",
      source: "Apify Google Maps Scraper",
    });
  }
  return [...unique.values()];
}

export async function POST(request: Request) {
  const auth = await getAuthorizedUser();
  if ("error" in auth) return auth.error;

  const token = getApifyToken();
  if (!token) return NextResponse.json({ error: "Configure APIFY_API_TOKEN para usar o Maps Scraper." }, { status: 503 });

  const body = await request.json().catch(() => null) as { term?: unknown; location?: unknown } | null;
  const term = typeof body?.term === "string" ? body.term.trim() : "";
  const location = typeof body?.location === "string" ? body.location.trim() : "";
  if (!term || !location || term.length > 120 || location.length > 120) {
    return NextResponse.json({ error: "Informe um tipo de negócio e uma localização válidos (até 120 caracteres cada)." }, { status: 400 });
  }

  const runOptions = new URLSearchParams({
    maxItems: String(MAX_RESULTS),
    maxTotalChargeUsd: String(MAX_RUN_CHARGE_USD),
  });

  try {
    const response = await fetch(`${APIFY_API}/actors/${MAPS_SCRAPER_ACTOR}/runs?${runOptions}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [term],
        locationQuery: location,
        maxCrawledPlacesPerSearch: MAX_RESULTS,
        language: "pt-BR",
        skipClosedPlaces: true,
        scrapePlaceDetailPage: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: response.status === 401 ? "O token do Apify é inválido." : "O Apify não conseguiu iniciar a busca." }, { status: 502 });
    }

    const payload = await response.json() as { data?: ApifyRun };
    const runId = payload.data?.id;
    if (!runId) return NextResponse.json({ error: "O Apify não retornou o identificador da busca." }, { status: 502 });

    return NextResponse.json({ runId, signature: signRunId(runId, auth.userId, token) }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Não foi possível conectar ao Apify. Tente novamente." }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const auth = await getAuthorizedUser();
  if ("error" in auth) return auth.error;

  const token = getApifyToken();
  if (!token) return NextResponse.json({ error: "Configure APIFY_API_TOKEN para usar o Maps Scraper." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId")?.trim() ?? "";
  const signature = request.headers.get("X-Apify-Run-Signature")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(runId) || !isValidRunSignature(runId, auth.userId, signature, token)) {
    return NextResponse.json({ error: "Busca inválida ou expirada." }, { status: 403 });
  }

  try {
    const runResponse = await fetch(`${APIFY_API}/actor-runs/${encodeURIComponent(runId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!runResponse.ok) return NextResponse.json({ error: "Não foi possível consultar a busca no Apify." }, { status: 502 });

    const runPayload = await runResponse.json() as { data?: ApifyRun };
    const run = runPayload.data;
    if (!run?.status) return NextResponse.json({ error: "O Apify retornou um estado de busca inválido." }, { status: 502 });
    if (ACTIVE_RUN_STATES.has(run.status)) return NextResponse.json({ status: run.status });
    if (run.status !== "SUCCEEDED") return NextResponse.json({ error: `O Maps Scraper terminou sem sucesso (${run.status}).` }, { status: 502 });
    if (!run.defaultDatasetId) return NextResponse.json({ status: "SUCCEEDED", results: [] });

    const datasetUrl = new URL(`${APIFY_API}/datasets/${encodeURIComponent(run.defaultDatasetId)}/items`);
    datasetUrl.searchParams.set("clean", "true");
    datasetUrl.searchParams.set("format", "json");
    datasetUrl.searchParams.set("limit", String(MAX_RESULTS));

    const datasetResponse = await fetch(datasetUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!datasetResponse.ok) return NextResponse.json({ error: "A busca terminou, mas não foi possível carregar os resultados." }, { status: 502 });

    const places = normalizePlaces(await datasetResponse.json());
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "O CRM não está conectado ao Supabase." }, { status: 503 });
    let existing;
    try {
      existing = await loadLeadIdentities(supabase);
    } catch {
      return NextResponse.json({ error: "Não foi possível conferir os leads já cadastrados. Tente novamente." }, { status: 503 });
    }
    const results = excludeExistingPlaces(places, existing);
    return NextResponse.json({ status: "SUCCEEDED", results, hiddenExistingCount: places.length - results.length });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar os resultados no Apify." }, { status: 502 });
  }
}
