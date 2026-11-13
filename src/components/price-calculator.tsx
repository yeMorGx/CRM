"use client";

import { useEffect, useMemo, useState } from "react";
import { CrmState } from "./commercial-dashboard";
import { currency } from "@/lib/crm-insights";
import type { Plan, PlanAddon } from "@/lib/plans-types";

type Pricing = { plans: Plan[]; addons: PlanAddon[] };
type Pick = Record<string, number>;

const unitLabel = (addon: PlanAddon) => (addon.kind === "monthly" ? "por mês" : "pagamento único");

/** Mesma regra do servidor (crm_save_lead_plan): base do plano + extras × quantidade. */
function calculate(plan: Plan | undefined, addons: PlanAddon[], picks: Pick, customSetup: number, customMonthly: number) {
  if (!plan) return { setup: 0, monthly: 0, lines: [] as { id: string; name: string; qty: number; kind: PlanAddon["kind"]; total: number }[] };
  let setup = plan.on_request ? customSetup : plan.setup_price ?? 0;
  let monthly = plan.on_request ? customMonthly : plan.monthly_price ?? 0;
  const lines = addons
    .filter((addon) => picks[addon.id] > 0)
    .map((addon) => {
      const qty = picks[addon.id];
      const total = addon.price * qty;
      if (addon.kind === "once") setup += total;
      else monthly += total;
      return { id: addon.id, name: addon.name, qty, kind: addon.kind, total };
    });
  return { setup, monthly, lines };
}

export function PriceCalculator() {
  const [data, setData] = useState<Pricing | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState("");
  const [picks, setPicks] = useState<Pick>({});
  const [customSetup, setCustomSetup] = useState("");
  const [customMonthly, setCustomMonthly] = useState("");

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void fetch("/api/crm/pricing", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result as Pricing;
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        setPlanId((current) => current || result.plans[0]?.id || "");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar planos e extras.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setLoading(true);
    setError("");
    setAttempt((value) => value + 1);
  }

  const plan = data?.plans.find((item) => item.id === planId);
  const extras = useMemo(() => (data?.addons ?? []).filter((addon) => addon.applies_to.includes(planId)), [data, planId]);
  const result = useMemo(
    () => calculate(plan, extras, picks, Number(customSetup) || 0, Number(customMonthly) || 0),
    [plan, extras, picks, customSetup, customMonthly],
  );

  function choosePlan(id: string) {
    setPlanId(id);
    setPicks({});
  }

  function togglePick(addon: PlanAddon, checked: boolean) {
    setPicks((current) => {
      const next = { ...current };
      if (checked) next[addon.id] = 1;
      else delete next[addon.id];
      return next;
    });
  }

  function setQty(addon: PlanAddon, value: string) {
    const qty = Math.min(20, Math.max(1, Math.floor(Number(value) || 1)));
    setPicks((current) => ({ ...current, [addon.id]: qty }));
  }

  const heading = (
    <header className="crm-page-heading">
      <div>
        <p>Comercial</p>
        <h1>Calculadora de valor</h1>
        <span>Monte o valor do site com os planos e extras cadastrados. Os valores vêm do cadastro em Gestão, sem estimativas próprias.</span>
      </div>
    </header>
  );

  if (loading || error || !data) {
    return (
      <div className="crm-commercial">
        {heading}
        <CrmState loading={loading} error={error} retry={retry} />
      </div>
    );
  }

  if (!data.plans.length) {
    return (
      <div className="crm-commercial">
        {heading}
        <div className="crm-empty" role="status">
          <p>Nenhum plano ativo foi cadastrado. Peça a um administrador para cadastrar os planos em Gestão → Planos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-commercial price-calculator">
      {heading}
      <div className="price-calc-layout">
        <div className="price-calc-steps">
          <section className="crm-panel" aria-labelledby="calc-plan-title">
            <header>
              <div>
                <h2 id="calc-plan-title">1. Plano</h2>
                <p className="crm-scope-note">Escolha a base do site.</p>
              </div>
            </header>
            <div className="price-plan-options" role="radiogroup" aria-label="Plano">
              {data.plans.map((item) => (
                <label key={item.id} className={`price-plan-option ${item.id === planId ? "is-selected" : ""}`}>
                  <input type="radio" name="calc-plan" value={item.id} checked={item.id === planId} onChange={() => choosePlan(item.id)} />
                  <span className="price-plan-name">{item.name}</span>
                  {item.tagline && <span className="price-plan-tagline">{item.tagline}</span>}
                  <span className="price-plan-price">
                    {item.on_request
                      ? "Sob consulta"
                      : `${item.setup_is_from ? "A partir de " : ""}${currency(item.setup_price)} + ${currency(item.monthly_price)}/mês`}
                  </span>
                </label>
              ))}
            </div>
            {plan?.on_request && (
              <div className="crm-form-grid price-custom">
                <label>
                  Implantação (R$)
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={customSetup} onChange={(event) => setCustomSetup(event.target.value)} placeholder="0,00" />
                </label>
                <label>
                  Mensalidade (R$)
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={customMonthly} onChange={(event) => setCustomMonthly(event.target.value)} placeholder="0,00" />
                </label>
              </div>
            )}
          </section>

          <section className="crm-panel" aria-labelledby="calc-extras-title">
            <header>
              <div>
                <h2 id="calc-extras-title">2. Extras</h2>
                <p className="crm-scope-note">Opcionais disponíveis para o plano escolhido.</p>
              </div>
            </header>
            {extras.length === 0 ? (
              <p className="crm-scope-note">Este plano não tem extras cadastrados.</p>
            ) : (
              <div className="crm-addon-choices">
                {extras.map((addon) => {
                  const qty = picks[addon.id];
                  return (
                    <div key={addon.id}>
                      <label>
                        <input type="checkbox" checked={Boolean(qty)} onChange={(event) => togglePick(addon, event.target.checked)} />
                        <span>
                          <strong>{addon.name}</strong>
                          {addon.description && <small className="price-addon-note">{addon.description}</small>}
                        </span>
                      </label>
                      <span className="price-addon-price">
                        {currency(addon.price)} <small>{addon.unit ? `${addon.unit} · ` : ""}{unitLabel(addon)}</small>
                      </span>
                      {qty ? (
                        <input className="price-qty" type="number" min={1} max={20} value={qty} aria-label={`Quantidade de ${addon.name}`} onChange={(event) => setQty(addon, event.target.value)} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="crm-panel price-summary" aria-live="polite" aria-labelledby="calc-total-title">
          <h2 id="calc-total-title">Valor do site</h2>
          <p className="crm-scope-note">{plan?.name}</p>
          <dl className="price-totals">
            <div>
              <dt>Implantação</dt>
              <dd>{currency(result.setup)}</dd>
            </div>
            <div>
              <dt>Mensalidade</dt>
              <dd>{currency(result.monthly)}<small>/mês</small></dd>
            </div>
          </dl>
          {result.lines.length > 0 && (
            <ul className="price-lines">
              {result.lines.map((line) => (
                <li key={line.id}>
                  <span>{line.name}{line.qty > 1 ? ` × ${line.qty}` : ""}</span>
                  <span>{currency(line.total)}{line.kind === "monthly" ? "/mês" : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {plan?.setup_is_from && !plan.on_request && <p className="crm-scope-note">O plano é “a partir de”: o valor final pode variar conforme o escopo.</p>}
          <button type="button" className="secondary-button" onClick={() => setPicks({})} disabled={!result.lines.length}>
            Limpar extras
          </button>
        </aside>
      </div>
    </div>
  );
}
