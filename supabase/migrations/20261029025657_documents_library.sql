create table public.client_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 200),
  kind text not null check (kind in ('note', 'file')),
  markdown text not null default '',
  storage_path text unique,
  mime_type text,
  file_size bigint check (file_size between 1 and 20971520),
  is_contract boolean not null default false,
  signed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (signed_on is null or is_contract),
  check ((kind = 'note' and storage_path is null) or (kind = 'file' and storage_path is not null and storage_path like owner_id::text || '/' || id::text || '/%'))
);
create index client_documents_owner_updated on public.client_documents(owner_id, updated_at desc);
create index client_documents_lead on public.client_documents(lead_id);
alter table public.client_documents enable row level security;
create policy "Owners read documents" on public.client_documents for select to authenticated using (owner_id = (select auth.uid()) and (select public.is_allowed_user()));
create policy "Owners create documents" on public.client_documents for insert to authenticated with check (owner_id = (select auth.uid()) and (select public.is_allowed_user()));
create policy "Owners edit documents" on public.client_documents for update to authenticated using (owner_id = (select auth.uid()) and (select public.is_allowed_user())) with check (owner_id = (select auth.uid()) and (select public.is_allowed_user()));
create trigger client_documents_updated before update on public.client_documents for each row execute function public.set_updated_at();
revoke all on public.client_documents from anon, authenticated;
grant select, insert, update on public.client_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('client-documents', 'client-documents', false, 20971520, array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy "Owners upload document files" on storage.objects for insert to authenticated with check (bucket_id = 'client-documents' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_allowed_user()));
create policy "Owners read document files" on storage.objects for select to authenticated using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_allowed_user()));
create policy "Owners remove failed uploads" on storage.objects for delete to authenticated using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_allowed_user()) and not exists (select 1 from public.client_documents where storage_path = name));
