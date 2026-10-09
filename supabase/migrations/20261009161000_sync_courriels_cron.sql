-- Planification de la synchro des courriels : pg_cron appelle l'Edge Function `sync-courriels`.
-- À EXÉCUTER APRÈS le déploiement de la fonction (sinon le cron appelle une
-- fonction qui n'existe pas). Le secret est celui de `sync-documents`, déjà dans
-- Vault (`sync_documents_secret`) et déjà posé sur le projet (SYNC_SECRET).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Toutes les 15 min, décalé sur les documents (0) et les traces (7).
select cron.schedule(
  'sync-courriels',
  '11,26,41,56 * * * *',
  $$
  select net.http_post(
    url     := 'https://sfzcslpbysabsiszcpqm.supabase.co/functions/v1/sync-courriels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_documents_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Pour défaire :   select cron.unschedule('sync-courriels');
-- Pour suivre :    select last_run, last_summary from public.sync_state where key = 'courriels';
-- Pour tout couper (plus aucun accès par courriel, les liaisons manuelles restent) :
--                  select cron.unschedule('sync-courriels'); truncate public.producteurs_courriels;
