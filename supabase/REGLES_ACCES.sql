-- =============================================================================
-- Règles d'accès de l'espace client (projet Supabase « Relevés forestiers »,
-- sfzcslpbysabsiszcpqm). INSTANTANÉ DE DOCUMENTATION, NE PAS EXÉCUTER.
-- =============================================================================
-- Relevé dans pg_policies et pg_proc le 2026-09-30, lors de l'audit de sécurité
-- qui a précédé l'ouverture de l'espace client. Les premières migrations
-- (portal_users_and_helper, portal_business_tables, documents_bucket_rls, ...)
-- ont été appliquées directement dans Supabase et ne sont pas dans ce dépôt :
-- ce fichier est la seule copie lisible de ce qu'elles ont mis en place.
--
-- Principe : tout passe par current_producteur_id(). Un client ne lit que les
-- lignes de son producteur, et dans le stockage, que les fichiers rangés sous
-- documents/{son producteur_id}/... Aucune règle d'écriture pour les clients :
-- seules les fonctions serveur (clé de service) écrivent.
--
-- Mis à jour le 2026-10-01 : le titulaire d'un dossier peut le partager lui-même
-- (partages_acces, par courriel confirmé) et une personne qui a accès à plusieurs
-- dossiers choisit celui qu'elle regarde (portal_dossier_actif). Voir
-- migrations/20261001150000_partages_acces.sql. Les règles des lots et des PAF
-- passent par proprietes_visibles(), calculée une fois par requête
-- (migrations/20261001152000_lots_paf_rls_une_evaluation.sql).
--
-- Mis à jour le 2026-10-09 : un compte dont le courriel CONFIRMÉ est celui d'un ou
-- de plusieurs dossiers dans PlaniLogix en est titulaire d'office, sans approbation
-- (est_titulaire, portail_dossiers_courriel). Le portail ne garde que l'empreinte
-- SHA-256 des courriels (producteurs_courriels, rechargée par sync-courriels toutes
-- les 15 min) ; un courriel retiré de PlaniLogix referme l'accès au passage suivant.
-- Voir migrations/20261009160000_liaison_par_courriel.sql.
--
-- Pour vérifier que rien n'a bougé :
--   select schemaname, tablename, policyname, roles, cmd, qual
--   from pg_policies where schemaname in ('public','storage','portrait');
-- =============================================================================

-- ---------------------------------------------------------------- Règles (RLS)

create policy "proprietaire lit son bilan" on public.bilan_investissement
  as permissive for select to public
  using ((producteur_id = (select current_producteur_id())));

create policy "proprietaire lit sa carte" on public.cartes
  as permissive for select to authenticated
  using ((producteur_id = (select current_producteur_id())));

create policy "proprietaire lit ses documents" on public.documents
  as permissive for select to authenticated
  using ((producteur_id = (select current_producteur_id())));

create policy "proprietaire lit ses lots" on public.lots
  as permissive for select to authenticated
  using (propriete_id = any ((select public.proprietes_visibles())::integer[]));

create policy "proprietaire lit ses paf" on public.paf
  as permissive for select to authenticated
  using (propriete_id = any ((select public.proprietes_visibles())::integer[]));

create policy params_lecture on public.params_valeur_bois
  as permissive for select to authenticated
  using (true);

create policy "proprietaire lit son producteur" on public.producteurs
  as permissive for select to authenticated
  using ((id = (select current_producteur_id())));

create policy "proprietaire lit ses proprietes" on public.proprietes
  as permissive for select to authenticated
  using (((producteur_id = (select current_producteur_id()))
       or (proprietaire_legal_producteur_id = (select current_producteur_id()))));

create policy "proprietaire lit ses travaux" on public.travaux
  as permissive for select to authenticated
  using ((producteur_id = (select current_producteur_id())));

create policy "client lit ses documents" on storage.objects
  as permissive for select to authenticated
  using (((bucket_id = 'documents'::text)
      and ((storage.foldername(name))[1] = ((select current_producteur_id()))::text)));

-- Tables avec RLS active et AUCUNE règle (donc fermées à l'API, lues seulement par
-- des fonctions SECURITY DEFINER ou la clé de service) : portal_users,
-- portal_vue_employe, portal_acces_employe, employes_cfrq, sync_state, prix_bois*,
-- partages_acces, portal_dossier_actif, demandes_acces, interets_fonctionnalites,
-- portrait.releves, portrait.releve_items, portrait.evenements_stripe.
-- Buckets : documents et releves, tous deux privés (public = false).

-- ------------------------------------------------------- Fonctions pivot

CREATE OR REPLACE FUNCTION public.current_producteur_id()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    -- Vue employé (expire après 12 h).
    public.portail_vue_employe_active(),
    -- Dossier choisi par une personne qui a accès à plusieurs dossiers, tant qu'il
    -- lui est ouvert : un accès retiré referme le dossier sur-le-champ.
    (select a.producteur_id
       from public.portal_dossier_actif a
      where a.user_id = (select auth.uid())
        and (a.producteur_id = public.portail_dossier_titulaire()
             or public.partage_actif(a.producteur_id))),
    -- Cas normal : le client voit son propre dossier.
    public.portail_dossier_titulaire(),
    -- Tiers : le dossier qu'un titulaire lui a partagé (le plus récent s'il y en a
    -- plusieurs ; les autres se choisissent dans l'en-tête).
    (select s.producteur_id
       from public.partages_acces s
      where s.courriel = (select public.courriel_confirme())
        and s.revoque_le is null
      order by s.cree_le desc
      limit 1)
  );
$function$;

-- proprietes_visibles() : les propriétés du dossier affiché (producteur ou
-- propriétaire légal), pour les règles des lots et des PAF.

CREATE OR REPLACE FUNCTION public.peut_voir_propriete(p_id integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.proprietes p
    WHERE p.id = p_id
      AND ( p.producteur_id = (select public.current_producteur_id())
         OR p.proprietaire_legal_producteur_id = (select public.current_producteur_id()) )
  );
$function$;

-- est_employe_cfrq() et portail_vue_employe_active() : voir les migrations
-- 20260930163019_employes_cfrq_liste_nominative.sql et
-- 20260805171410_vue_employe_expiration_et_garde_portrait.sql.
