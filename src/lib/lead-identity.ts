import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadIdentity = {
  place_id?: string | null;
  phone?: string | null;
  name?: string | null;
  address?: string | null;
};

export type PlaceIdentity = {
  placeId: string;
  phone: string;
  name: string;
  address: string;
};

function phoneKey(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
}

function textKey(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

export function excludeExistingPlaces<T extends PlaceIdentity>(places: T[], leads: LeadIdentity[]) {
  const knownPlaces = new Set(leads.map((lead) => lead.place_id?.trim()).filter(Boolean));
  const knownPhones = new Set(leads.map((lead) => phoneKey(lead.phone)).filter(Boolean));
  const knownNamesAndAddresses = new Set(leads.map((lead) => `${textKey(lead.name)}|${textKey(lead.address)}`).filter((key) => !key.startsWith("|") && !key.endsWith("|")));

  return places.filter((place) => {
    const placeId = place.placeId.trim();
    const phone = phoneKey(place.phone);
    const nameAndAddress = `${textKey(place.name)}|${textKey(place.address)}`;
    return !knownPlaces.has(placeId)
      && (!phone || !knownPhones.has(phone))
      && (nameAndAddress.startsWith("|") || nameAndAddress.endsWith("|") || !knownNamesAndAddresses.has(nameAndAddress));
  });
}

export async function loadLeadIdentities(supabase: SupabaseClient): Promise<LeadIdentity[]> {
  const pageSize = 1000;
  const rows: LeadIdentity[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("leads")
      .select("place_id,phone,name,address")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
