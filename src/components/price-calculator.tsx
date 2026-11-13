"use client";

import { useEffect, useMemo, useState } from "react";
import { currency } from "@/lib/crm-insights";

type Item = { id: string; name: string; hint: string; hours: number; unit?: string };
type Group = { id: string; title: string; items: Item[] };

/** Horas de referência por entrega. São pontos de partida editáveis, não dados do banco. */
const catalog: Group[] = [
  {
    id: "structure",
    title: "Páginas e estrutura",
    items: [
      { id: "home", name: "Página inicial", hint: "Primeira dobra, seções e chamadas para ação", hours: 10 },
      { id: "inner", name: "Páginas internas", hint: "Sobre, serviços, contato e similares", hours: 4, unit: "páginas" },
      { id: "detail", name: "Páginas de serviço ou produto detalhadas", hint: "Conteúdo longo, galeria e CTA próprios", hours: 5, unit: "páginas" },
      { id: "landing", name: "Landing page de campanha", hint: "Página única focada em conversão", hours: 12, unit: "páginas" },
      { id: "faq", name: "FAQ e depoimentos", hint: "Seções com perguntas e provas sociais", hours: 3 },
    ],
  },
  {
    id: "design",
    title: "Design",
    items: [
      { id: "brand", name: "Identidade visual básica", hint: "Logo, paleta e tipografia", hours: 12 },
      { id: "custom-layout", name: "Layout 100% personalizado", hint: "Em vez de template adaptado", hours: 16 },
      { id: "motion", name: "Animações e microinterações", hint: "Transições e efeitos de rolagem", hours: 8 },
    ],
  },
  {
    id: "features",
    title: "Funcionalidades",
    items: [
      { id: "form", name: "Formulário de contato", hint: "Com envio por e-mail e proteção contra spam", hours: 2 },
      { id: "whatsapp", name: "Botão e integração com WhatsApp", hint: "Link direto com mensagem pronta", hours: 1 },
      { id: "map", name: "Mapa e localização", hint: "Google Maps incorporado", hours: 1 },
      { id: "gallery", name: "Galeria ou portfólio", hint: "Grade de imagens com visualização ampliada", hours: 6 },
      { id: "blog", name: "Blog com painel de publicação", hint: "Lista, página do post e categorias", hours: 10 },
      { id: "cms", name: "Painel administrativo (CMS)", hint: "O cliente edita textos e imagens", hours: 16 },
      { id: "booking", name: "Agendamento online", hint: "Horários, confirmação e lembretes", hours: 12 },
      { id: "members", name: "Área de login ou membros", hint: "Cadastro, autenticação e conteúdo restrito", hours: 24 },
      { id: "shop", name: "Loja virtual (base)", hint: "Catálogo, carrinho e checkout", hours: 40 },
      { id: "products", name: "Cadastro de produtos", hint: "Por lote de 10 produtos", hours: 3, unit: "lotes" },
      { id: "payment", name: "Pagamento online", hint: "Pix e cartão via gateway", hours: 10 },
      { id: "language", name: "Idioma extra", hint: "Tradução e estrutura por idioma", hours: 8, unit: "idiomas" },
      { id: "chat", name: "Chat ao vivo ou chatbot", hint: "Integração com ferramenta externa", hours: 4 },
      { id: "email-marketing", name: "Integração com e-mail marketing ou CRM", hint: "Envio dos contatos para a ferramenta", hours: 6 },
      { id: "api", name: "Integração com sistema externo (API)", hint: "Sincronização de dados sob medida", hours: 16 },
    ],
  },
  {
    id: "seo",
    title: "SEO e medição",
    items: [
      { id: "seo-basic", name: "SEO básico", hint: "Títulos, descrições, estrutura e sitemap", hours: 6 },
      { id: "seo-local", name: "SEO local", hint: "Perfil no Google e dados estruturados", hours: 4 },
      { id: "analytics", name: "Analytics e pixels", hint: "Google Analytics, Meta Pixel e eventos", hours: 3 },
      { id: "speed", name: "Otimização de velocidade", hint: "Imagens, cache e nota no PageSpeed", hours: 4 },
    ],
  },
  {
    id: "content",
    title: "Conteúdo",
    items: [
      { id: "copy", name: "Redação dos textos", hint: "Por página escrita", hours: 2, unit: "páginas" },
      { id: "images", name: "Tratamento de imagens", hint: "Por lote de 10 fotos", hours: 3, unit: "lotes" },
      { id: "video", name: "Vídeo incorporado", hint: "Embed e capa otimizada; produção à parte", hours: 2 },
    ],
  },
  {
    id: "delivery",
    title: "Entrega e infraestrutura",
    items: [
      { id: "domain", name: "Domínio, hospedagem e SSL", hint: "Configuração e publicação", hours: 3 },
      { id: "mailbox", name: "E-mail profissional", hint: "Contas no domínio do cliente", hours: 2 },
      { id: "training", name: "Treinamento do cliente", hint: "Sessão de uso do painel", hours: 2 },
      { id: "revision", name: "Rodada de revisão extra", hint: "Além das já incluídas no escopo", hours: 3, unit: "rodadas" },
    ],
  },
];

type Params = {
  rate: string;
  complexity: string;
  urgency: string;
  contingency: string;
  tax: string;
  margin: string;
  support: string;
};
type Custom = { id: string; name: string; hours: string };

const defaultParams: Params = { rate: "80", complexity: "1", urgency: "0", contingency: "15", tax: "6", margin: "30", support: "2" };
const complexityOptions = [
  ["1", "Padrão"],
  ["1.25", "Complexa"],
  ["1.5", "Muito complexa"],
] as const;
const urgencyOptions = [
  ["0", "Prazo normal"],
  ["0.25", "Prazo curto (+25%)"],
  ["0.5", "Urgente (+50%)"],
] as const;
const storageKey = "prospecta.calculator.params";

function loadParams(): Params {
  try {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem(storageKey);
    return saved ? { ...defaultParams, ...JSON.parse(saved) } : defaultParams;
  } catch {
    return defaultParams;
  }
}

const num = (value: string) => {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const roundTo10 = (value: number) => Math.round(value / 10) * 10;
const hoursLabel = (hours: number) => `${(Math.round(hours * 10) / 10).toLocaleString("pt-BR")} h`;

export function PriceCalculator() {
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [customs, setCustoms] = useState<Custom[]>([]);
  const [params, setParams] = useState<Params>(loadParams);
  const [external, setExternal] = useState({ domain: "", hosting: "", licenses: "", media: "" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(params));
    } catch {
      /* sem persistência: a calculadora segue funcionando */
    }
  }, [params]);

  const calc = useMemo(() => {
    const rate = num(params.rate);
    const complexity = num(params.complexity) || 1;
    const urgency = num(params.urgency);
    const contingency = num(params.contingency) / 100;
    const tax = Math.min(num(params.tax), 60) / 100;
    const margin = num(params.margin) / 100;

    const groups = catalog.map((group) => {
      const lines = group.items
        .filter((item) => picks[item.id] > 0)
        .map((item) => ({ item, qty: picks[item.id], hours: item.hours * picks[item.id] }));
      return { group, lines, hours: lines.reduce((sum, line) => sum + line.hours, 0) };
    });
    const customLines = customs.filter((custom) => num(custom.hours) > 0).map((custom) => ({ custom, hours: num(custom.hours) }));
    const baseHours = groups.reduce((sum, group) => sum + group.hours, 0) + customLines.reduce((sum, line) => sum + line.hours, 0);
    const hours = baseHours * complexity;
    const labor = hours * rate * (1 + urgency) * (1 + contingency);
    const pass = num(external.domain) + num(external.hosting) + num(external.licenses) + num(external.media);
    const price = (marginFactor: number) => roundTo10((labor * (1 + marginFactor) + pass) / (1 - tax));
    const minimum = price(0);
    const recommended = price(margin);
    const premium = price(margin * 2);
    const hosting = num(external.hosting);
    const monthly = roundTo10((num(params.support) * rate + hosting / 12) / (1 - tax));

    return { groups, customLines, baseHours, hours, labor, pass, minimum, recommended, premium, monthly, rate, tax, hasItems: baseHours > 0 };
  }, [picks, customs, params, external]);

  function setParam(key: keyof Params, value: string) {
    setParams((current) => ({ ...current, [key]: value }));
  }

  function togglePick(item: Item, checked: boolean) {
    setPicks((current) => {
      const next = { ...current };
      if (checked) next[item.id] = 1;
      else delete next[item.id];
      return next;
    });
  }

  function setQty(item: Item, value: string) {
    const qty = Math.min(99, Math.max(1, Math.floor(Number(value) || 1)));
    setPicks((current) => ({ ...current, [item.id]: qty }));
  }

  function addCustom() {
    setCustoms((current) => [...current, { id: `${Date.now()}-${current.length}`, name: "", hours: "" }]);
  }

  function reset() {
    setPicks({});
    setCustoms([]);
    setExternal({ domain: "", hosting: "", licenses: "", media: "" });
  }

  async function copySummary() {
    const lines = [
      "Orçamento do site",
      "",
      ...calc.groups.flatMap((entry) =>
        entry.lines.map((line) => `- ${line.item.name}${line.item.unit ? ` (${line.qty} ${line.item.unit})` : ""}`),
      ),
      ...calc.customLines.map((line) => `- ${line.custom.name || "Item personalizado"}`),
      "",
      `Investimento recomendado: ${currency(calc.recommended)}`,
      `Entrada de 50%: ${currency(calc.recommended / 2)}`,
      calc.monthly > 0 ? `Manutenção mensal sugerida: ${currency(calc.monthly)}` : "",
    ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="crm-commercial price-calculator">
      <header className="crm-page-heading">
        <div>
          <p>Comercial</p>
          <h1>Calculadora de orçamento do site</h1>
          <span>Marque o que vai entregar ao lead e veja quanto cobrar. As horas e percentuais são pontos de partida: ajuste à sua realidade.</span>
        </div>
      </header>

      <div className="price-calc-layout">
        <div className="price-calc-steps">
          <section className="crm-panel" aria-labelledby="calc-rates-title">
            <header>
              <div>
                <h2 id="calc-rates-title">Seus parâmetros</h2>
                <p className="crm-scope-note">Ficam salvos neste navegador.</p>
              </div>
            </header>
            <div className="price-params">
              <label>
                Valor da sua hora (R$)
                <input type="number" min="0" step="1" inputMode="decimal" value={params.rate} onChange={(event) => setParam("rate", event.target.value)} />
              </label>
              <label>
                Complexidade
                <select value={params.complexity} onChange={(event) => setParam("complexity", event.target.value)}>
                  {complexityOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label} (×{value})</option>
                  ))}
                </select>
              </label>
              <label>
                Prazo
                <select value={params.urgency} onChange={(event) => setParam("urgency", event.target.value)}>
                  {urgencyOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Imprevistos e revisões (%)
                <input type="number" min="0" max="100" inputMode="decimal" value={params.contingency} onChange={(event) => setParam("contingency", event.target.value)} />
              </label>
              <label>
                Impostos e taxas (%)
                <input type="number" min="0" max="60" inputMode="decimal" value={params.tax} onChange={(event) => setParam("tax", event.target.value)} />
              </label>
              <label>
                Margem de lucro (%)
                <input type="number" min="0" inputMode="decimal" value={params.margin} onChange={(event) => setParam("margin", event.target.value)} />
              </label>
            </div>
          </section>

          {catalog.map((group) => (
            <section className="crm-panel" key={group.id} aria-labelledby={`calc-${group.id}`}>
              <header>
                <h2 id={`calc-${group.id}`}>{group.title}</h2>
              </header>
              <div className="crm-addon-choices">
                {group.items.map((item) => {
                  const qty = picks[item.id];
                  return (
                    <div key={item.id}>
                      <label>
                        <input type="checkbox" checked={Boolean(qty)} onChange={(event) => togglePick(item, event.target.checked)} />
                        <span>
                          <strong>{item.name}</strong>
                          <small className="price-addon-note">{item.hint}</small>
                        </span>
                      </label>
                      <span className="price-addon-price">
                        {hoursLabel(item.hours)}
                        <small>{item.unit ? `por ${item.unit.replace(/s$/, "")}` : "fixo"}</small>
                      </span>
                      {qty && item.unit ? (
                        <input className="price-qty" type="number" min={1} max={99} value={qty} aria-label={`Quantidade de ${item.name}`} onChange={(event) => setQty(item, event.target.value)} />
                      ) : (
                        <span className="price-qty-spacer" aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="crm-panel" aria-labelledby="calc-custom-title">
            <header>
              <div>
                <h2 id="calc-custom-title">Itens personalizados</h2>
                <p className="crm-scope-note">Algo que não está na lista? Descreva e estime as horas.</p>
              </div>
              <button type="button" className="secondary-button" onClick={addCustom}>Adicionar item</button>
            </header>
            {customs.length === 0 ? (
              <p className="crm-scope-note">Nenhum item personalizado.</p>
            ) : (
              <div className="price-custom-list">
                {customs.map((custom) => (
                  <div key={custom.id} className="price-custom-row">
                    <input
                      type="text"
                      value={custom.name}
                      placeholder="Descrição do item"
                      aria-label="Descrição do item personalizado"
                      onChange={(event) => setCustoms((current) => current.map((entry) => (entry.id === custom.id ? { ...entry, name: event.target.value } : entry)))}
                    />
                    <input
                      className="price-qty"
                      type="number"
                      min="0"
                      step="0.5"
                      inputMode="decimal"
                      value={custom.hours}
                      placeholder="Horas"
                      aria-label="Horas do item personalizado"
                      onChange={(event) => setCustoms((current) => current.map((entry) => (entry.id === custom.id ? { ...entry, hours: event.target.value } : entry)))}
                    />
                    <button type="button" className="secondary-button" onClick={() => setCustoms((current) => current.filter((entry) => entry.id !== custom.id))}>Remover</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="crm-panel" aria-labelledby="calc-external-title">
            <header>
              <div>
                <h2 id="calc-external-title">Custos repassados ao cliente</h2>
                <p className="crm-scope-note">Valores em reais que você paga a terceiros pelo projeto. Entram no preço sem margem.</p>
              </div>
            </header>
            <div className="price-params">
              {([
                ["domain", "Domínio (por ano)"],
                ["hosting", "Hospedagem (por ano)"],
                ["licenses", "Licenças e plugins"],
                ["media", "Banco de imagens e fontes"],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input type="number" min="0" step="1" inputMode="decimal" value={external[key]} placeholder="0" onChange={(event) => setExternal((current) => ({ ...current, [key]: event.target.value }))} />
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="crm-panel price-summary" aria-live="polite" aria-labelledby="calc-total-title">
          <h2 id="calc-total-title">Quanto cobrar</h2>
          {!calc.hasItems ? (
            <p className="crm-scope-note">Marque pelo menos uma entrega para ver o valor.</p>
          ) : (
            <>
              <dl className="price-totals">
                <div className="price-total-main">
                  <dt>Recomendado</dt>
                  <dd>{currency(calc.recommended)}</dd>
                </div>
                <div>
                  <dt>Mínimo (sem margem)</dt>
                  <dd className="price-total-sub">{currency(calc.minimum)}</dd>
                </div>
                <div>
                  <dt>Premium</dt>
                  <dd className="price-total-sub">{currency(calc.premium)}</dd>
                </div>
              </dl>
              <ul className="price-lines">
                <li><span>Horas de entrega</span><span>{hoursLabel(calc.baseHours)}</span></li>
                {calc.hours !== calc.baseHours && <li><span>Com complexidade</span><span>{hoursLabel(calc.hours)}</span></li>}
                <li><span>Seu trabalho com folga</span><span>{currency(calc.labor)}</span></li>
                {calc.pass > 0 && <li><span>Custos repassados</span><span>{currency(calc.pass)}</span></li>}
                <li><span>Entrada de 50%</span><span>{currency(calc.recommended / 2)}</span></li>
                <li><span>Valor por hora efetivo</span><span>{currency(calc.hours > 0 ? calc.recommended / calc.hours : 0)}</span></li>
              </ul>
              <ul className="price-lines">
                {calc.groups.filter((entry) => entry.hours > 0).map((entry) => (
                  <li key={entry.group.id}><span>{entry.group.title}</span><span>{hoursLabel(entry.hours)}</span></li>
                ))}
                {calc.customLines.length > 0 && <li><span>Itens personalizados</span><span>{hoursLabel(calc.customLines.reduce((sum, line) => sum + line.hours, 0))}</span></li>}
              </ul>
              <div className="price-maintenance">
                <label>
                  Horas de manutenção por mês
                  <input type="number" min="0" step="0.5" inputMode="decimal" value={params.support} onChange={(event) => setParam("support", event.target.value)} />
                </label>
                <p className="crm-scope-note">Manutenção mensal sugerida: <strong>{currency(calc.monthly)}</strong></p>
              </div>
              <p className="crm-scope-note">Preço = (seu trabalho × (1 + margem) + custos repassados) ÷ (1 − impostos). O arredondamento é de R$ 10.</p>
            </>
          )}
          <div className="price-summary-actions">
            <button type="button" className="secondary-button" onClick={() => void copySummary()} disabled={!calc.hasItems}>{copied ? "Copiado" : "Copiar resumo"}</button>
            <button type="button" className="secondary-button" onClick={reset} disabled={!calc.hasItems && !calc.pass}>Limpar</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
