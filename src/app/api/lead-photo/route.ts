import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref") ?? "";
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref)) {
    return new Response(null, { status: 400 });
  }
  const supabase = await createClient();
  if (!supabase) return new Response(null, { status: 503 });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401 });
  const { data: lead } = await supabase.from("leads").select("id").eq("foto_ref", ref).maybeSingle();
  if (!lead) return new Response(null, { status: 404 });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return new Response(null, { status: 503 });

  try {
    async function getMetadata(photoRef: string) {
      const url = new URL(`https://places.googleapis.com/v1/${photoRef}/media`);
      url.searchParams.set("maxWidthPx", "80");
      url.searchParams.set("maxHeightPx", "80");
      url.searchParams.set("skipHttpRedirect", "true");
      return fetch(url, { headers: { "X-Goog-Api-Key": key! }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    }
    let metadata = await getMetadata(ref);
    if (metadata.status === 404 || metadata.status === 400) {
      const placeId = ref.split("/")[1];
      const details = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (details.ok) {
        const fresh = await details.json() as { photos?: { name?: string }[] };
        if (fresh.photos?.[0]?.name) metadata = await getMetadata(fresh.photos[0].name);
      }
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
