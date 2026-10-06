-- Les traces GPS des entrepreneurs, montrées au propriétaire dans l'espace client.
--
-- JM, 2026-10-06 : « je veux juste que le client voit les traces de
-- l'entrepreneur, pas nos choses à nous » ; « ça doit être découpé avec le lot ».
--
-- La source est PlaniLogix, vue `planilogix.v_trace_portail` (migration 103 de
-- PlaniLogix) : les traces telles que ForestLogix les a produites, celles des
-- ENTREPRENEURS seulement, coupées aux lots du client, sans nom d'opérateur, de
-- machine ni d'entrepreneur. L'Edge Function `sync-traces` (appelée par pg_cron)
-- les recopie ici ; le client les lit par sa session et la RLS, comme sa carte.

create table if not exists public.traces_chantier (
  id            bigint primary key,          -- l'identifiant de la trace dans PlaniLogix
  producteur_id integer not null references public.producteurs(id) on delete cascade,
  jour          date not null,               -- le jour des travaux, à l'heure du Québec
  debut         timestamptz,
  fin           timestamptz,
  longueur_m    numeric(12, 1),              -- la longueur DANS les lots du client
  geometrie     jsonb not null,              -- GeoJSON en WGS84 (MultiLineString)
  maj_le        timestamptz not null default now()
);

create index if not exists traces_chantier_producteur on public.traces_chantier (producteur_id);

comment on table public.traces_chantier is
  'Traces GPS des entrepreneurs (ForestLogix) coupées aux lots du client, recopiées de PlaniLogix (v_trace_portail) par l''Edge Function sync-traces. Ni opérateur, ni machine, ni entrepreneur (Loi 25). RLS : le propriétaire ne voit que les siennes.';

alter table public.traces_chantier enable row level security;

drop policy if exists "proprietaire lit ses traces" on public.traces_chantier;
create policy "proprietaire lit ses traces" on public.traces_chantier
  for select to authenticated
  using (producteur_id = (select public.current_producteur_id()));

-- Aucune écriture par les clients : seul le service_role (la fonction) écrit.
revoke insert, update, delete on public.traces_chantier from anon, authenticated;
revoke all on public.traces_chantier from anon;
-- TRUNCATE ne passe pas par la RLS : les clients LISENT, rien d'autre.
revoke truncate, references, trigger on public.traces_chantier from authenticated;

-- Le filigrane et le dernier résumé de la synchro.
insert into public.sync_state (key) values ('traces')
on conflict (key) do nothing;
