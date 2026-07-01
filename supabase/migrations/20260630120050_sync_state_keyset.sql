-- Curseur keyset (maj_le, producteur_id) pour l'Edge Function sync-documents.
-- centre_doc_fichier estampille maj_le par lot (toutes les rangées du backfill ont le même
-- horodatage), donc un simple `maj_le > wm` + LIMIT sauterait les producteurs au-delà du lot
-- qui partagent l'horodatage. La 2e composante (producteur_id) rend le curseur sans saut.

alter table public.sync_state
  add column if not exists last_producteur_id integer not null default 0;