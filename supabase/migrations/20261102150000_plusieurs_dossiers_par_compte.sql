-- Un compte, plusieurs dossiers : relier une demande d'accès à tous les dossiers
-- du client d'un seul coup.
--
-- Sébastien Rioux, 2026-11-02, après la demande de Serge Fournier (Thetford) :
-- « est-ce que tu pourrais ajouter une option pour que je puisse relier plusieurs
-- statuts de producteur ? Sans que le client doive faire plusieurs demandes. »
-- Le cas : deux dossiers dans PlaniLogix pour les mêmes lots (4912466, 4912467),
-- « FOURNIER SERGE » (3465, 4 documents) et « FOURNIER SERGE ET JEAN » (1600,
-- 22 documents). Le compte n'en recevait qu'un : portal_users avait user_id pour
-- clé, et producteur_id un index unique.
--
-- Changements :
--   1. portal_users : clé (user_id, producteur_id). Un compte est titulaire de tous
--      les dossiers que CFRQ lui relie et choisit celui qu'il regarde dans l'en-tête
--      (« Dossier affiché », portal_dossier_actif), comme pour un dossier partagé.
--      L'index unique sur producteur_id tombe aussi : un dossier conjoint (« Serge et
--      Jean ») peut avoir un compte par co-propriétaire. L'employé voit « a déjà un
--      compte » avant de relier.
--   2. est_titulaire(p) ; portail_dossier_titulaire() rend le dossier affiché s'il
--      est à l'appelant, sinon le premier relié. current_producteur_id, portail_moi,
--      portail_mes_dossiers, portail_choisir_dossier et portail_partages comptent
--      avec. portail_partager, portail_retirer_partage et les invitations sont
--      inchangés : ils agissent sur « le dossier du titulaire », qui est le dossier
--      affiché quand c'est le sien.
--   3. portail_relier_dossiers(demande, [dossiers]) : relie la demande à un ou
--      plusieurs dossiers (10 au plus) en une seule transaction, journalisé dossier
--      par dossier ; demandes_acces.producteurs_relies garde la liste.
--      portail_relier_demande(demande, dossier) reste : la version en ligne du site
--      l'appelle encore.
--   4. portail_demandes_acces : le numéro de producteur se compare sans les zéros de
--      tête (Serge a écrit « 57706 », son dossier porte « 000000057706 » : l'indice
--      ne comptait pas) et chaque suggestion dit pourquoi elle est proposée
--      (indices : lot, no_producteur, nom ou nom_partiel, municipalite).
--
-- Appliquée le 2026-11-02, AVANT 20261009160000_liaison_par_courriel.sql (écrite
-- plus tôt, pas encore appliquée). Celle-ci a été mise à jour le même jour pour
-- passer par-dessus sans rien défaire : ses versions de ces fonctions gardent
-- plusieurs dossiers par compte, l'ordre de création et les indices.
--
-- Essai complet dans une transaction annulée avant application : voir le journal
-- du commit (titulaire de deux dossiers, choix du dossier, partage, tiers, retrait,
-- demande reliée à deux dossiers, refus d'un non-employé).

-- ---------------------------------------------------------------- tables
alter table public.portal_users drop constraint portal_users_pkey;
alter table public.portal_users add constraint portal_users_pkey primary key (user_id, producteur_id);
drop index if exists public.portal_users_producteur_uidx;
create index if not exists portal_users_producteur on public.portal_users (producteur_id);

alter table public.demandes_acces add column if not exists producteurs_relies integer[];
update public.demandes_acces
   set producteurs_relies = array[producteur_id]
 where statut = 'reliee' and producteur_id is not null and producteurs_relies is null;

-- ---------------------------------------------------------------- briques
-- L'appelant est-il titulaire de ce dossier (compte relié par CFRQ) ?
create or replace function public.est_titulaire(p_producteur_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_producteur_id is not null and exists (
    select 1 from public.portal_users pu
     where pu.user_id = (select auth.uid())
       and pu.actif
       and pu.producteur_id = p_producteur_id);
$function$;

-- Dossier dont l'appelant est titulaire : celui qu'il regarde s'il est à lui, sinon
-- le premier relié. portail_partager, portail_retirer_partage et les invitations
-- comptent là-dessus : « le dossier du titulaire » = le dossier affiché quand c'est
-- le sien.
create or replace function public.portail_dossier_titulaire()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select pu.producteur_id
    from public.portal_users pu
   where pu.user_id = (select auth.uid())
     and pu.actif
   order by pu.producteur_id is not distinct from
              (select a.producteur_id from public.portal_dossier_actif a
                where a.user_id = (select auth.uid())) desc,
            pu.created_at, pu.producteur_id
   limit 1;
$function$;

-- ---------------------------------------------------------------- pivot RLS
-- Seul changement : un dossier choisi est ouvert si l'appelant en est titulaire
-- (est_titulaire), plus seulement s'il est son unique dossier.
create or replace function public.current_producteur_id()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    -- Vue employé (expire après 12 h).
    public.portail_vue_employe_active(),
    -- Dossier choisi par une personne qui a accès à plusieurs dossiers, tant qu'il
    -- lui est ouvert : un accès retiré referme le dossier sur-le-champ.
    (select a.producteur_id
       from public.portal_dossier_actif a
      where a.user_id = (select auth.uid())
        and (public.est_titulaire(a.producteur_id)
             or public.partage_actif(a.producteur_id))),
    -- Cas normal : le client voit son propre dossier (le premier s'il en a plusieurs).
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

-- ---------------------------------------------------------------- lecture
-- Tous les dossiers dont l'appelant est titulaire, puis ceux qu'on lui a partagés.
create or replace function public.portail_mes_dossiers()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nom', x.nom, 'no_prod', x.no_prod, 'role', x.role)
                            order by x.ordre, x.nom), '[]'::jsonb)
  from (
    select p.id, p.nom, p.no_prod, 'titulaire' as role, 0 as ordre
      from public.producteurs p
     where p.id in (select pu.producteur_id from public.portal_users pu
                     where pu.user_id = (select auth.uid()) and pu.actif)
    union
    select p.id, p.nom, p.no_prod, 'invite', 1
      from public.partages_acces s
      join public.producteurs p on p.id = s.producteur_id
     where s.courriel = (select public.courriel_confirme())
       and s.revoque_le is null
       and not public.est_titulaire(p.id)
  ) x;
$function$;

create or replace function public.portail_moi()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with c as (
    select public.current_producteur_id() as pid,
           public.portail_vue_employe_active() as vue
  )
  select jsonb_build_object(
    'employe', public.est_employe_cfrq(),
    'producteur_id', c.pid,
    'vue_employe', c.vue is not null,
    'role', case when c.pid is null then null
                 when c.vue is not null then 'employe'
                 when public.est_titulaire(c.pid) then 'titulaire'
                 else 'invite' end,
    'client', (
      select jsonb_build_object('id', p.id, 'nom', p.nom, 'no_prod', p.no_prod)
      from public.producteurs p
      where p.id = c.pid
    ),
    'dossiers', public.portail_mes_dossiers()
  )
  from c;
$function$;

-- Choisir le dossier affiché parmi ceux qui sont ouverts à l'appelant.
create or replace function public.portail_choisir_dossier(p_producteur_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if not public.est_titulaire(p_producteur_id)
     and not public.partage_actif(p_producteur_id) then
    raise exception 'Ce dossier ne vous est pas ouvert' using errcode = '42501';
  end if;
  insert into public.portal_dossier_actif (user_id, producteur_id, choisi_le)
  values ((select auth.uid()), p_producteur_id, now())
  on conflict (user_id) do update
    set producteur_id = excluded.producteur_id, choisi_le = now();
  return jsonb_build_object('ok', true, 'producteur_id', p_producteur_id);
end;
$function$;

-- Qui a accès au dossier affiché. Réservé au titulaire qui regarde l'un de SES
-- dossiers et à l'employé qui le consulte ; un tiers reçoit null.
create or replace function public.portail_partages()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with c as (
    select public.current_producteur_id() as pid,
           public.portail_vue_employe_active() as vue
  )
  select case when c.pid is null or (c.vue is null and not public.est_titulaire(c.pid)) then null
  else jsonb_build_object(
    'peut_inviter', c.vue is null,
    'titulaires', (
      select coalesce(jsonb_agg(jsonb_build_object('courriel', lower(u.email), 'vous', pu.user_id = (select auth.uid()))
                                order by pu.created_at), '[]'::jsonb)
      from public.portal_users pu
      join auth.users u on u.id = pu.user_id
      where pu.producteur_id = c.pid and pu.actif
    ),
    'invites', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'nom', s.nom, 'courriel', s.courriel, 'relation', s.relation,
               'cree_le', s.cree_le, 'invitation_envoyee_le', s.invitation_envoyee_le,
               'statut', case when exists (
                           select 1 from auth.users u
                           where lower(u.email) = s.courriel
                             and u.email_confirmed_at is not null
                             and u.deleted_at is null)
                         then 'actif' else 'en_attente' end)
             order by s.cree_le), '[]'::jsonb)
      from public.partages_acces s
      where s.producteur_id = c.pid and s.revoque_le is null
    )
  ) end
  from c;
$function$;

-- ---------------------------------------------------------------- vue employé
-- Demandes en attente, chacune avec les dossiers qui lui ressemblent et pourquoi.
-- Score : lot possédé 100, numéro de producteur identique (sans zéros de tête) 100,
-- tous les mots du nom 60 (un seul 25), une propriété dans la municipalité 30.
-- Les dossiers de démonstration (900000 et plus) ne sont jamais suggérés.
create or replace function public.portail_demandes_acces()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(d order by d.cree_le), '[]'::jsonb)
  from (
    select r.id, r.courriel, r.nom, r.municipalite, r.telephone, r.no_producteur, r.lots, r.cree_le,
      (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id, 'nom', s.nom, 'no_prod', s.no_prod, 'municipalite', s.municipalite,
                'a_compte', s.a_compte, 'score', s.score, 'indices', s.indices)
              order by s.score desc, s.nom), '[]'::jsonb) from (
         select p.id, p.nom, p.no_prod,
                (select min(pr.municipalite) from public.proprietes pr where pr.producteur_id = p.id) as municipalite,
                exists (select 1 from public.portal_users pu where pu.producteur_id = p.id and pu.actif) as a_compte,
                  (case when i.lot then 100 else 0 end)
                + (case when i.no_prod then 100 else 0 end)
                + (case when i.nom_complet then 60 when i.nom_partiel then 25 else 0 end)
                + (case when i.municipalite then 30 else 0 end) as score,
                array_remove(array[
                  case when i.lot then 'lot' end,
                  case when i.no_prod then 'no_producteur' end,
                  case when i.nom_complet then 'nom' when i.nom_partiel then 'nom_partiel' end,
                  case when i.municipalite then 'municipalite' end], null) as indices
         from public.producteurs p
         cross join lateral (
           select
             cardinality(m.lots) > 0 and exists (
               select 1 from public.lots l join public.proprietes pr on pr.id = l.propriete_id
               where pr.producteur_id = p.id and regexp_replace(l.no_lot, '\D', '', 'g') = any(m.lots)) as lot,
             m.no_prod <> ''
               and ltrim(replace(public.sans_accents(p.no_prod), ' ', ''), '0') = m.no_prod as no_prod,
             cardinality(m.mots) > 0
               and not exists (select 1 from unnest(m.mots) t where public.sans_accents(p.nom) not like '%' || t || '%') as nom_complet,
             exists (select 1 from unnest(m.mots) t where public.sans_accents(p.nom) like '%' || t || '%') as nom_partiel,
             exists (select 1 from public.proprietes pr where pr.producteur_id = p.id
                       and public.sans_accents(pr.municipalite) like '%' || public.sans_accents(r.municipalite) || '%') as municipalite
         ) i
         where p.id < 900000
         order by 6 desc, p.nom
         limit 5
       ) s where s.score >= 55) as suggestions
    from public.demandes_acces r
    cross join lateral (
      select coalesce((select array_agg(w) from unnest(regexp_split_to_array(public.sans_accents(r.nom), '[^a-z0-9]+')) w
                        where length(w) >= 3), '{}') as mots,
             public.lots_normalises(r.lots) as lots,
             ltrim(replace(public.sans_accents(r.no_producteur), ' ', ''), '0') as no_prod) m
    where r.statut = 'en_attente' and public.est_employe_cfrq()
  ) d;
$function$;

-- ---------------------------------------------------------------- écriture
-- Employés : relier le compte du demandeur à un ou plusieurs dossiers (journalisé
-- dossier par dossier). Tout ou rien : un dossier introuvable annule le reste.
-- L'ordre du choix est gardé : le premier dossier choisi est celui qui s'ouvre à la
-- première connexion (created_at croissant, clock_timestamp et non now()).
create or replace function public.portail_relier_dossiers(p_demande_id bigint, p_producteur_ids integer[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.demandes_acces%rowtype;
  v_ids integer[];
  v_id integer;
begin
  if not public.est_employe_cfrq() then
    raise exception 'Réservé aux employés CFRQ' using errcode = '42501';
  end if;
  -- Sans doublon ni null, dans l'ordre où l'employé les a choisis.
  select coalesce(array_agg(t.x order by t.o), '{}') into v_ids
    from (select x, min(o) as o
            from unnest(p_producteur_ids) with ordinality as u(x, o)
           where x is not null
           group by x) t;
  if cardinality(v_ids) = 0 then
    raise exception 'Choisissez au moins un dossier' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 10 then
    raise exception 'Dix dossiers au plus par demande' using errcode = '22023';
  end if;
  select * into r from public.demandes_acces where id = p_demande_id for update;
  if not found or r.statut <> 'en_attente' then
    raise exception 'Demande introuvable ou déjà traitée' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_ids) x
              where not exists (select 1 from public.producteurs p where p.id = x)) then
    raise exception 'Dossier introuvable' using errcode = '22023';
  end if;

  foreach v_id in array v_ids loop
    insert into public.portal_users (user_id, producteur_id, actif, created_at)
    values (r.user_id, v_id, true, clock_timestamp())
    on conflict (user_id, producteur_id) do update set actif = true;

    insert into public.portal_acces_employe (user_id, courriel, producteur_id, action)
    values ((select auth.uid()), public.courriel_courant(), v_id, 'relier_compte ' || r.courriel);
  end loop;

  update public.demandes_acces
     set statut = 'reliee', producteur_id = v_ids[1], producteurs_relies = v_ids,
         traitee_le = now(), traitee_par = public.courriel_courant()
   where id = p_demande_id;

  return jsonb_build_object('ok', true, 'courriel_client', r.courriel,
                            'producteur_id', v_ids[1], 'producteur_ids', to_jsonb(v_ids));
end;
$function$;

-- Un seul dossier : la version en ligne du site appelle encore celle-ci.
create or replace function public.portail_relier_demande(p_demande_id bigint, p_producteur_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.portail_relier_dossiers(p_demande_id, array[p_producteur_id]);
end;
$function$;

-- ---------------------------------------------------------------- droits
-- Brique interne, appelée seulement depuis des fonctions SECURITY DEFINER.
revoke execute on function public.est_titulaire(integer) from public, anon, authenticated;
-- RPC des employés (chaque fonction vérifie est_employe_cfrq()).
revoke execute on function public.portail_relier_dossiers(bigint, integer[]) from public, anon;
grant execute on function public.portail_relier_dossiers(bigint, integer[]) to authenticated;
