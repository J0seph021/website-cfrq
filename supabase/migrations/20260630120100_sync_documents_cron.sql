-- Planification de la couche 2 : pg_cron appelle l'Edge Function `sync-documents`.
-- À EXÉCUTER APRÈS : (1) déploiement de la fonction, (2) secret SYNC_SECRET posé sur la
-- fonction, (3) même valeur stockée dans Vault (voir ci-dessous). Sinon le cron appellera
-- une fonction qui répond 401 ou n'existe pas.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secret partagé entre le cron et la fonction (même valeur que le secret SYNC_SECRET de la
-- fonction). Stocké dans Vault pour ne pas écrire le secret en clair dans la définition du job.
--   select vault.create_secret('LA_MEME_VALEUR_QUE_SYNC_SECRET', 'sync_documents_secret');

-- Toutes les 15 min. Le corps lit le secret depuis Vault au moment de l'appel.
select cron.schedule(
  'sync-documents',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://sfzcslpbysabsiszcpqm.supabase.co/functions/v1/sync-documents',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_documents_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Pour défaire :   select cron.unschedule('sync-documents');
-- Pour suivre :    select * from cron.job_run_details where jobid =
--                    (select jobid from cron.job where jobname='sync-documents')
--                  order by start_time desc limit 20;
