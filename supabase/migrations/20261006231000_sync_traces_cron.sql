-- Planification de la synchro des traces : pg_cron appelle l'Edge Function `sync-traces`.
-- À EXÉCUTER APRÈS le déploiement de la fonction (sinon le cron appelle une
-- fonction qui n'existe pas). Le secret est celui de `sync-documents`, déjà dans
-- Vault (`sync_documents_secret`) et déjà posé sur le projet (SYNC_SECRET).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Toutes les 15 min, décalé de 7 min sur les documents pour ne pas tomber ensemble.
select cron.schedule(
  'sync-traces',
  '7,22,37,52 * * * *',
  $$
  select net.http_post(
    url     := 'https://sfzcslpbysabsiszcpqm.supabase.co/functions/v1/sync-traces',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_documents_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Pour défaire :   select cron.unschedule('sync-traces');
-- Pour suivre :    select last_run, last_summary from public.sync_state where key = 'traces';
