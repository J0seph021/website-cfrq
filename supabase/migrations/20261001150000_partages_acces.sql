-- Le client partage lui-même son espace client avec un tiers.
--
-- Le titulaire d'un dossier (compte relié par CFRQ dans portal_users) donne l'accès
-- à un co-propriétaire, un conjoint, un membre de la famille, sa banque ou son
-- notaire, sans approbation de CFRQ. Il voit en tout temps qui a accès et retire un
-- accès d'un clic, avec effet immédiat : current_producteur_id() est relu à chaque
-- requête, donc le tiers ne lit plus rien dès la requête suivante.
--
-- L'accès suit le COURRIEL CONFIRMÉ : le tiers se connecte avec l'adresse que le
-- titulaire a inscrite (lien magique ou mot de passe). Supabase Auth exige la
-- confirmation du courriel (mailer_autoconfirm = false), ce qui prouve que la boîte
-- est à lui : personne d'autre ne peut se présenter avec cette adresse.
--
-- Le tiers lit tout ce que lit le titulaire (mêmes règles RLS), ne peut rien
-- modifier (aucune règle d'écriture pour les clients) et ne peut pas donner accès à
-- son tour. Un employé qui consulte le dossier voit la liste et peut retirer un
-- accès (le client appelle : « enlevez mon ex »), jamais en donner un.
--
-- Une personne qui a accès à plusieurs dossiers (le sien et celui d'un conjoint, ou
-- un notaire invité par deux clients) choisit le dossier affiché
-- (portal_dossier_actif), comme un employé choisit un client.
--
-- Tables fermées à l'API (RLS sans règle) : tout passe par les fonctions ci-dessous.

-- ---------------------------------------------------------------- tables
create table if not exists public.partages_acces (
  id                    bigint generated always as identity primary key,
  -- Pas de clé étrangère vers producteurs, comme portal_users : la table est
  -- rechargée depuis PlaniLogix. La fonction portail_partager vérifie le dossier.
  producteur_id         integer not null,
  courriel              text not null check (
                          courriel = lower(courriel)
                          and length(courriel) <= 254
                          and courriel ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nom                   text not null check (length(nom) between 2 and 120),
  relation              text check (relation in ('coproprietaire', 'conjoint', 'famille',
                          'institution_financiere', 'notaire_comptable', 'autre')),
  cree_le               timestamptz not null default now(),
  cree_par              uuid references auth.users(id) on delete set null,
  cree_par_courriel     text,
  invitation_envoyee_le timestamptz,
  revoque_le            timestamptz,
  revoque_par           text
);
create unique index if not exists partages_acces_un_actif
  on public.partages_acces (producteur_id, courriel) where revoque_le is null;
create index if not exists partages_acces_courriel_actif
  on public.partages_acces (courriel) where revoque_le is null;
alter table public.partages_acces enable row level security;
revoke all on table public.partages_acces from anon, authenticated;

create table if not exists public.portal_dossier_actif (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  producteur_id integer not null,
  choisi_le     timestamptz not null default now()
);
alter table public.portal_dossier_actif enable row level security;
revoke all on table public.portal_dossier_actif from anon, authenticated;

-- ---------------------------------------------------------------- briques
-- Courriel CONFIRMÉ de l'appelant, en minuscules. null tant que la boîte n'est pas
-- prouvée, ou si le compte est supprimé ou suspendu.
create or replace function public.courriel_confirme()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until < now());
$function$;

-- Dossier dont l'appelant est titulaire (relié par CFRQ), sinon null.
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
    and pu.actif = true;
$function$;

-- Ce dossier est-il partagé avec l'appelant (accès non retiré) ?
create or replace function public.partage_actif(p_producteur_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.partages_acces s
    where s.producteur_id = p_producteur_id
      and s.revoque_le is null
      and s.courriel = (select public.courriel_confirme())
  );
$function$;

-- ---------------------------------------------------------------- pivot RLS
-- Chaque argument de coalesce n'est évalué que si les précédents sont null : un
-- titulaire qui n'a rien choisi ne paie qu'une lecture de plus (portal_dossier_actif,
-- vide), et la recherche par courriel ne touche que les comptes sans dossier à eux.
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

-- ---------------------------------------------------------------- lecture
-- Dossiers ouverts à l'appelant comme titulaire ou comme tiers (pas la vue employé).
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
     where p.id = public.portail_dossier_titulaire()
    union
    select p.id, p.nom, p.no_prod, 'invite', 1
      from public.partages_acces s
      join public.producteurs p on p.id = s.producteur_id
     where s.courriel = (select public.courriel_confirme())
       and s.revoque_le is null
       and p.id is distinct from public.portail_dossier_titulaire()
  ) x;
$function$;

-- portail_moi : on ajoute le rôle de l'appelant dans le dossier affiché, et la
-- liste de ses dossiers (sélecteur de l'en-tête quand il y en a plus d'un).
create or replace function public.portail_moi()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with c as (
    select public.current_producteur_id() as pid,
           public.portail_dossier_titulaire() as titulaire,
           public.portail_vue_employe_active() as vue
  )
  select jsonb_build_object(
    'employe', public.est_employe_cfrq(),
    'producteur_id', c.pid,
    'vue_employe', c.vue is not null,
    'role', case when c.pid is null then null
                 when c.vue is not null then 'employe'
                 when c.pid = c.titulaire then 'titulaire'
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
  if p_producteur_id is distinct from public.portail_dossier_titulaire()
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

-- Qui a accès au dossier affiché. Réservé au titulaire qui regarde son propre
-- dossier et à l'employé qui le consulte ; un tiers reçoit null.
--   titulaires : comptes reliés par CFRQ (ne se retirent pas d'ici).
--   invites    : accès donnés par le titulaire ; statut « actif » dès qu'un compte
--                confirmé existe avec ce courriel, sinon « en_attente ».
create or replace function public.portail_partages()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with c as (
    select public.current_producteur_id() as pid,
           public.portail_dossier_titulaire() as titulaire,
           public.portail_vue_employe_active() as vue
  )
  select case when c.pid is null or (c.vue is null and c.pid is distinct from c.titulaire) then null
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

-- ---------------------------------------------------------------- écriture
-- Donner l'accès. Seul le titulaire, devant son propre dossier. Garde-fous contre
-- un compte détourné : 10 accès actifs au plus, 10 nouveaux par 24 h.
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

-- Retirer un accès : le titulaire devant son dossier, ou l'employé qui le consulte
-- (journalisé dans portal_acces_employe).
create or replace function public.portail_retirer_partage(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_vue integer := public.portail_vue_employe_active();
  v_pid integer;
  v_courriel text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if v_vue is not null then
    v_pid := v_vue;
  else
    v_pid := public.portail_dossier_titulaire();
    if v_pid is null or public.current_producteur_id() is distinct from v_pid then
      raise exception 'Seul le titulaire du dossier peut retirer un accès.' using errcode = '42501';
    end if;
  end if;

  update public.partages_acces
     set revoque_le = now(), revoque_par = public.courriel_courant()
   where id = p_id and producteur_id = v_pid and revoque_le is null
  returning courriel into v_courriel;
  if v_courriel is null then
    raise exception 'Accès introuvable ou déjà retiré.' using errcode = '22023';
  end if;

  if v_vue is not null then
    insert into public.portal_acces_employe (user_id, courriel, producteur_id, action)
    values ((select auth.uid()), public.courriel_courant(), v_pid, 'retirer_partage ' || v_courriel);
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Pour l'Edge Function notifier-acces (appelée avec le jeton du titulaire) : marque
-- l'invitation comme envoyée et rend ce qu'il faut pour écrire le courriel. Au plus
-- un envoi par heure et par accès, contre les renvois en boucle.
create or replace function public.portail_invitation_a_envoyer(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pid integer := public.portail_dossier_titulaire();
  r public.partages_acces%rowtype;
  v_prod public.producteurs%rowtype;
begin
  if v_pid is null or public.current_producteur_id() is distinct from v_pid then
    raise exception 'Seul le titulaire du dossier peut envoyer une invitation.' using errcode = '42501';
  end if;
  update public.partages_acces
     set invitation_envoyee_le = now()
   where id = p_id and producteur_id = v_pid and revoque_le is null
     and (invitation_envoyee_le is null or invitation_envoyee_le < now() - interval '1 hour')
  returning * into r;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'deja_envoyee');
  end if;
  select * into v_prod from public.producteurs where id = v_pid;
  return jsonb_build_object('ok', true, 'id', r.id, 'courriel', r.courriel, 'nom', r.nom,
                            'dossier_nom', v_prod.nom, 'dossier_salutation', v_prod.nom_salutation);
end;
$function$;

-- Si Graph refuse l'envoi, on libère le délai d'une heure pour permettre un nouvel essai.
create or replace function public.portail_invitation_echouee(p_id bigint)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.partages_acces
     set invitation_envoyee_le = null
   where id = p_id
     and producteur_id = public.portail_dossier_titulaire()
     and invitation_envoyee_le > now() - interval '5 minutes';
$function$;

-- ---------------------------------------------------------------- droits
-- Briques internes : appelées seulement depuis des fonctions SECURITY DEFINER (qui
-- s'exécutent avec les droits de leur propriétaire), donc fermées à l'API. Supabase
-- donne EXECUTE à anon et authenticated par défaut : on le retire explicitement.
revoke execute on function public.courriel_confirme() from public, anon, authenticated;
revoke execute on function public.portail_dossier_titulaire() from public, anon, authenticated;
revoke execute on function public.partage_actif(integer) from public, anon, authenticated;
revoke execute on function public.portail_mes_dossiers() from public, anon, authenticated;
revoke execute on function public.portail_choisir_dossier(integer) from public, anon;
revoke execute on function public.portail_partages() from public, anon;
revoke execute on function public.portail_partager(text, text, text) from public, anon;
revoke execute on function public.portail_retirer_partage(bigint) from public, anon;
revoke execute on function public.portail_invitation_a_envoyer(bigint) from public, anon;
revoke execute on function public.portail_invitation_echouee(bigint) from public, anon;

-- RPC du portail : clients connectés seulement.
grant execute on function public.portail_choisir_dossier(integer) to authenticated;
grant execute on function public.portail_partages() to authenticated;
grant execute on function public.portail_partager(text, text, text) to authenticated;
grant execute on function public.portail_retirer_partage(bigint) to authenticated;
grant execute on function public.portail_invitation_a_envoyer(bigint) to authenticated;
grant execute on function public.portail_invitation_echouee(bigint) to authenticated;
