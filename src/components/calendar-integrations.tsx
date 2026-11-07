"use client";

import {AppSelect} from "@/components/app-select";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, Check, ChevronDown, ExternalLink, Layers3, RefreshCw, Unplug } from "lucide-react";

import { useAppToast } from "@/components/app-toast-provider";

type Provider = "google" | "microsoft" | "notion";
type DataSource = { id: string; name: string; titleProperties: string[]; dateProperties: string[] };
type CalendarConnection = {
  provider: Provider;
  name: string;
  ready: boolean;
  missingEnvironment: string[];
  callbackUrl: string;
  connected: boolean;
  accountLabel: string | null;
  syncEnabled: boolean;
  config: { dataSourceId?: string; titleProperty?: string; dateProperty?: string };
  pendingCount: number;
  pendingError: string | null;
  lastError: string | null;
};

const providerIcons = { google: CalendarDays, microsoft: CalendarRange, notion: Layers3 };
const providerDescriptions: Record<Provider, string> = {
  google: "Adicione seus compromissos à agenda principal da conta Google conectada.",
  microsoft: "Adicione seus compromissos ao calendário principal do Outlook conectado.",
  notion: "Grave os eventos numa base do Notion e adicione essa base ao Notion Calendar.",
};

export function CalendarIntegrationsModule() {
  const toast = useAppToast();
  const [providers, setProviders] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [sourcesByProvider, setSourcesByProvider] = useState<Record<string, DataSource[]>>({});
  const [selectedSources, setSelectedSources] = useState<Record<string, string>>({});
  const [selectedTitles, setSelectedTitles] = useState<Record<string, string>>({});
  const [selectedDates, setSelectedDates] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/integrations/calendar", { cache: "no-store" });
    const data = await response.json() as { providers?: CalendarConnection[]; error?: string };
    if (!response.ok || !data.providers) throw new Error(data.error || "Não foi possível carregar as integrações.");
    return data.providers;
  }, []);

  const applyConnections = useCallback((connections: CalendarConnection[]) => {
    setProviders(connections);
    setSelectedSources((current) => Object.fromEntries(connections.filter((item) => item.provider === "notion").map((item) => [item.provider, current[item.provider] || item.config.dataSourceId || ""])));
    setSelectedTitles((current) => Object.fromEntries(connections.filter((item) => item.provider === "notion").map((item) => [item.provider, current[item.provider] || item.config.titleProperty || ""])));
    setSelectedDates((current) => Object.fromEntries(connections.filter((item) => item.provider === "notion").map((item) => [item.provider, current[item.provider] || item.config.dateProperty || ""])));
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((connections) => { if (active) applyConnections(connections); })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as integrações."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyConnections, load]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try { applyConnections(await load()); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as integrações."); }
    finally { setLoading(false); }
  }, [applyConnections, load]);

  const notionConnection = useMemo(() => providers.find((item) => item.provider === "notion"), [providers]);
  const selectedSource = sourcesByProvider.notion?.find((source) => source.id === selectedSources.notion);

  async function postAction(body: Record<string, unknown>, key: string, successMessage?: string) {
    setBusy(key);
    try {
      const response = await fetch("/api/integrations/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: string; errors?: string[]; retried?: number };
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar a integração.");
      if (successMessage) toast(successMessage, "success");
      if (data.errors?.length) toast(`${data.errors.length} evento(s) ainda precisam de atenção.`, "error");
      await reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível atualizar a integração.", "error");
    } finally {
      setBusy("");
    }
  }

  async function loadNotionSources() {
    setBusy("notion-sources");
    try {
      const response = await fetch("/api/integrations/calendar/notion/sources", { cache: "no-store" });
      const data = await response.json() as { sources?: DataSource[]; error?: string };
      if (!response.ok || !data.sources) throw new Error(data.error || "Não foi possível listar as bases do Notion.");
      setSourcesByProvider((current) => ({ ...current, notion: data.sources! }));
      const chosen = data.sources.find((source) => source.id === selectedSources.notion) ?? data.sources[0];
      if (chosen) {
        setSelectedSources((current) => ({ ...current, notion: chosen.id }));
        setSelectedTitles((current) => ({ ...current, notion: current.notion && chosen.titleProperties.includes(current.notion) ? current.notion : chosen.titleProperties[0] ?? "" }));
        setSelectedDates((current) => ({ ...current, notion: current.notion && chosen.dateProperties.includes(current.notion) ? current.notion : chosen.dateProperties[0] ?? "" }));
      }
      if (!data.sources.length) toast("Nenhuma base compartilhada com propriedades de título e data foi encontrada.", "info");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível listar as bases do Notion.", "error");
    } finally {
      setBusy("");
    }
  }

  async function configureNotion() {
    if (!selectedSources.notion || !selectedTitles.notion || !selectedDates.notion) {
      toast("Escolha a base e as propriedades de título e data.", "error");
      return;
    }
    await postAction({ action: "configure-notion", provider: "notion", dataSourceId: selectedSources.notion, titleProperty: selectedTitles.notion, dateProperty: selectedDates.notion }, "notion-config", "Base do Notion configurada para sincronizar.");
  }

  function disconnect(provider: Provider, name: string) {
    if (!window.confirm(`Desconectar ${name}? Eventos já enviados permanecem no calendário externo.`)) return;
    void postAction({ action: "disconnect", provider }, `${provider}-disconnect`, `${name} desconectado.`);
  }

  return <section className="calendar-integrations-page" aria-labelledby="calendar-integrations-title">
    <div className="calendar-integrations-heading">
      <div><p className="calendar-integrations-eyebrow">Conexões</p><h1 id="calendar-integrations-title">Calendários integrados</h1><p>A Agenda envia eventos para os calendários habilitados. Alterações feitas fora do CRM não voltam para a Agenda.</p></div>
      <button className="secondary-button" type="button" onClick={() => void reload()} disabled={loading}><RefreshCw size={15} className={loading ? "calendar-refreshing" : ""} /> Atualizar</button>
    </div>

    {loadError && <div className="calendar-integrations-alert" role="alert"><span>{loadError}</span><button type="button" onClick={() => void reload()}>Tentar novamente</button></div>}

    <div className="calendar-integration-list">
      {loading && !providers.length && <><div className="sr-only" role="status">Carregando integrações de calendário.</div>{[0, 1, 2].map((item) => <div className={`calendar-integration-skeleton ${item === 2 ? "is-wide" : ""}`} aria-hidden="true" key={item}><span /><div><i /><i /></div><b /></div>)}</>}
      {providers.map((connection) => {
        const Icon = providerIcons[connection.provider];
        const isBusy = busy === connection.provider || busy === `${connection.provider}-toggle` || busy === `${connection.provider}-disconnect` || busy === "notion-config" || busy === "notion-toggle" || busy === "notion-disconnect";
        return <article className={`calendar-integration-card calendar-integration-${connection.provider}`} key={connection.provider}>
          <header className="calendar-integration-card-header">
            <span className="calendar-integration-icon"><Icon size={19} /></span>
            <div className="calendar-integration-copy"><h2>{connection.name}</h2><p>{providerDescriptions[connection.provider]}</p></div>
            <span className={`calendar-integration-status ${connection.connected ? "is-connected" : ""}`}><span />{connection.connected ? "Conectado" : "Desconectado"}</span>
          </header>

          {connection.connected ? <>
            <p className="calendar-integration-account">{connection.accountLabel || "Conta autorizada"}</p>
            {connection.provider === "notion" ? <div className="calendar-notion-setup">
              <div className="calendar-notion-heading"><div><strong>Destino dos eventos</strong><span>Escolha uma base compartilhada com a conexão do Notion.</span></div><button type="button" className="calendar-text-button" onClick={() => void loadNotionSources()} disabled={busy === "notion-sources"}><RefreshCw size={13} className={busy === "notion-sources" ? "calendar-refreshing" : ""} /> {busy === "notion-sources" ? "Carregando" : "Carregar bases"}</button></div>
              <label>Base do Notion<AppSelect value={selectedSources.notion ?? ""} onChange={(event) => {
                const next = sourcesByProvider.notion?.find((source) => source.id === event.target.value);
                setSelectedSources((current) => ({ ...current, notion: event.target.value }));
                if (next) {
                  setSelectedTitles((current) => ({ ...current, notion: next.titleProperties[0] ?? "" }));
                  setSelectedDates((current) => ({ ...current, notion: next.dateProperties[0] ?? "" }));
                }
              }} disabled={!sourcesByProvider.notion?.length}><option value="">Carregue e escolha uma base</option>{(sourcesByProvider.notion ?? []).map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</AppSelect></label>
              {selectedSource && <div className="calendar-notion-property-grid">
                <label>Propriedade de título<AppSelect value={selectedTitles.notion ?? ""} onChange={(event) => setSelectedTitles((current) => ({ ...current, notion: event.target.value }))}>{selectedSource.titleProperties.map((name) => <option key={name}>{name}</option>)}</AppSelect></label>
                <label>Propriedade de data<AppSelect value={selectedDates.notion ?? ""} onChange={(event) => setSelectedDates((current) => ({ ...current, notion: event.target.value }))}>{selectedSource.dateProperties.map((name) => <option key={name}>{name}</option>)}</AppSelect></label>
              </div>}
              <div className="calendar-integration-actions"><button type="button" className="primary-button" onClick={() => void configureNotion()} disabled={isBusy || !selectedSource}>{busy === "notion-config" ? "Salvando..." : "Salvar destino"}</button>{connection.syncEnabled && <span className="calendar-sync-enabled"><Check size={14} /> Sincronização ativa</span>}</div>
            </div> : <div className="calendar-integration-actions">
              <button type="button" role="switch" aria-label={`Sincronizar com ${connection.name}`} aria-checked={connection.syncEnabled} className={`calendar-sync-switch ${connection.syncEnabled ? "is-on" : ""}`} onClick={() => void postAction({ action: "toggle", provider: connection.provider, enabled: !connection.syncEnabled }, `${connection.provider}-toggle`)} disabled={isBusy}><span /></button>
              <span className="calendar-sync-copy">{connection.syncEnabled ? "Enviar eventos para este calendário" : "Sincronização pausada"}</span>
              <button type="button" className="calendar-disconnect-button" onClick={() => disconnect(connection.provider, connection.name)} disabled={isBusy}><Unplug size={14} /> Desconectar</button>
            </div>}
            {connection.provider === "notion" && <div className="calendar-integration-actions calendar-notion-switch-row"><button type="button" role="switch" aria-label="Sincronizar com a base do Notion" aria-checked={connection.syncEnabled} className={`calendar-sync-switch ${connection.syncEnabled ? "is-on" : ""}`} onClick={() => void postAction({ action: "toggle", provider: "notion", enabled: !connection.syncEnabled }, "notion-toggle")} disabled={isBusy || !connection.config.dataSourceId}><span /></button><span className="calendar-sync-copy">{connection.syncEnabled ? "Enviar eventos para esta base" : "Sincronização pausada"}<small>Adicione a base ao Notion Calendar para ver os eventos por lá.</small></span><button type="button" className="calendar-disconnect-button" onClick={() => disconnect("notion", "Notion")} disabled={isBusy}><Unplug size={14} /> Desconectar</button></div>}
            {(connection.pendingCount > 0 || connection.lastError) && <div className="calendar-integration-pending" role="status"><span>{connection.pendingCount ? `${connection.pendingCount} evento(s) aguardam sincronização.` : connection.lastError}</span><button type="button" onClick={() => void postAction({ action: "retry" }, "retry")} disabled={busy === "retry"}>{busy === "retry" ? "Tentando..." : "Tentar sincronizar"}</button></div>}
          </> : <>
            {connection.ready ? <a className="primary-button calendar-connect-button" href={`/api/integrations/calendar/${connection.provider}`}><ExternalLink size={15} /> Conectar {connection.name}</a> : <div className="calendar-provider-setup"><strong>Conexão ainda não configurada no servidor</strong><p>Adicione estas variáveis no ambiente da Vercel:</p><ul>{connection.missingEnvironment.map((name) => <li key={name}><code>{name}</code></li>)}</ul></div>}
            <details className="calendar-callback-details"><summary>URL de retorno OAuth <ChevronDown size={14} /></summary><code>{connection.callbackUrl}</code></details>
          </>}
        </article>;
      })}
      {!loading && !providers.length && !loadError && <div className="calendar-integrations-empty">Nenhuma integração de calendário foi carregada.</div>}
    </div>

    {notionConnection?.connected && <p className="calendar-integrations-footnote">A integração do Notion cria e atualiza itens na base escolhida. Para mostrá-los no Notion Calendar, adicione essa base no aplicativo e escolha a propriedade de data. Itens de bases do Notion são exibidos no Notion Calendar, não como eventos dos calendários Google ou Outlook.</p>}
  </section>;
}
