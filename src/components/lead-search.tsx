"use client";

import { Check, Globe2, MapPin, Phone, Search, Sparkles, Users } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Lead } from "@/lib/crm-types";
import { excludeExistingPlaces, loadLeadIdentities } from "@/lib/lead-identity";

export type LeadSearchResult = {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  source: string;
};

type PlaceEnrichment = Pick<Lead, "cidade" | "uf" | "foto_ref" | "foto_atribuicao" | "nota_google" | "total_avaliacoes" | "maps_url">;

type SearchStartResponse = { runId?: string; signature?: string; error?: string };
type SearchPollResponse = { status?: string; results?: LeadSearchResult[]; hiddenExistingCount?: number; error?: string };

export function LeadSearchModule({ onImported, onNotice }: { onImported: (leads: Lead[]) => void; onNotice: (message: string) => void }) {
  const [term, setTerm] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<LeadSearchResult[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [hiddenExistingCount, setHiddenExistingCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  async function searchPlaces(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!term.trim() || !location.trim()) return;
    setIsSearching(true);
    setSelected([]);
    setResults([]);
    setSearchCompleted(false);
    setHiddenExistingCount(0);
    try {
      const startResponse = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, location }),
      });
      const started = await startResponse.json() as SearchStartResponse;
      if (!startResponse.ok || !started.runId || !started.signature) {
        throw new Error(started.error ?? "Não foi possível iniciar a busca no Apify.");
      }

      const runParams = new URLSearchParams({ runId: started.runId });
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 2000));
        const pollResponse = await fetch(`/api/places/search?${runParams}`, {
          headers: { "X-Apify-Run-Signature": started.signature },
          cache: "no-store",
        });
        const poll = await pollResponse.json() as SearchPollResponse;
        if (!pollResponse.ok) throw new Error(poll.error ?? "Não foi possível consultar a busca no Apify.");
        if (poll.status !== "SUCCEEDED") continue;

        setResults(poll.results ?? []);
        setSearchCompleted(true);
        setHiddenExistingCount(poll.hiddenExistingCount ?? 0);
        if (!poll.results?.length) onNotice(poll.hiddenExistingCount ? "Os negócios encontrados já estão no CRM. Tente outro segmento ou local." : "Nenhum negócio novo encontrado para essa busca.");
        else if (poll.hiddenExistingCount) onNotice(`${poll.hiddenExistingCount} negócio(s) já cadastrado(s) foram ocultados.`);
        return;
      }

      onNotice("O Apify ainda está processando essa busca. Aguarde um pouco e tente consultar novamente.");
    } catch (error) {
      setResults([]);
      onNotice(error instanceof Error ? error.message : "Não foi possível conectar ao Apify. Tente novamente.");
    } finally {
      setIsSearching(false);
    }
  }

  function toggleSelected(placeId: string) {
    setSelected((current) => current.includes(placeId) ? current.filter((id) => id !== placeId) : [...current, placeId]);
  }

  async function importSelected() {
    const selectedResults = results.filter((result) => selected.includes(result.placeId));
    if (!selectedResults.length) return;
    setIsImporting(true);
    if (!supabase) {
      onNotice("Conecte o Supabase antes de importar leads reais.");
      setIsImporting(false);
      return;
    }

    let importable: LeadSearchResult[];
    try {
      importable = excludeExistingPlaces(selectedResults, await loadLeadIdentities(supabase));
    } catch {
      onNotice("Não foi possível conferir os leads já cadastrados. Tente novamente.");
      setIsImporting(false);
      return;
    }

    if (importable.length) {
      let enriched: Record<string, PlaceEnrichment | null> = {};
      try {
        const response = await fetch("/api/places/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeIds: importable.map((result) => result.placeId).filter((id) => /^[A-Za-z0-9_-]{10,250}$/.test(id)) }),
        });
        if (response.ok) enriched = ((await response.json()) as { places?: Record<string, PlaceEnrichment | null> }).places ?? {};
      } catch { /* The Maps metadata is optional; the original import still works. */ }
      const baseRows = importable.map((result) => ({ name: result.name, address: result.address, phone: result.phone || null, website: result.website || null, source: result.source, place_id: result.placeId, status: "novo" }));
      const enrichedRows = baseRows.map((row) => ({ ...row, ...enriched[row.place_id] }));
      let { data, error } = await supabase.from("leads").insert(enrichedRows).select("*");
      if (error && ["PGRST204", "42703"].includes(error.code)) {
        ({ data, error } = await supabase.from("leads").insert(baseRows).select("*"));
      }
      if (error) {
        onNotice("Não foi possível importar os selecionados.");
        setIsImporting(false);
        return;
      }
      onImported((data ?? []) as Lead[]);
      setResults((current) => current.filter((result) => !selected.includes(result.placeId)));
    } else {
      setResults((current) => current.filter((result) => !selected.includes(result.placeId)));
      onNotice("Os leads selecionados já estavam no CRM.");
      setIsImporting(false);
      return;
    }

    setSelected([]);
    setIsImporting(false);
    onNotice(`${importable.length} lead(s) importado(s).`);
  }

  return (
    <div className="search-module">
      <div className="search-hero">
        <div className="search-hero-icon"><Sparkles size={21} /></div>
        <div>
          <p className="eyebrow">Prospecção automática · Apify</p>
          <h2>Encontre novos negócios.</h2>
          <p>Pesquise empresas no Google Maps, selecione oportunidades reais e adicione-as ao seu pipeline.</p>
        </div>
      </div>
      <form className="places-form" onSubmit={searchPlaces}>
        <label><span>O que você procura?</span><div className="places-input"><Search size={16} /><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Ex.: pizzarias, salões de beleza..." /></div></label>
        <label><span>Onde?</span><div className="places-input"><MapPin size={16} /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Cidade, estado" /></div></label>
        <button className="primary-button" type="submit" disabled={isSearching}>{isSearching ? "Buscando no Maps..." : "Buscar negócios"}<Search size={16} /></button>
      </form>
      {searchCompleted && <p className="search-results-summary">{hiddenExistingCount > 0 ? `${hiddenExistingCount} negócio(s) já cadastrados foram ocultados. ` : ""}{results.length > 0 ? `${results.length} novo(s) negócio(s) para avaliar.` : "Nenhum negócio novo nesta busca. Tente outro segmento ou local."}</p>}
      {results.length > 0 && <div className="results-panel">
        <div className="results-header"><div><h3>Resultados da busca</h3><p>{results.length} negócios encontrados · {selected.length} selecionados</p></div><button className="secondary-button" onClick={() => setSelected(selected.length === results.length ? [] : results.map((result) => result.placeId))}>{selected.length === results.length ? "Limpar seleção" : "Selecionar todos"}</button></div>
        <div className="results-list">{results.map((result) => <label className={`result-row ${selected.includes(result.placeId) ? "result-selected" : ""}`} key={result.placeId}><input type="checkbox" checked={selected.includes(result.placeId)} onChange={() => toggleSelected(result.placeId)} /><span className="result-check"><Check size={13} /></span><span className="result-copy"><strong>{result.name}</strong><span><MapPin size={12} />{result.address}</span><span><Phone size={12} />{result.phone || "Telefone não informado"}</span></span>{result.website && <Globe2 size={16} className="result-website" />}</label>)}</div>
        <div className="results-footer"><span><Users size={15} /> Leads sem duplicidade por local ou telefone</span><button className="primary-button" disabled={!selected.length || isImporting} onClick={importSelected}>{isImporting ? "Importando..." : `Importar ${selected.length || "selecionados"}`}<Check size={16} /></button></div>
      </div>}
      <div className="search-note"><Sparkles size={14} /><span>Apify Google Maps Scraper · até 20 resultados por busca · limite de US$ 0,50 por execução.</span></div>
    </div>
  );
}
