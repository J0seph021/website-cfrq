# Consignes : migration capter-lead (nom, municipalité, lots)

À exécuter depuis une conversation dans le projet **PlaniLogix** (Supabase `bpxzznykbikbqbvraqxj`).

## Contexte

Le calculateur de taxes du site CFRQ (préprod) envoie maintenant `nom`, `municipalite` et `details` (numéros de lot) au endpoint `capter-lead`. La fonction Edge déployée ignore ces champs tant que les deux étapes ci-dessous ne sont pas faites. Aucun lead n'est perdu entre-temps : courriel, superficie, taxes et potentiel continuent d'être capturés normalement.

La table `planilogix.leads_web` a **déjà** les colonnes `nom`, `municipalite`, `details` (ajoutées pour les formulaires visite-conseil/plants). Seule la RPC du calculateur de taxes ne les remplit pas.

## Étape 1 : migration SQL (AVANT le déploiement)

Remplacer la RPC `public.capter_lead_web` (10 paramètres) par la version à 13 paramètres. Les 3 nouveaux ont un `DEFAULT NULL`, donc la fonction Edge actuellement déployée (qui appelle avec 10 arguments positionnels) continue de fonctionner pendant la transition. Zéro interruption.

```sql
begin;

drop function public.capter_lead_web(text,numeric,numeric,numeric,numeric,text,text,text,text,text);

create function public.capter_lead_web(
  p_courriel text,
  p_superficie_ha numeric default null,
  p_taxes_annuelles numeric default null,
  p_potentiel_annuel numeric default null,
  p_potentiel_5ans numeric default null,
  p_source text default 'calculateur-taxes',
  p_region text default null,
  p_referrer text default null,
  p_user_agent text default null,
  p_ip_hash text default null,
  p_nom text default null,
  p_municipalite text default null,
  p_details jsonb default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_id uuid;
  v_recent int;
begin
  -- anti-spam : max 5 soumissions / heure pour une meme empreinte IP
  if p_ip_hash is not null then
    select count(*) into v_recent
    from planilogix.leads_web
    where ip_hash = p_ip_hash and cree_le > now() - interval '1 hour';
    if v_recent >= 5 then
      return null;
    end if;
  end if;

  insert into planilogix.leads_web
    (courriel, superficie_ha, taxes_annuelles, potentiel_annuel, potentiel_5ans,
     source, region, referrer, user_agent, ip_hash, nom, municipalite, details)
  values
    (lower(trim(p_courriel)), p_superficie_ha, p_taxes_annuelles, p_potentiel_annuel, p_potentiel_5ans,
     coalesce(nullif(trim(p_source), ''), 'calculateur-taxes'), p_region, p_referrer, p_user_agent, p_ip_hash,
     nullif(trim(p_nom), ''), nullif(trim(p_municipalite), ''), p_details)
  returning id into v_id;

  return v_id;
end;
$fn$;

commit;
```

Important : `drop` + `create` dans la même transaction (pas de `create or replace` seul, sinon Postgres crée une DEUXIÈME fonction et les appels deviennent ambigus).

## Étape 2 : redéployer la fonction Edge `capter-lead`

Le code source à jour est déjà écrit dans le repo du site :
`C:\Users\info\OneDrive\Documents\Travail\CFRQ\Website CFRQ\supabase\functions\capter-lead\index.ts`

Déployer ce fichier tel quel sur le projet `bpxzznykbikbqbvraqxj` (MCP Supabase `deploy_edge_function`, nom `capter-lead`). Points de vigilance :
- `verify_jwt` doit rester **false** (endpoint public appelé par le site).
- Les secrets existants (`SUPABASE_DB_URL`, `M365_TENANT`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, `LEADS_NOTIFY_EMAIL`) sont déjà posés; ne pas y toucher.

Ce que la nouvelle version change : la branche `calculateur-taxes` lit `nom`, `municipalite`, `details`, les passe à la RPC (13 arguments), les affiche dans le courriel de notification interne, et personnalise le « Bonjour {nom}, » du courriel de relance. Les branches visite-conseil/plants sont inchangées.

## Étape 3 : test de bout en bout

```bash
curl -s -X POST "https://bpxzznykbikbqbvraqxj.supabase.co/functions/v1/capter-lead" \
  -H "content-type: application/json" \
  -d '{"courriel":"jmoffet021021@gmail.com","nom":"Test migration","municipalite":"Saint-Raymond","details":{"Numéro(s) de lot":"1 234 567"},"superficie_ha":40,"taxes_annuelles":1400,"potentiel_annuel":1190,"potentiel_5ans":5950,"source":"calculateur-taxes"}'
```

Attendu : `{"ok":true}`, un courriel de relance à l'adresse gmail (« Bonjour Test migration, »), une notification interne à cfrq@cfrq.ca avec Nom/Municipalité/lot, et la vérification en base :

```sql
select cree_le, courriel, nom, municipalite, details, superficie_ha, taxes_annuelles
from planilogix.leads_web
order by cree_le desc limit 3;
```

Supprimer ensuite le lead de test si désiré (`delete from planilogix.leads_web where nom = 'Test migration';`).
