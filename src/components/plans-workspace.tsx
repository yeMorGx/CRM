"use client";

import {AppSelect} from "@/components/app-select";

import { Button } from "@heroui/react";
// avoid-ai-design-ignore: I3 — the CRM already uses Lucide; checks mark included features in the plan preview.
import { Building2, Check, Coins, ImagePlus, LoaderCircle, Save, Upload } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";

import { useAppToast } from "@/components/app-toast-provider";
import {
  monthlyBreakdownFields,
  planLimitFields,
  type CompanySettings,
  type Plan,
  type PlanAddon,
} from "@/lib/plans-types";
import "./plans-workspace.css";

type Tab = "plans" | "company";
type PlansResponse = { plans: Plan[]; addons: PlanAddon[] };

async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a solicitação.");
  return data;
}

function currency(value: number | null | undefined) {
  return value == null ? "Sob consulta" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function moneyValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function PlansWorkspace({ initialTab }: { initialTab: Tab }) {
  return (
    <section className="plans-workspace">
      <header className="plans-heading">
        <div>
          <h1>{initialTab === "company" ? "Configurações da empresa" : "Planos e extras"}</h1>
          <p>{initialTab === "company" ? "Dados contratuais, sócios e cláusulas padrão." : "Preços e condições que aparecem nas propostas comerciais."}</p>
        </div>
      </header>

      <nav className="plans-tabs" aria-label="Administração comercial">
        <Link href="/planos" aria-current={initialTab === "plans" ? "page" : undefined} className={initialTab === "plans" ? "plans-tab-active" : ""}><Coins size={15} /> Planos e extras</Link>
        <Link href="/configuracoes/empresa" aria-current={initialTab === "company" ? "page" : undefined} className={initialTab === "company" ? "plans-tab-active" : ""}><Building2 size={15} /> Empresa</Link>
      </nav>

      {initialTab === "company" ? <CompanySettingsPanel /> : <PlansPanel />}
    </section>
  );
}

function PlansPanel() {
  const toast = useAppToast();
  const [data, setData] = useState<PlansResponse>({ plans: [], addons: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [previewId, setPreviewId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/plans", { cache: "no-store" });
      const result = await responseData<PlansResponse>(response);
      setData({ plans: result.plans ?? [], addons: result.addons ?? [] });
      setPreviewId((current) => result.plans.some((plan) => plan.id === current) ? current : result.plans[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os planos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  function updatePlan(id: string, patch: Partial<Plan>) {
    setData((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === id ? { ...plan, ...patch } : plan) }));
  }

  function updateAddon(id: string, patch: Partial<PlanAddon>) {
    setData((current) => ({ ...current, addons: current.addons.map((addon) => addon.id === id ? { ...addon, ...patch } : addon) }));
  }

  async function save(entity: "plan" | "addon", id: string) {
    const item = entity === "plan" ? data.plans.find((plan) => plan.id === id) : data.addons.find((addon) => addon.id === id);
    if (!item) return;
    setSaving(`${entity}:${id}`);
    setError("");
    try {
      const response = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, ...item }),
      });
      const result = await responseData<{ item: Plan | PlanAddon }>(response);
      if (entity === "plan") {
        const saved = result.item as Plan;
        setData((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === id ? saved : plan) }));
      } else {
        const saved = result.item as PlanAddon;
        setData((current) => ({ ...current, addons: current.addons.map((addon) => addon.id === id ? saved : addon) }));
      }
      toast(entity === "plan" ? "Plano salvo." : "Extra salvo.", "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível salvar as alterações.";
      setError(message);
      toast(message, "error");
    } finally {
      setSaving("");
    }
  }

  const selectedPlan = data.plans.find((plan) => plan.id === previewId) ?? data.plans[0];
  return (
    <div className="plans-panel">
      {error && <div className="plans-error" role="alert"><span>{error}</span><Button className="plans-retry" onPress={() => { setLoading(true); void load(); }}>Tentar novamente</Button></div>}
      {loading ? <div className="plans-loading" role="status"><LoaderCircle size={18} className="plans-spinner" /> Carregando planos e extras…</div> : (
        <>
          <div className="plans-panel-heading"><div><h2>Planos comerciais</h2><p>{data.plans.length ? `${data.plans.length} planos cadastrados` : "Nenhum plano cadastrado"}. Edite os campos e salve cada item.</p></div></div>
          {!data.plans.length ? <div className="plans-empty"><Coins size={24} /><strong>A base de planos ainda não está disponível</strong><span>Confira se a migration da Fase 1 foi aplicada no Supabase.</span></div> : (
            <div className="plans-edit-layout">
              <div className="plan-edit-list">
                {data.plans.map((plan) => <PlanEditor key={plan.id} plan={plan} saving={saving === `plan:${plan.id}`} onChange={(patch) => updatePlan(plan.id, patch)} onSave={() => void save("plan", plan.id)} />)}
              </div>
              <aside className="plan-preview-column">
                <div className="plan-preview-title"><h2>Prévia da proposta</h2></div>
                <label className="plans-field"><span>Pré-visualizar</span><AppSelect value={selectedPlan?.id ?? ""} onChange={(event) => setPreviewId(event.target.value)} aria-label="Selecionar plano para pré-visualizar">{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</AppSelect></label>
                {selectedPlan ? <PlanPreview plan={selectedPlan} /> : null}
                <p className="plan-preview-note">A prévia acompanha os dados editados. O plano Pro aparece como “Mais escolhido” nas propostas, salvo destaque definido pela equipe.</p>
              </aside>
            </div>
          )}

          <div className="plans-panel-heading plans-addons-heading"><div><h2>Extras disponíveis</h2><p>Valores e planos em que cada extra pode ser oferecido.</p></div></div>
          {!data.addons.length ? <div className="plans-empty plans-empty-compact"><span>Nenhum extra cadastrado.</span></div> : (
            <div className="addon-list">
              {data.addons.map((addon) => <AddonEditor key={addon.id} addon={addon} saving={saving === `addon:${addon.id}`} onChange={(patch) => updateAddon(addon.id, patch)} onSave={() => void save("addon", addon.id)} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlanEditor({ plan, saving, onChange, onSave }: { plan: Plan; saving: boolean; onChange: (patch: Partial<Plan>) => void; onSave: () => void }) {
  return (
    <article className={`plan-editor ${!plan.active ? "plan-editor-inactive" : ""}`}>
      <div className="plan-editor-header">
        <div className="plan-editor-identity"><span className="plan-sort">{String(plan.sort).padStart(2, "0")}</span><div><h3>{plan.name}</h3><span>{plan.on_request ? "Valores sob consulta" : `${currency(plan.setup_price)} de implantação e ${currency(plan.monthly_price)}/mês`}</span></div></div>
        <label className="plans-switch"><input type="checkbox" checked={plan.active} onChange={(event) => onChange({ active: event.target.checked })} /><span aria-hidden="true" /><span>{plan.active ? "Ativo" : "Inativo"}</span></label>
      </div>
      <div className="plan-editor-fields">
        <Field label="Nome do plano"><input value={plan.name} maxLength={80} onChange={(event) => onChange({ name: event.target.value })} /></Field>
        <Field label="Resumo"><input value={plan.tagline ?? ""} maxLength={180} onChange={(event) => onChange({ tagline: event.target.value })} /></Field>
        <div className="plans-inline-checks">
          <label className="plans-check"><input type="checkbox" checked={plan.on_request} onChange={(event) => onChange({ on_request: event.target.checked })} /> Valores sob consulta</label>
          <label className="plans-check"><input type="checkbox" checked={plan.setup_is_from} onChange={(event) => onChange({ setup_is_from: event.target.checked })} /> Implantação “a partir de”</label>
        </div>
        <Field label="Implantação (R$)"><input type="number" min="0" step="0.01" value={plan.setup_price ?? ""} disabled={plan.on_request} onChange={(event) => onChange({ setup_price: moneyValue(event.target.value) })} /></Field>
        <div className="plan-monthly-total"><span>Mensalidade calculada</span><strong>{plan.on_request ? "Sob consulta" : currency(Object.values(plan.monthly_breakdown ?? {}).reduce((sum, value) => sum + Number(value || 0), 0))}</strong></div>
        <Field label="Funcionalidades, uma por linha" className="plans-field-full"><textarea rows={4} value={plan.features.join("\n")} onChange={(event) => onChange({ features: event.target.value.split("\n").slice(0, 12) })} /></Field>
        <div className="plans-subsection"><h4>Limites e condições</h4><div className="plans-limit-grid">{planLimitFields.map(([key, label]) => <Field key={key} label={label}><input value={plan.limits?.[key] ?? ""} maxLength={80} onChange={(event) => onChange({ limits: { ...plan.limits, [key]: event.target.value } })} /></Field>)}</div></div>
        <div className="plans-subsection"><h4>Composição da mensalidade</h4><div className="plans-limit-grid">{monthlyBreakdownFields.map(([key, label]) => <Field key={key} label={`${label} (R$)`}><input type="number" min="0" step="0.01" value={plan.monthly_breakdown?.[key] ?? 0} disabled={plan.on_request} onChange={(event) => onChange({ monthly_breakdown: { ...plan.monthly_breakdown, [key]: moneyValue(event.target.value) ?? 0 } })} /></Field>)}</div><p>O total mensal é recalculado pela soma dos componentes.</p></div>
      </div>
      <div className="plan-editor-footer"><span>{saving ? <><LoaderCircle size={14} className="plans-spinner" /> Salvando no banco…</> : "Alterações não salvas ficam somente nesta tela."}</span><Button className="primary-button" isDisabled={saving} onPress={onSave}><Save size={15} /> Salvar plano</Button></div>
    </article>
  );
}

function PlanPreview({ plan }: { plan: Plan }) {
  const monthly = Object.values(plan.monthly_breakdown ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  return (
    <article className={`proposal-plan-preview ${!plan.active ? "proposal-plan-preview-inactive" : ""}`}>
      {plan.id === "pro" && <span className="proposal-plan-featured">Mais escolhido</span>}
      <p className="proposal-plan-name">{plan.name || "Nome do plano"}</p>
      <p className="proposal-plan-tagline">{plan.tagline || "Resumo do plano"}</p>
      <strong className="proposal-plan-price">{plan.on_request ? "Sob consulta" : currency(monthly)}<small>{plan.on_request ? "" : "/mês"}</small></strong>
      <p className="proposal-plan-setup">{plan.on_request ? "Implantação sob consulta" : `${plan.setup_is_from ? "A partir de " : ""}${currency(plan.setup_price)} de implantação`}</p>
      <ul>{plan.features.slice(0, 5).map((feature, index) => <li key={`${plan.id}-feature-${index}`}><Check size={13} /> {feature}</li>)}</ul>
      <span className={plan.on_request ? "secondary-button" : "primary-button"} aria-hidden="true">{plan.on_request ? "Falar com a equipe" : "Escolher este plano"}</span>
      {!plan.active && <span className="proposal-plan-inactive-note">Este plano está inativo</span>}
    </article>
  );
}

function AddonEditor({ addon, saving, onChange, onSave }: { addon: PlanAddon; saving: boolean; onChange: (patch: Partial<PlanAddon>) => void; onSave: () => void }) {
  const plans = [{ id: "starter", name: "Starter" }, { id: "pro", name: "Pro" }, { id: "platinum", name: "Platinum" }, { id: "enterprise", name: "Enterprise" }];
  return (
    <article className={`addon-editor ${addon.active ? "" : "addon-editor-inactive"}`}>
      <div className="addon-editor-heading"><div><h3>{addon.name}</h3><span>{addon.kind === "once" ? "Cobrança única" : "Cobrança mensal"}</span></div><label className="plans-switch"><input type="checkbox" checked={addon.active} onChange={(event) => onChange({ active: event.target.checked })} /><span aria-hidden="true" /><span>{addon.active ? "Ativo" : "Inativo"}</span></label></div>
      <div className="addon-editor-fields">
        <Field label="Nome"><input value={addon.name} maxLength={100} onChange={(event) => onChange({ name: event.target.value })} /></Field>
        <Field label="Preço (R$)"><input type="number" min="0" step="0.01" value={addon.price} onChange={(event) => onChange({ price: moneyValue(event.target.value) ?? 0 })} /></Field>
        <Field label="Tipo"><AppSelect value={addon.kind} onChange={(event) => onChange({ kind: event.target.value as PlanAddon["kind"] })}><option value="once">Única</option><option value="monthly">Mensal</option></AppSelect></Field>
        <Field label="Unidade (opcional)"><input value={addon.unit ?? ""} maxLength={80} placeholder="por página" onChange={(event) => onChange({ unit: event.target.value || null })} /></Field>
        <Field label="Descrição" className="addon-description"><input value={addon.description ?? ""} maxLength={220} onChange={(event) => onChange({ description: event.target.value })} /></Field>
        <fieldset className="addon-applies"><legend>Disponível nos planos</legend>{plans.map((plan) => <label key={plan.id} className="plans-check"><input type="checkbox" checked={addon.applies_to.includes(plan.id)} onChange={(event) => onChange({ applies_to: event.target.checked ? [...addon.applies_to, plan.id] : addon.applies_to.filter((value) => value !== plan.id) })} /> {plan.name}</label>)}</fieldset>
      </div>
      <div className="addon-editor-footer"><span>{saving ? <><LoaderCircle size={14} className="plans-spinner" /> Salvando…</> : `${currency(addon.price)}${addon.unit ? ` ${addon.unit}` : ""}, ${addon.kind === "once" ? "uma vez" : "por mês"}`}</span><Button className="secondary-button" isDisabled={saving} onPress={onSave}><Save size={14} /> Salvar extra</Button></div>
    </article>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`plans-field ${className}`}><span>{label}</span>{children}</label>;
}

function CompanySettingsPanel() {
  const toast = useAppToast();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/company-settings", { cache: "no-store" });
      const result = await responseData<{ settings: CompanySettings }>(response);
      setSettings(result.settings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados da empresa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  function update(patch: Partial<CompanySettings>) {
    setSettings((current) => current ? { ...current, ...patch } : current);
  }

  function updatePartner(index: number, patch: Partial<CompanySettings["partners"][number]>) {
    setSettings((current) => current ? {
      ...current,
      partners: current.partners.map((partner, partnerIndex) => partnerIndex === index ? { ...partner, ...patch } : partner),
    } : current);
  }

  async function save() {
    if (!settings || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/company-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal_name: settings.legal_name ?? "",
          cnpj: settings.cnpj ?? "",
          address: settings.address ?? "",
          email: settings.email ?? "",
          whatsapp: settings.whatsapp ?? "",
          partners: settings.partners.slice(0, 2).map(({ name, role }) => ({ name, role })),
          clause_defaults: settings.clause_defaults,
        }),
      });
      const result = await responseData<{ settings: CompanySettings }>(response);
      setSettings(result.settings);
      toast("Dados da empresa salvos.", "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível salvar os dados da empresa.";
      setError(message);
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function upload(asset: "signature" | "logo", file: File, partnerIndex?: number) {
    if (!settings || uploading) return;
    const key = asset === "logo" ? "logo" : `signature:${partnerIndex}`;
    setUploading(key);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("asset", asset);
      if (partnerIndex !== undefined) form.set("partnerIndex", String(partnerIndex));
      const response = await fetch("/api/admin/company-settings/upload", { method: "POST", body: form });
      const result = await responseData<{ path: string; url: string | null }>(response);
      if (asset === "logo") update({ logo_path: result.path, logo_url: result.url });
      else if (partnerIndex !== undefined) updatePartner(partnerIndex, { signature_path: result.path, signature_url: result.url });
      toast(asset === "logo" ? "Logo enviada." : "Assinatura enviada.", "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível enviar a imagem.";
      setError(message);
      toast(message, "error");
    } finally {
      setUploading("");
    }
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>, asset: "signature" | "logo", partnerIndex?: number) {
    const file = event.currentTarget.files?.[0];
    if (file) void upload(asset, file, partnerIndex);
    event.currentTarget.value = "";
  }

  if (loading) return <div className="plans-loading" role="status"><LoaderCircle size={18} className="plans-spinner" /> Carregando configurações…</div>;
  if (!settings) return <div className="plans-panel"><div className="plans-error" role="alert"><span>{error}</span><Button className="plans-retry" onPress={() => { setLoading(true); void load(); }}>Tentar novamente</Button></div></div>;

  return (
    <div className="company-settings-panel">
      {error && <div className="plans-error" role="alert"><span>{error}</span></div>}
      <div className="company-settings-grid">
        <section className="company-section">
          <div className="company-section-heading"><div><h2>Empresa</h2><p>Esses dados são reutilizados no documento, sem preencher de novo a cada cliente.</p></div></div>
          <div className="company-fields">
            <Field label="Razão social" className="plans-field-full"><input value={settings.legal_name ?? ""} maxLength={180} onChange={(event) => update({ legal_name: event.target.value })} /></Field>
            <Field label="CNPJ"><input value={settings.cnpj ?? ""} maxLength={32} onChange={(event) => update({ cnpj: event.target.value })} /></Field>
            <Field label="E-mail"><input type="email" value={settings.email ?? ""} maxLength={180} onChange={(event) => update({ email: event.target.value })} /></Field>
            <Field label="Endereço" className="plans-field-full"><input value={settings.address ?? ""} maxLength={260} onChange={(event) => update({ address: event.target.value })} /></Field>
            <Field label="WhatsApp da empresa"><input value={settings.whatsapp ?? ""} maxLength={32} onChange={(event) => update({ whatsapp: event.target.value })} /></Field>
          </div>
          <div className="company-logo-row"><div className="company-logo-preview">{settings.logo_url ? <Image src={settings.logo_url} alt="Logo da empresa" width={64} height={64} unoptimized /> : <ImagePlus size={20} />}</div><div><strong>Logo</strong><span>PNG, JPG ou WebP. Até 5 MB.</span></div><label className="secondary-button company-upload-button"><Upload size={14} />{uploading === "logo" ? "Enviando…" : "Enviar logo"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploading)} onChange={(event) => handleImage(event, "logo")} /></label></div>
        </section>

        <section className="company-section company-partners-section">
          <div className="company-section-heading"><div><h2>Sócios</h2><p>As imagens ficam em armazenamento privado e são lidas pelo servidor.</p></div></div>
          <div className="company-partner-list">{[0, 1].map((index) => {
            const partner = settings.partners[index] ?? { name: "", role: "", signature_path: null, signature_url: null };
            return <article className="company-partner" key={index}>
              <div className="company-partner-heading"><span>Sócio {index + 1}</span>{partner.signature_url ? <Check size={15} aria-label="Assinatura enviada" /> : <span className="company-signature-missing">Sem assinatura</span>}</div>
              <Field label="Nome"><input value={partner.name} maxLength={140} onChange={(event) => updatePartner(index, { name: event.target.value })} /></Field>
              <Field label="Cargo"><input value={partner.role} maxLength={100} onChange={(event) => updatePartner(index, { role: event.target.value })} /></Field>
              <div className="company-signature-row">{partner.signature_url ? <Image src={partner.signature_url} alt={`Assinatura de ${partner.name || `sócio ${index + 1}`}`} width={170} height={56} unoptimized /> : <span>A assinatura aparecerá na prévia do contrato.</span>}<label className="secondary-button company-upload-button"><Upload size={14} />{uploading === `signature:${index}` ? "Enviando…" : partner.signature_url ? "Trocar PNG" : "Enviar PNG"}<input type="file" accept="image/png" disabled={Boolean(uploading)} onChange={(event) => handleImage(event, "signature", index)} /></label></div>
            </article>;
          })}</div>
        </section>

        <section className="company-section company-clauses-section">
          <div className="company-section-heading"><div><h2>Cláusulas padrão</h2><p>Valores iniciais sugeridos pelo briefing; revise antes de usar o contrato.</p></div></div>
          <div className="company-fields company-clause-fields">
            <Field label="Índice de reajuste"><input value={settings.clause_defaults.idx ?? ""} maxLength={160} onChange={(event) => update({ clause_defaults: { ...settings.clause_defaults, idx: event.target.value } })} /></Field>
            <Field label="Permanência mínima (meses)"><input value={settings.clause_defaults.perm ?? ""} maxLength={160} onChange={(event) => update({ clause_defaults: { ...settings.clause_defaults, perm: event.target.value } })} /></Field>
            <Field label="Multa (% das parcelas restantes)"><input value={settings.clause_defaults.multa ?? ""} maxLength={160} onChange={(event) => update({ clause_defaults: { ...settings.clause_defaults, multa: event.target.value } })} /></Field>
            <Field label="Aviso prévio (dias)"><input value={settings.clause_defaults.aviso ?? ""} maxLength={160} onChange={(event) => update({ clause_defaults: { ...settings.clause_defaults, aviso: event.target.value } })} /></Field>
            <Field label="Foro"><input value={settings.clause_defaults.foro ?? ""} maxLength={160} onChange={(event) => update({ clause_defaults: { ...settings.clause_defaults, foro: event.target.value } })} /></Field>
          </div>
        </section>
      </div>
      <footer className="company-settings-footer"><span>Salve as alterações antes de sair desta tela.</span><Button className="primary-button" isDisabled={saving || Boolean(uploading)} onPress={() => void save()}>{saving ? <><LoaderCircle size={15} className="plans-spinner" /> Salvando…</> : <><Save size={15} /> Salvar configurações</>}</Button></footer>
    </div>
  );
}
