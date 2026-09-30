"use client";

import { Check, Clipboard, KeyRound, LoaderCircle, Mail, Pencil, Shield, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ProspectaSelect } from "@/components/ui/prospecta-select";

type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "member";
  is_allowed: boolean;
  created_at: string;
  email_confirmed_at: string | null;
  is_bootstrap_admin: boolean;
  onboarding_completed: boolean;
};

type UserDraft = { full_name: string; email: string; role: "admin" | "member"; is_allowed: boolean };
const blankDraft: UserDraft = { full_name: "", email: "", role: "member", is_allowed: true };

async function fetchManagedUsers() {
  const response = await fetch("/api/admin/users", { cache: "no-store" });
  const payload = await response.json() as { users?: ManagedUser[]; error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível carregar a lista de usuários.");
  return payload.users ?? [];
}

function createdLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function UserManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [draft, setDraft] = useState<UserDraft>(blankDraft);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [inviteMethod, setInviteMethod] = useState<"email" | "code">("code");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteRecipient, setInviteRecipient] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await fetchManagedUsers());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a lista de usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchManagedUsers()
      .then((data) => { if (active) { setUsers(data); setError(""); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar a lista de usuários."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function closeForm() {
    setIsFormOpen(false);
    setEditing(null);
    setDraft(blankDraft);
    setInviteCode("");
    setInviteUrl("");
    setInviteRecipient("");
    setInviteMethod("code");
    setCodeCopied(false);
    setLinkCopied(false);
    setError("");
  }

  function startEdit(user: ManagedUser) {
    setIsFormOpen(true);
    setEditing(user);
    setDraft({ full_name: user.full_name, email: user.email, role: user.role, is_allowed: user.is_allowed });
    setInviteCode("");
    setInviteUrl("");
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(editing ? `/api/admin/users/${editing.id}` : "/api/admin/users", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing
          ? { full_name: draft.full_name, role: draft.role, is_allowed: draft.is_allowed }
          : { email: draft.email, method: inviteMethod }),
      });
      const payload = await response.json() as { error?: string; message?: string; invite_code?: string; invite_url?: string; email?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar esse usuário.");
      if (!editing && inviteMethod === "code" && payload.invite_code) {
        setInviteCode(payload.invite_code);
        setInviteUrl(payload.invite_url || "");
        setInviteRecipient(payload.email || draft.email.trim());
        setNotice("");
        await loadUsers();
        return;
      }
      closeForm();
      setNotice(payload.message || (editing ? "Usuário atualizado." : "Convite enviado."));
      await loadUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar esse usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccess(user: ManagedUser) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_allowed: !user.is_allowed }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o acesso.");
      setNotice(user.is_allowed ? `Acesso de ${user.full_name} suspenso.` : `Acesso de ${user.full_name} reativado.`);
      await loadUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar o acesso.");
    }
  }

  async function deleteUser(user: ManagedUser) {
    const confirmed = window.confirm(`Apagar ${user.full_name} (${user.email})? As mensagens, atividades e tarefas criadas por essa conta também serão removidas. Essa ação não pode ser desfeita.`);
    if (!confirmed) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível apagar esse usuário.");
      setNotice(`${user.full_name} foi removido do CRM.`);
      await loadUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível apagar esse usuário.");
    }
  }

  const activeUsers = users.filter((user) => user.is_allowed && user.onboarding_completed).length;
  async function copyInviteCode() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1800);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione e copie o código exibido.");
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setError("Não foi possível copiar automaticamente. Copie o endereço exibido no cartão do convite.");
    }
  }

  return (
    <section className="admin-users-page">
      <header className="admin-users-heading">
        <div><h1>Usuários</h1><p>Convide pessoas, defina privilégios e controle o acesso ao Prospecta.</p></div>
        <button className="primary-button" type="button" onClick={() => { setEditing(null); setDraft(blankDraft); setInviteMethod("code"); setInviteCode(""); setInviteUrl(""); setInviteRecipient(""); setCodeCopied(false); setLinkCopied(false); setIsFormOpen(true); setError(""); setNotice(""); }}><UserPlus size={16} />Adicionar usuário</button>
      </header>

      <div className="admin-users-summary"><span>{users.length} {users.length === 1 ? "conta" : "contas"}</span><span>{activeUsers} com acesso ativo</span></div>
      {notice && <p className="admin-users-notice" role="status">{notice}</p>}
      {error && !isFormOpen && <p className="admin-users-error" role="alert">{error}</p>}
      {isFormOpen && (editing
        ? <UserForm editing={editing} draft={draft} saving={saving} error={error} protectedPrivileges={editing.is_bootstrap_admin || editing.id === currentUserId} onChange={setDraft} onClose={closeForm} onSubmit={submit} />
        : <InviteForm email={draft.email} method={inviteMethod} code={inviteCode} inviteUrl={inviteUrl} recipient={inviteRecipient} copied={codeCopied} linkCopied={linkCopied} saving={saving} error={error} onEmailChange={(email) => setDraft({ ...draft, email })} onMethodChange={setInviteMethod} onCopy={() => { void copyInviteCode(); }} onCopyLink={() => { void copyInviteUrl(); }} onClose={closeForm} onSubmit={submit} />)}

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead><tr><th>Pessoa</th><th>Privilégio</th><th>Acesso</th><th>Desde</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="admin-users-empty"><LoaderCircle size={17} className="admin-users-spinner" />Carregando usuários…</td></tr> : users.length ? users.map((user) => (
              <tr key={user.id}>
                <td><div className="admin-user-person"><strong>{user.full_name}{user.id === currentUserId && <span className="admin-user-you">Você</span>}</strong><span>{user.email}{!user.email_confirmed_at && <span className="admin-user-invited"> · Convite pendente</span>}</span></div></td>
                <td><span className={`admin-user-role ${user.role}`}><ShieldCheck size={13} />{user.role === "admin" ? "Administrador" : "Membro"}{user.is_bootstrap_admin && <span className="sr-only"> inicial</span>}</span></td>
                <td><span className={`admin-user-access ${!user.onboarding_completed ? "pending" : user.is_allowed ? "active" : "paused"}`}><i />{!user.onboarding_completed ? user.email_confirmed_at ? "Perfil pendente" : "Convite pendente" : user.is_allowed ? "Ativo" : "Suspenso"}</span></td>
                <td className="admin-user-date">{createdLabel(user.created_at)}</td>
                <td><div className="admin-user-actions">
                  <button type="button" className="admin-user-action" title="Editar usuário" aria-label={`Editar ${user.full_name}`} onClick={() => startEdit(user)}><Pencil size={14} /></button>
                  {user.id !== currentUserId && <>
                    {user.onboarding_completed && !user.is_bootstrap_admin && <button type="button" className="admin-user-action" title={user.is_allowed ? "Suspender acesso" : "Reativar acesso"} aria-label={user.is_allowed ? `Suspender ${user.full_name}` : `Reativar ${user.full_name}`} onClick={() => void toggleAccess(user)}><Shield size={14} /></button>}
                    {!user.is_bootstrap_admin && <button type="button" className="admin-user-action danger" title="Apagar usuário" aria-label={`Apagar ${user.full_name}`} onClick={() => void deleteUser(user)}><Trash2 size={14} /></button>}
                  </>}
                </div></td>
              </tr>
            )) : <tr><td colSpan={5} className="admin-users-empty">Nenhum usuário encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserForm({ editing, draft, saving, error, protectedPrivileges, onChange, onClose, onSubmit }: {
  editing: ManagedUser;
  draft: UserDraft;
  saving: boolean;
  error: string;
  protectedPrivileges: boolean;
  onChange: (draft: UserDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="admin-user-form" onSubmit={onSubmit}>
      <header><div><h2>Editar usuário</h2><p>Atualize o nome, o acesso e os privilégios.</p></div><button className="admin-user-action" type="button" onClick={onClose} aria-label="Fechar formulário"><X size={16} /></button></header>
      <div className="admin-user-fields">
        <label>Nome<input value={draft.full_name} onChange={(event) => onChange({ ...draft, full_name: event.target.value })} autoComplete="name" maxLength={100} required /></label>
        <label>E-mail<input value={draft.email} readOnly aria-readonly="true" /></label>
        <ProspectaSelect label="Privilégio" value={draft.role} disabled={protectedPrivileges} options={[{ value: "member", label: "Membro" }, { value: "admin", label: "Administrador" }]} onChange={(role) => onChange({ ...draft, role: role as UserDraft["role"] })} />
        {editing && <label className="admin-user-access-toggle"><input type="checkbox" checked={draft.is_allowed} disabled={protectedPrivileges || !editing.onboarding_completed} onChange={(event) => onChange({ ...draft, is_allowed: event.target.checked })} /><span>{editing.onboarding_completed ? "Acesso ativo" : "Acesso após primeiro acesso"}{(!editing.onboarding_completed || protectedPrivileges) && <small>{editing.onboarding_completed ? "protegido" : "pendente"}</small>}</span></label>}
      </div>
      {error && <p className="admin-users-error" role="alert">{error}</p>}
      <footer><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-button" type="submit" disabled={saving || !draft.full_name.trim()}>{saving ? <LoaderCircle size={15} className="admin-users-spinner" /> : null}{saving ? "Salvando…" : "Salvar alterações"}</button></footer>
    </form>
  );
}

function InviteForm({ email, method, code, inviteUrl, recipient, copied, linkCopied, saving, error, onEmailChange, onMethodChange, onCopy, onCopyLink, onClose, onSubmit }: {
  email: string;
  method: "email" | "code";
  code: string;
  inviteUrl: string;
  recipient: string;
  copied: boolean;
  linkCopied: boolean;
  saving: boolean;
  error: string;
  onEmailChange: (email: string) => void;
  onMethodChange: (method: "email" | "code") => void;
  onCopy: () => void;
  onCopyLink: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="admin-user-form admin-invite-form" onSubmit={onSubmit}>
      <header><div><h2>Convidar usuário</h2><p>Informe somente o e-mail e escolha como entregar o convite.</p></div><button className="admin-user-action" type="button" onClick={onClose} aria-label="Fechar formulário"><X size={16} /></button></header>
      <div className="admin-invite-address"><label htmlFor="admin-invite-email">E-mail</label><input id="admin-invite-email" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} autoComplete="email" maxLength={254} placeholder="pessoa@empresa.com" required disabled={Boolean(code)} /></div>
      <div className="admin-invite-method" role="group" aria-label="Forma de convidar">
        <button type="button" className={method === "code" ? "is-selected" : ""} aria-pressed={method === "code"} onClick={() => { onMethodChange("code"); }} disabled={Boolean(code)}><KeyRound size={15} /><span><strong>Gerar código</strong><small>Para compartilhar diretamente</small></span></button>
        <button type="button" className={method === "email" ? "is-selected" : ""} aria-pressed={method === "email"} onClick={() => { onMethodChange("email"); }} disabled={Boolean(code)}><Mail size={15} /><span><strong>Enviar por e-mail</strong><small>Link seguro do Prospecta</small></span></button>
      </div>
      {method === "email" && !code && <p className="admin-invite-hint"><Mail size={14} />O envio exige um remetente em domínio verificado no Resend. Sem domínio, gere um código para compartilhar.</p>}
      {code && <div className="admin-invite-code-panel" role="status"><span>Código de uso único para <strong>{recipient}</strong></span><code>{code}</code><div className="admin-invite-code-actions"><button type="button" className="secondary-button" onClick={onCopy}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Código copiado" : "Copiar código"}</button><button type="button" className="secondary-button" onClick={onCopyLink}>{linkCopied ? <Check size={14} /> : <Clipboard size={14} />}{linkCopied ? "Link copiado" : "Copiar link"}</button></div><a className="admin-invite-url" href={inviteUrl}>{inviteUrl}</a><small>Compartilhe o link e o código por um canal seguro. A pessoa deve usar este mesmo e-mail para aceitar.</small></div>}
      {error && <p className="admin-users-error" role="alert">{error}</p>}
      <footer><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-button" type="submit" disabled={saving || !email.trim() || Boolean(code)}>{saving ? <LoaderCircle size={15} className="admin-users-spinner" /> : method === "code" ? <KeyRound size={15} /> : <Mail size={15} />}{saving ? "Preparando…" : method === "code" ? "Gerar código" : "Enviar convite"}</button></footer>
    </form>
  );
}
