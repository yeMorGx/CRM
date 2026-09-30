import { Settings2 } from "lucide-react";

export function ConfigurationRequired() {
  return (
    <main className="configuration-page">
      <div className="configuration-card">
        <div className="configuration-icon"><Settings2 size={22} /></div>
        <p className="eyebrow">Configuração pendente</p>
        <h1>O Prospecta está pronto para receber os dados reais.</h1>
        <p>Configure as variáveis do Supabase na Vercel para liberar o acesso privado e começar com o CRM vazio.</p>
        <code>NEXT_PUBLIC_SUPABASE_URL<br />NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
      </div>
    </main>
  );
}
