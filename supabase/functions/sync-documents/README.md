# sync-documents — automatisation de la couche 2

Synchronise en continu les documents signés (prescriptions, rapports d'exécution, PAF)
de **PlaniLogix** vers le **portail**, sans machine allumée.

```
SharePoint / Répertoire ──(plugin PlaniLogix, auto)──> PlaniLogix (centre_documentaire + mapping)
        ──[Edge Function sync-documents, appelée par pg_cron]──> Portail (bucket documents + public.documents)
        ──> Espace client (servi par RLS)
```

La fonction reprend la logique de [`scripts/copy-documents.mjs`](../../../scripts/copy-documents.mjs)
`--incremental`, mais : filigrane dans `public.sync_state` (au lieu de `.copy-watermark`),
et **bornée par lot** (`MAX_PRODUCERS`, défaut 15, + garde-temps `TIME_BUDGET_MS`) pour ne
jamais dépasser la limite d'exécution. Un retard se draine sur plusieurs passages du cron.

## Mise en place (une fois)

1. **Backlog initial** (~1 180 producteurs / ~5 000 PDF / 12-15 Go) : à faire avec le script
   local, bien plus rapide que la fonction pour le gros transfert.
   ```
   node --env-file=scripts/.env scripts/copy-documents.mjs --all
   ```
   La fonction ne gérera ensuite que les deltas.

2. **Table filigrane** : appliquer `supabase/migrations/20260630120000_sync_state.sql`.

3. **Déployer la fonction** (verify_jwt = false ; l'accès est gardé par `x-sync-secret`) :
   ```
   supabase functions deploy sync-documents --project-ref sfzcslpbysabsiszcpqm --no-verify-jwt
   ```

4. **Secrets de la fonction** (jamais commités) :
   ```
   supabase secrets set --project-ref sfzcslpbysabsiszcpqm \
     PLANILOGIX_DB_URL='postgresql://...' \
     PLANI_URL='https://bpxzznykbikbqbvraqxj.supabase.co' \
     PLANI_STORAGE_KEY='...' \
     SYNC_SECRET='<chaîne-aléatoire>'
   ```
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement.

5. **Seed du filigrane** (évite que le 1er tick reparcoure tout après le backlog local) —
   poser `last_maj_le` au max(maj_le) actuel de PlaniLogix, `last_producteur_id` au plus grand
   `producteur_id` à cet horodatage.
   > ⚠️ **Précision** : `maj_le` est en **microsecondes**. Seeder au microseconde exact
   > (`max(maj_le)::text`), jamais à la milliseconde — sinon `maj_le > filigrane` reste vrai
   > et la fonction recopie tout à chaque tick. La fonction manipule l'horodatage en TEXTE
   > (jamais via `new Date()`, qui tronque à la ms) pour la même raison.

6. **Cron** : stocker la même valeur que `SYNC_SECRET` dans Vault puis appliquer
   `supabase/migrations/20260630120100_sync_documents_cron.sql`.
   ```sql
   select vault.create_secret('<même-valeur-que-SYNC_SECRET>', 'sync_documents_secret');
   ```

## Vérifier / exploiter

```sql
-- état du filigrane et dernier résumé
select * from public.sync_state where key = 'documents';
-- historique des appels cron
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'sync-documents')
order by start_time desc limit 20;
```

Test manuel (remplace le secret) :
```
curl -i -X POST https://sfzcslpbysabsiszcpqm.supabase.co/functions/v1/sync-documents \
  -H "x-sync-secret: <SYNC_SECRET>"
```

## Sécurité

- `PLANILOGIX_DB_URL` et `PLANI_STORAGE_KEY` ne vivent que comme secrets de la fonction,
  jamais côté navigateur.
- `public.sync_state` : RLS active sans policy → invisible aux clients (seul le service_role y accède).
- L'appel HTTP est gardé par `x-sync-secret` ; le secret du cron est lu depuis Vault.
- Le client continue de lire ses PDF via sa session + RLS (`current_producteur_id()`), inchangé.
