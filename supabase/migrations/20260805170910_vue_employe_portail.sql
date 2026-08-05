-- Vue employé du portail : un employé CFRQ (courriel @cfrq.ca confirmé) peut
-- ouvrir le dossier d'un client et voir EXACTEMENT ce que le client voit.
-- Tout passe par current_producteur_id(), déjà au coeur de chaque politique RLS
-- (tables publiques + bucket documents) : aucune politique n'a besoin de bouger.

-- 1) Qui est un employé ? Le domaine du courriel, mais seulement s'il est
-- confirmé. La confirmation par courriel est obligatoire sur ce projet
-- (mailer_autoconfirm = false) : posséder un compte @cfrq.ca prouve donc
-- l'accès à la boîte @cfrq.ca. Compte banni ou supprimé -> plus employé.
create or replace function public.est_employe_cfrq()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and u.deleted_at is null
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
      and lower(u.email) like '%@cfrq.ca'
  );
$function$;

-- 2) Dossier actuellement ouvert par un employé (une seule ligne par employé).
-- RLS active SANS politique : la table n'est accessible que par les fonctions
-- SECURITY DEFINER ci-dessous, jamais en direct depuis le navigateur.
create table if not exists public.portal_vue_employe (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  producteur_id integer not null,
  choisi_le     timestamptz not null default now()
);
alter table public.portal_vue_employe enable row level security;
revoke all on table public.portal_vue_employe from anon, authenticated;

-- 3) Journal des accès employés : qui a ouvert quel dossier, et quand.
-- Les dossiers clients sont confidentiels : la traçabilité n'est pas optionnelle.
create table if not exists public.portal_acces_employe (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  courriel      text,
  producteur_id integer,
  action        text not null,
  quand         timestamptz not null default now()
);
alter table public.portal_acces_employe enable row level security;
revoke all on table public.portal_acces_employe from anon, authenticated;
create index if not exists portal_acces_employe_quand_idx on public.portal_acces_employe (quand desc);

-- 4) Le pivot des RLS. Vue employé d'abord, dossier personnel ensuite :
-- un employé qui est aussi client retrouve son propre dossier en quittant la vue.
create or replace function public.current_producteur_id()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select v.producteur_id
       from public.portal_vue_employe v
      where v.user_id = (select auth.uid())
        and public.est_employe_cfrq()),
    (select pu.producteur_id
       from public.portal_users pu
      where pu.user_id = (select auth.uid())
        and pu.actif = true)
  );
$function$;

-- 5) Etat de la session pour le portail (employé ? quel dossier ouvert ?).
create or replace function public.portail_moi()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'employe', public.est_employe_cfrq(),
    'producteur_id', public.current_producteur_id(),
    'vue_employe', public.est_employe_cfrq()
      and exists (select 1 from public.portal_vue_employe v where v.user_id = (select auth.uid())),
    'client', (
      select jsonb_build_object('id', p.id, 'nom', p.nom, 'no_prod', p.no_prod)
      from public.producteurs p
      where p.id = public.current_producteur_id()
    )
  );
$function$;

-- 6) Recherche de dossiers, réservée aux employés (sinon : aucune ligne).
create or replace function public.portail_clients(recherche text default '', limite integer default 40)
returns table (
  id integer, nom text, no_prod text, municipalite text,
  nb_documents integer, a_carte boolean, a_compte boolean
)
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
    exists (select 1 from public.portal_users pu where pu.producteur_id = p.id and pu.actif)
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

-- 7) Ouvrir le dossier d'un client (journalisé).
create or replace function public.portail_voir_client(p_producteur_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nom text;
begin
  if not public.est_employe_cfrq() then
    raise exception 'Reserve aux employes CFRQ' using errcode = '42501';
  end if;

  select nom into v_nom from public.producteurs where id = p_producteur_id;
  if not found then
    raise exception 'Dossier introuvable' using errcode = '22023';
  end if;

  insert into public.portal_vue_employe (user_id, producteur_id, choisi_le)
  values ((select auth.uid()), p_producteur_id, now())
  on conflict (user_id) do update
    set producteur_id = excluded.producteur_id, choisi_le = now();

  insert into public.portal_acces_employe (user_id, courriel, producteur_id, action)
  values ((select auth.uid()), auth.email(), p_producteur_id, 'ouvrir');

  return jsonb_build_object('ok', true, 'producteur_id', p_producteur_id, 'nom', v_nom);
end;
$function$;

-- 8) Quitter la vue client. Volontairement ouvert à tous : un ex-employé doit
-- pouvoir refermer une vue même si son accès a été révoqué entre-temps.
create or replace function public.portail_quitter_client()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pid integer;
begin
  delete from public.portal_vue_employe
   where user_id = (select auth.uid())
  returning producteur_id into v_pid;

  if v_pid is not null then
    insert into public.portal_acces_employe (user_id, courriel, producteur_id, action)
    values ((select auth.uid()), auth.email(), v_pid, 'quitter');
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.portail_clients(text, integer) from public, anon;
revoke all on function public.portail_voir_client(integer) from public, anon;
revoke all on function public.portail_quitter_client() from public, anon;
revoke all on function public.portail_moi() from public, anon;
grant execute on function public.portail_clients(text, integer) to authenticated;
grant execute on function public.portail_voir_client(integer) to authenticated;
grant execute on function public.portail_quitter_client() to authenticated;
grant execute on function public.portail_moi() to authenticated;
