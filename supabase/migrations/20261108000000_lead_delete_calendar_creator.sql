-- Permite apagar lead com eventos de calendário vinculados.
-- Ao apagar um lead, o FK calendar_events.lead_id usa ON DELETE SET NULL, que dispara
-- UPDATE em calendar_events. A trigger de criador bloqueava essa mudança com
-- "Calendar event creator cannot be changed". Aqui liberamos apenas a anulação feita
-- pelo próprio FK (pg_trigger_depth() > 1); updates diretos continuam protegidos.

create or replace function public.enforce_calendar_event_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    return new;
  end if;

  if old.created_by is not null and new.created_by is distinct from old.created_by then
    if new.created_by is null and pg_trigger_depth() > 1 then
      return new;
    end if;
    raise exception 'Calendar event creator cannot be changed';
  end if;

  if old.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
