-- Accès immédiat quand le courriel confirmé est celui du dossier dans PlaniLogix.
--
-- JM, 2026-10-09, après qu'un client a attendu qu'on relie son compte à la main :
-- « pourquoi il a pas directement accès à son espace client si le courriel fitte
-- avec nos dossiers? je devrais pas avoir à l'approuver dans un cas comme ça? »
-- puis « pour les clients avec plusieurs compagnies/propriétés on va toutes les
-- associer à ce client ».
--
-- La preuve est la même que pour un partage (20261001150000_partages_acces.sql) :
-- Supabase Auth exige la confirmation du courriel, donc la personne qui se présente
-- avec cette adresse en tient la boîte. Si c'est l'adresse que CFRQ a au dossier,
-- c'est celle à qui on écrit déjà au sujet de ce dossier.
--
-- Règle :
--   - courriel confirmé = courriel d'un ou de plusieurs dossiers dans PlaniLogix
--     -> titulaire de TOUS ces dossiers, sans approbation (sélecteur de l'en-tête
--        quand il y en a plusieurs) ;
--   - sinon, demande d'accès reliée à la main par un employé, comme avant.
--
-- L'accès est calculé à chaque requête, pas recopié dans portal_users : si le
-- courriel change ou disparaît dans PlaniLogix, l'accès tombe au passage suivant de
-- la synchro (sync-courriels, toutes les 15 min), sans rien à défaire à la main.
--
-- Aucun courriel de client n'est recopié ici en clair : producteurs_courriels ne
-- garde que l'empreinte SHA-256 de l'adresse en minuscules, calculée dans
-- PlaniLogix par sync-courriels. On compare l'empreinte du courriel confirmé de
-- l'appelant à ces empreintes. Les adresses @cfrq.ca sont écartées à la source :
-- l'équipe a sa vue employé.

-- ---------------------------------------------------------------- tables
create table if not exists public.producteurs_courriels (
  -- Pas de clé étrangère vers producteurs, comme portal_users : la table est
  -- rechargée depuis PlaniLogix. La jointure sur producteurs fait le tri.
  producteur_id integer not null,
  courriel_hash text not null check (courriel_hash ~ '^[0-9a-f]{64}$'),
  maj_le        timestamptz not null default now(),
  primary key (producteur_id, courriel_hash)
);
create index if not exists producteurs_courriels_hash on public.producteurs_courriels (courriel_hash);
alter table public.producteurs_courriels enable row level security;
revoke all on table public.producteurs_courriels from anon, authenticated;
comment on table public.producteurs_courriels is
  'Empreinte SHA-256 du courriel de chaque dossier dans PlaniLogix (sync-courriels). Un compte dont le courriel confirmé a la même empreinte est titulaire du dossier. Aucune adresse en clair.';

-- Journal : quel compte a eu accès à quel dossier par son courriel, depuis quand,
-- et jusqu'à quand. Tenu par la synchro ; l'accès lui-même ne dépend pas de ce
-- journal (il est calculé à chaque requête).
create table if not exists public.portal_liaisons_courriel (
  user_id       uuid not null references auth.users(id) on delete cascade,
  producteur_id integer not null,
  courriel      text not null,
  vue_le        timestamptz not null default now(),
  retiree_le    timestamptz,
  primary key (user_id, producteur_id)
);
alter table public.portal_liaisons_courriel enable row level security;
revoke all on table public.portal_liaisons_courriel from anon, authenticated;

-- ---------------------------------------------------------------- briques
-- Même calcul que dans PlaniLogix (sync-courriels) : SHA-256 de l'adresse en
-- minuscules, sans espaces autour, en hexadécimal.
create or replace function public.courriel_empreinte(p_courriel text)
returns text
language sql
immutable
strict
set search_path to ''
as $function$
  select encode(sha256(convert_to(lower(trim(p_courriel)), 'UTF8')), 'hex');
$function$;

-- Dossiers dont le courriel au dossier est le courriel CONFIRMÉ de l'appelant.
-- Vide tant que la boîte n'est pas prouvée (courriel_confirme() vaut null).
create or replace function public.portail_dossiers_courriel()
returns setof integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select pc.producteur_id
  from public.producteurs_courriels pc
  join public.producteurs p on p.id = pc.producteur_id
  where pc.courriel_hash = public.courriel_empreinte(public.courriel_confirme());
$function$;

-- L'appelant est-il titulaire de ce dossier (relié par CFRQ, ou par son courriel) ?
create or replace function public.est_titulaire(p_producteur_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_producteur_id is not null and (
    exists (select 1 from public.portal_users pu
             where pu.user_id = (select auth.uid())
               and pu.actif
               and pu.producteur_id = p_producteur_id)
    or exists (select 1 from public.portail_dossiers_courriel() c
                where c = p_producteur_id)
  );
$function$;

-- Dossier dont l'appelant est titulaire : celui qu'il regarde s'il en est
-- titulaire, sinon le premier (relié par CFRQ d'abord, puis par courriel).
-- portail_partager, portail_retirer_partage et les invitations comptent là-dessus :
-- « le dossier du titulaire » = le dossier affiché quand c'est le sien.
create or replace function public.portail_dossier_titulaire()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  with t as (
    select pu.producteur_id, 0 as rang
      from public.portal_users pu
     where pu.user_id = (select auth.uid())
       and pu.actif
    union
    select c, 1 from public.portail_dossiers_courriel() c
  )
  select t.producteur_id
    from t
   order by t.producteur_id is not distinct from
              (select a.producteur_id from public.portal_dossier_actif a
                where a.user_id = (select auth.uid())) desc,
            t.rang, t.producteur_id
   limit 1;
$function$;

-- Un compte a-t-il accès à ce dossier comme titulaire ? Pour la vue employé
-- (« a un compte ») ; les liaisons par courriel viennent du journal de la synchro.
create or replace function public.dossier_a_compte(p_producteur_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.portal_users pu
                  where pu.producteur_id = p_producteur_id and pu.actif)
      or exists (select 1 from public.portal_liaisons_courriel l
                  where l.producteur_id = p_producteur_id and l.retiree_le is null);
$function$;

-- ---------------------------------------------------------------- pivot RLS
-- Seul changement : un dossier choisi est ouvert si l'appelant en est titulaire à
-- quelque titre que ce soit (est_titulaire), plus seulement par portal_users.
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
        or p.id in (select c from public.portail_dossiers_courriel() c)
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

-- Qui a accès au dossier affiché. Les titulaires comprennent maintenant les comptes
-- dont le courriel confirmé est celui du dossier.
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
      select coalesce(jsonb_agg(jsonb_build_object('courriel', t.courriel, 'vous', t.user_id = (select auth.uid()))
                                order by t.depuis), '[]'::jsonb)
      from (
        select pu.user_id, lower(u.email) as courriel, pu.created_at as depuis
          from public.portal_users pu
          join auth.users u on u.id = pu.user_id
         where pu.producteur_id = c.pid and pu.actif
        union
        select u.id, lower(u.email), u.created_at
          from auth.users u
          join public.producteurs_courriels pc on pc.courriel_hash = public.courriel_empreinte(u.email)
         where pc.producteur_id = c.pid
           and u.email_confirmed_at is not null
           and u.deleted_at is null
           and not exists (select 1 from public.portal_users pu
                            where pu.user_id = u.id and pu.producteur_id = c.pid and pu.actif)
      ) t
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

-- ---------------------------------------------------------------- écriture
-- Donner l'accès : on refuse aussi une adresse qui a déjà accès par le courriel au
-- dossier. Le reste est inchangé.
create or replace function public.portail_partager(p_courriel text, p_nom text, p_relation text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pid integer := public.portail_dossier_titulaire();
  v_courriel text := lower(trim(coalesce(p_courriel, '')));
  v_nom text := trim(coalesce(p_nom, ''));
  v_relation text := nullif(trim(coalesce(p_relation, '')), '');
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if v_pid is null or public.current_producteur_id() is distinct from v_pid then
    raise exception 'Seul le titulaire du dossier peut donner un accès.' using errcode = '42501';
  end if;
  if length(v_courriel) > 254 or v_courriel !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse courriel invalide.' using errcode = '22023';
  end if;
  if length(v_nom) not between 2 and 120 then
    raise exception 'Indiquez le nom de la personne.' using errcode = '22023';
  end if;
  if v_relation is not null and v_relation not in ('coproprietaire', 'conjoint', 'famille',
       'institution_financiere', 'notaire_comptable', 'autre') then
    raise exception 'Lien invalide.' using errcode = '22023';
  end if;
  if v_courriel = lower(public.courriel_courant()) then
    raise exception 'C''est votre propre adresse : vous avez déjà accès.' using errcode = '22023';
  end if;
  if exists (select 1 from public.employes_cfrq e where e.courriel = v_courriel and e.actif) then
    raise exception 'L''équipe CFRQ a déjà accès à votre dossier.' using errcode = '22023';
  end if;
  if exists (select 1 from public.portal_users pu join auth.users u on u.id = pu.user_id
             where pu.producteur_id = v_pid and pu.actif and lower(u.email) = v_courriel)
     or exists (select 1 from public.producteurs_courriels pc
                where pc.producteur_id = v_pid and pc.courriel_hash = public.courriel_empreinte(v_courriel))
     or exists (select 1 from public.partages_acces s
                where s.producteur_id = v_pid and s.courriel = v_courriel and s.revoque_le is null) then
    raise exception 'Cette personne a déjà accès à votre espace.' using errcode = '22023';
  end if;
  if (select count(*) from public.partages_acces s where s.producteur_id = v_pid and s.revoque_le is null) >= 10 then
    raise exception 'Vous avez atteint 10 accès. Retirez-en un avant d''en donner un autre.' using errcode = '22023';
  end if;
  if (select count(*) from public.partages_acces s
      where s.producteur_id = v_pid and s.cree_le > now() - interval '24 hours') >= 10 then
    raise exception 'Trop d''accès donnés aujourd''hui. Réessayez demain.' using errcode = '22023';
  end if;

  insert into public.partages_acces (producteur_id, courriel, nom, relation, cree_par, cree_par_courriel)
  values (v_pid, v_courriel, v_nom, v_relation, (select auth.uid()), public.courriel_courant())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'courriel', v_courriel, 'nom', v_nom);
end;
$function$;

-- ---------------------------------------------------------------- vue employé
-- « A un compte » compte aussi les accès par courriel.
create or replace function public.portail_clients(recherche text default ''::text, limite integer default 40)
returns table(id integer, nom text, no_prod text, municipalite text, nb_documents integer, a_carte boolean, a_compte boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    p.id, p.nom, p.no_prod,
    (select min(pr.municipalite) from public.proprietes pr where pr.producteur_id = p.id),
    (select count(*)::int from public.documents d where d.producteur_id = p.id),
    exists (select 1 from public.cartes c where c.producteur_id = p.id),
    public.dossier_a_compte(p.id)
  from public.producteurs p
  where public.est_employe_cfrq()
    and (
      coalesce(recherche, '') = ''
      or p.nom ilike '%' || recherche || '%'
      or p.no_prod ilike '%' || recherche || '%'
      or exists (
        select 1 from public.proprietes pr
        where pr.producteur_id = p.id and pr.municipalite ilike '%' || recherche || '%'
      )
    )
  order by p.nom
  limit greatest(1, least(coalesce(limite, 40), 100));
$function$;

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
      (select coalesce(jsonb_agg(s order by s.score desc, s.nom), '[]'::jsonb) from (
         select p.id, p.nom, p.no_prod,
                (select min(pr.municipalite) from public.proprietes pr where pr.producteur_id = p.id) as municipalite,
                public.dossier_a_compte(p.id) as a_compte,
                (case when cardinality(m.lots) > 0 and exists (
                        select 1 from public.lots l join public.proprietes pr on pr.id = l.propriete_id
                        where pr.producteur_id = p.id and regexp_replace(l.no_lot, '\D', '', 'g') = any(m.lots))
                      then 100 else 0 end)
              + (case when r.no_producteur is not null
                        and replace(public.sans_accents(p.no_prod), ' ', '') = replace(public.sans_accents(r.no_producteur), ' ', '')
                      then 100 else 0 end)
              + (case when cardinality(m.mots) = 0 then 0
                      when not exists (select 1 from unnest(m.mots) t where public.sans_accents(p.nom) not like '%' || t || '%') then 60
                      when exists (select 1 from unnest(m.mots) t where public.sans_accents(p.nom) like '%' || t || '%') then 25
                      else 0 end)
              + (case when exists (select 1 from public.proprietes pr where pr.producteur_id = p.id
                                     and public.sans_accents(pr.municipalite) like '%' || public.sans_accents(r.municipalite) || '%')
                      then 30 else 0 end) as score
         from public.producteurs p
         where p.id < 900000
         order by 6 desc
         limit 5
       ) s where s.score >= 55) as suggestions
    from public.demandes_acces r
    cross join lateral (
      select coalesce((select array_agg(w) from unnest(regexp_split_to_array(public.sans_accents(r.nom), '[^a-z0-9]+')) w
                        where length(w) >= 3), '{}') as mots,
             public.lots_normalises(r.lots) as lots) m
    where r.statut = 'en_attente' and public.est_employe_cfrq()
  ) d;
$function$;

-- ---------------------------------------------------------------- synchro
-- Appelée par sync-courriels (clé de service) après chaque rechargement des
-- empreintes : tient le journal des accès par courriel et ferme les demandes
-- d'accès devenues inutiles (le compte s'ouvre déjà tout seul).
create or replace function public.portail_liaisons_courriel_maj()
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  with m as (
    select u.id as user_id, lower(u.email) as courriel, pc.producteur_id
      from auth.users u
      join public.producteurs_courriels pc on pc.courriel_hash = public.courriel_empreinte(u.email)
      join public.producteurs p on p.id = pc.producteur_id
     where u.email_confirmed_at is not null
       and u.deleted_at is null
       and (u.banned_until is null or u.banned_until < now())
  ),
  nouvelles as (
    insert into public.portal_liaisons_courriel as l (user_id, producteur_id, courriel)
    select m.user_id, m.producteur_id, m.courriel from m
    on conflict (user_id, producteur_id) do update
      set retiree_le = null, vue_le = now(), courriel = excluded.courriel
      where l.retiree_le is not null
    returning 1
  ),
  retirees as (
    update public.portal_liaisons_courriel l
       set retiree_le = now()
     where l.retiree_le is null
       and not exists (select 1 from m where m.user_id = l.user_id and m.producteur_id = l.producteur_id)
    returning 1
  ),
  demandes as (
    update public.demandes_acces d
       set statut = 'reliee',
           producteur_id = (select min(m.producteur_id) from m where m.user_id = d.user_id),
           traitee_le = now(),
           traitee_par = 'automatique : courriel au dossier'
     where d.statut = 'en_attente'
       and exists (select 1 from m where m.user_id = d.user_id)
    returning 1
  )
  select jsonb_build_object(
    'acces_par_courriel', (select count(*) from m),
    'nouvelles', (select count(*) from nouvelles),
    'retirees', (select count(*) from retirees),
    'demandes_fermees', (select count(*) from demandes));
$function$;

-- ---------------------------------------------------------------- droits
-- Briques internes, appelées seulement depuis des fonctions SECURITY DEFINER.
revoke execute on function public.courriel_empreinte(text) from public, anon, authenticated;
revoke execute on function public.portail_dossiers_courriel() from public, anon, authenticated;
revoke execute on function public.est_titulaire(integer) from public, anon, authenticated;
revoke execute on function public.dossier_a_compte(integer) from public, anon, authenticated;
-- Synchro : clé de service seulement.
revoke execute on function public.portail_liaisons_courriel_maj() from public, anon, authenticated;
grant execute on function public.portail_liaisons_courriel_maj() to service_role;
