alter table public.leads
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists foto_ref text,
  add column if not exists foto_atribuicao jsonb,
  add column if not exists score integer check (score between 0 and 100),
  add column if not exists nota_google numeric(2,1) check (nota_google between 0 and 5),
  add column if not exists total_avaliacoes integer check (total_avaliacoes >= 0),
  add column if not exists instagram text,
  add column if not exists maps_url text,
  add column if not exists favorito boolean not null default false;

update public.pipeline_stages set name = 'Em negociação' where slug = 'qualificado';
insert into public.pipeline_stages (slug, name, position)
values ('descartado', 'Descartado', 5)
on conflict (slug) do update set name = excluded.name, position = excluded.position;
