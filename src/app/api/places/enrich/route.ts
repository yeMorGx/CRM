import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isSameOriginMutation } from "@/lib/admin-users";

type PlaceDetails = {
  photos?: { name?: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
};

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", auth.user.id).eq("is_allowed", true).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ places: {} });
  const body = await request.json().catch(() => null) as { placeIds?: unknown } | null;
  const placeIds = body?.placeIds;
  if (!Array.isArray(placeIds) || placeIds.length > 20 || placeIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{10,250}$/.test(id))) {
    return NextResponse.json({ error: "Locais inválidos." }, { status: 400 });
  }

  const places = Object.fromEntries(await Promise.all(placeIds.map(async (placeId: string) => {
    try {
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos,rating,userRatingCount,googleMapsUri,addressComponents" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return [placeId, null];
      const place = await response.json() as PlaceDetails;
      const city = place.addressComponents?.find((part) => part.types?.includes("administrative_area_level_2"))?.longText
        ?? place.addressComponents?.find((part) => part.types?.includes("locality"))?.longText;
      const uf = place.addressComponents?.find((part) => part.types?.includes("administrative_area_level_1"))?.shortText;
      return [placeId, {
        cidade: city ?? null,
        uf: uf ?? null,
        foto_ref: place.photos?.[0]?.name ?? null,
        foto_atribuicao: place.photos?.[0]?.authorAttributions?.filter((item) => item.displayName).map((item) => ({ displayName: item.displayName, uri: item.uri })) ?? null,
        nota_google: place.rating ?? null,
        total_avaliacoes: place.userRatingCount ?? null,
        maps_url: place.googleMapsUri ?? null,
      }];
    } catch {
      return [placeId, null];
    }
  })));
  return NextResponse.json({ places });
}
