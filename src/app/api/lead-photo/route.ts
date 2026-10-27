import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ref = params.get("ref") ?? "";
  const placeId = params.get("placeId") ?? "";
  const cardSize = params.get("size") === "card";
  if (!(ref && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref)) && !(placeId && /^[A-Za-z0-9_-]{10,250}$/.test(placeId))) {
    return new Response(null, { status: 400 });
  }
  const supabase = await createClient();
  if (!supabase) return new Response(null, { status: 503 });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401 });
  const { data: lead } = await supabase.from("leads").select("id").eq(ref ? "foto_ref" : "place_id", ref || placeId).maybeSingle();
  if (!lead) return new Response(null, { status: 404 });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return new Response(null, { status: 503 });

  try {
    async function firstPhoto(id: string) {
      const details = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
        headers: { "X-Goog-Api-Key": key!, "X-Goog-FieldMask": "photos" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!details.ok) return null;
      const place = await details.json() as { photos?: { name?: string }[] };
      return place.photos?.[0]?.name ?? null;
    }
    async function getMetadata(photoRef: string) {
      const url = new URL(`https://places.googleapis.com/v1/${photoRef}/media`);
      url.searchParams.set("maxWidthPx", cardSize ? "640" : "80");
      url.searchParams.set("maxHeightPx", cardSize ? "360" : "80");
      url.searchParams.set("skipHttpRedirect", "true");
      return fetch(url, { headers: { "X-Goog-Api-Key": key! }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    }
    const photoRef = ref || await firstPhoto(placeId);
    if (!photoRef) return new Response(null, { status: 404 });
    let metadata = await getMetadata(photoRef);
    if (metadata.status === 404 || metadata.status === 400) {
      const freshRef = await firstPhoto(ref ? ref.split("/")[1] : placeId);
      if (freshRef) metadata = await getMetadata(freshRef);
    }
    if (!metadata.ok) return new Response(null, { status: 404 });
    const { photoUri } = await metadata.json() as { photoUri?: string };
    if (!photoUri || new URL(photoUri).protocol !== "https:") return new Response(null, { status: 502 });
    const image = await fetch(photoUri, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!image.ok || !image.body || !image.headers.get("content-type")?.startsWith("image/")) return new Response(null, { status: 502 });
    return new Response(image.body, {
      headers: {
        "Content-Type": image.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Foto indisponível." }, { status: 502 });
  }
}
