-- Filigrane (watermark) de synchronisation des documents PlaniLogix -> portail.
-- Remplace le fichier local scripts/.copy-watermark côté Edge Function `sync-documents`.
-- Une seule ligne key='documents'. Lue/écrite uniquement par le service_role
-- (RLS active, AUCUNE policy => les clients du portail ne voient jamais cette table).

create table if not exists public.sync_state (
  key          text primary key,
  last_maj_le  timestamptz not null default '1970-01-01T00:00:00Z',
  last_run     timestamptz,
  last_summary jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.sync_state enable row level security;

insert into public.sync_state (key) values ('documents')
on conflict (key) do nothing;
