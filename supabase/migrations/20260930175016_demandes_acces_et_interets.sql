-- Demandes d'accès à l'espace client, et « M'aviser quand c'est prêt ».
--
-- 1) Demande d'accès : un client a un dossier chez CFRQ mais son compte n'y est pas
--    relié (on n'avait pas son courriel, ou il en utilise un autre). Il s'inscrit
--    (la confirmation du courriel prouve que la boîte est à lui), remplit nom,
--    municipalité, téléphone et, s'il le connaît, son numéro de producteur. Un
--    employé voit la demande avec les dossiers qui correspondent et relie le compte
--    en un clic. Jamais de liaison automatique : quiconque peut prétendre être
--    « Pierre Gagnon de Saint-Raymond », seul un humain de CFRQ tranche.
-- 2) Intérêts : le client clique « M'aviser quand c'est prêt » sur une fonctionnalité
--    à venir ; on garde qui et quoi pour lui écrire le jour de la sortie.
--
-- Tables fermées à l'API (RLS sans règle) : tout passe par les fonctions ci-dessous,
-- qui vérifient chacune qui appelle.

create or replace function public.sans_accents(t text)
returns text
language sql
immutable
as $function$
  select lower(translate(coalesce(t, ''),
    'ÀÂÄÁÃÉÈÊËÍÎÏÌÓÔÖÒÕÚÛÜÙÇàâäáãéèêëíîïìóôöòõúûüùç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'));
$function$;

-- ---------------------------------------------------------------- demandes
create table if not exists public.demandes_acces (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  courriel       text not null,
  nom            text not null,
  municipalite   text not null,
  telephone      text,
  no_producteur  text,
  statut         text not null default 'en_attente' check (statut in ('en_attente', 'reliee', 'refusee')),
  producteur_id  integer,
  cree_le        timestamptz not null default now(),
  notifie_le     timestamptz,
  traitee_le     timestamptz,
  traitee_par    text
);
create unique index if not exists demandes_acces_une_en_attente
  on public.demandes_acces (user_id) where statut = 'en_attente';
alter table public.demandes_acces enable row level security;
revoke all on table public.demandes_acces from anon, authenticated;

-- Le client dépose (ou corrige) SA demande. Refusé à un employé et à un compte déjà relié.
create or replace function public.portail_demander_acces(
  p_nom text, p_municipalite text, p_telephone text default null, p_no_producteur text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if public.est_employe_cfrq() or public.current_producteur_id() is not null then
    raise exception 'Ce compte a déjà accès à un dossier' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_nom, ''))) not between 2 and 120
     or length(trim(coalesce(p_municipalite, ''))) not between 2 and 120
     or length(coalesce(p_telephone, '')) > 40
     or length(coalesce(p_no_producteur, '')) > 40 then
    raise exception 'Champs invalides' using errcode = '22023';
  end if;

  update public.demandes_acces
     set nom = trim(p_nom), municipalite = trim(p_municipalite),
         telephone = nullif(trim(coalesce(p_telephone, '')), ''),
         no_producteur = nullif(trim(coalesce(p_no_producteur, '')), '')
   where user_id = v_uid and statut = 'en_attente'
  returning id into v_id;

  if v_id is null then
    insert into public.demandes_acces (user_id, courriel, nom, municipalite, telephone, no_producteur)
    values (v_uid, auth.email(), trim(p_nom), trim(p_municipalite),
            nullif(trim(coalesce(p_telephone, '')), ''), nullif(trim(coalesce(p_no_producteur, '')), ''))
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'statut', 'en_attente');
end;
$function$;

-- Le client relit sa demande (pour afficher « Demande reçue » au retour).
create or replace function public.portail_ma_demande()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('id', id, 'statut', statut, 'nom', nom, 'municipalite', municipalite,
                            'telephone', telephone, 'no_producteur', no_producteur, 'cree_le', cree_le)
  from public.demandes_acces
  where user_id = (select auth.uid())
  order by cree_le desc
  limit 1;
$function$;

-- Employés : demandes en attente, chacune avec les dossiers qui lui ressemblent.
-- Score : numéro de producteur identique 100, tous les mots du nom 60 (un seul 25),
-- une propriété dans la municipalité 30. Les dossiers de démonstration (900000 et
-- plus) ne sont jamais suggérés.
create or replace function public.portail_demandes_acces()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(d order by d.cree_le), '[]'::jsonb)
  from (
    select r.id, r.courriel, r.nom, r.municipalite, r.telephone, r.no_producteur, r.cree_le,
      (select coalesce(jsonb_agg(s order by s.score desc, s.nom), '[]'::jsonb) from (
         select p.id, p.nom, p.no_prod,
                (select min(pr.municipalite) from public.proprietes pr where pr.producteur_id = p.id) as municipalite,
                exists (select 1 from public.portal_users pu where pu.producteur_id = p.id and pu.actif) as a_compte,
                (case when r.no_producteur is not null
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
      select coalesce(array_agg(w), '{}') as mots
      from unnest(regexp_split_to_array(public.sans_accents(r.nom), '[^a-z0-9]+')) w
      where length(w) >= 3) m
    where r.statut = 'en_attente' and public.est_employe_cfrq()
  ) d;
$function$;

-- Employés : relier le compte du demandeur au dossier choisi (journalisé).
create or replace function public.portail_relier_demande(p_demande_id bigint, p_producteur_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.demandes_acces%rowtype;
begin
  if not public.est_employe_cfrq() then
    raise exception 'Réservé aux employés CFRQ' using errcode = '42501';
  end if;
  select * into r from public.demandes_acces where id = p_demande_id for update;
  if not found or r.statut <> 'en_attente' then
    raise exception 'Demande introuvable ou déjà traitée' using errcode = '22023';
  end if;
  if not exists (select 1 from public.producteurs where id = p_producteur_id) then
    raise exception 'Dossier introuvable' using errcode = '22023';
  end if;

  insert into public.portal_users (user_id, producteur_id, actif)
  values (r.user_id, p_producteur_id, true)
  on conflict (user_id) do update set producteur_id = excluded.producteur_id, actif = true;

  update public.demandes_acces
     set statut = 'reliee', producteur_id = p_producteur_id, traitee_le = now(), traitee_par = auth.email()
   where id = p_demande_id;

  insert into public.portal_acces_employe (user_id, courriel, producteur_id, action)
  values ((select auth.uid()), auth.email(), p_producteur_id, 'relier_compte ' || r.courriel);

  return jsonb_build_object('ok', true, 'courriel_client', r.courriel, 'producteur_id', p_producteur_id);
end;
$function$;

create or replace function public.portail_refuser_demande(p_demande_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.est_employe_cfrq() then
    raise exception 'Réservé aux employés CFRQ' using errcode = '42501';
  end if;
  update public.demandes_acces
     set statut = 'refusee', traitee_le = now(), traitee_par = auth.email()
   where id = p_demande_id and statut = 'en_attente';
  return jsonb_build_object('ok', found);
end;
$function$;

-- --------------------------------------------------------------- intérêts
create table if not exists public.interets_fonctionnalites (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  courriel        text,
  producteur_id   integer,
  fonctionnalite  text not null check (fonctionnalite in ('valeur_foret', 'portrait', 'suivi_travaux')),
  cree_le         timestamptz not null default now(),
  avise_le        timestamptz,
  unique (user_id, fonctionnalite)
);
alter table public.interets_fonctionnalites enable row level security;
revoke all on table public.interets_fonctionnalites from anon, authenticated;

-- Le client s'inscrit. Refusé en vue employé : un clic d'employé n'est pas un intérêt du client.
create or replace function public.portail_aviser_moi(p_fonctionnalite text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if public.portail_vue_employe_active() is not null then
    return jsonb_build_object('ok', false, 'raison', 'vue_employe');
  end if;
  insert into public.interets_fonctionnalites (user_id, courriel, producteur_id, fonctionnalite)
  values (auth.uid(), auth.email(), public.current_producteur_id(), p_fonctionnalite)
  on conflict (user_id, fonctionnalite) do nothing;
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.portail_mes_interets()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(fonctionnalite), '{}')
  from public.interets_fonctionnalites where user_id = (select auth.uid());
$function$;

-- ---------------------------------------------------------------- droits
revoke all on function public.sans_accents(text) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.portail_demander_acces(text, text, text, text)', 'public.portail_ma_demande()',
    'public.portail_demandes_acces()', 'public.portail_relier_demande(bigint, integer)',
    'public.portail_refuser_demande(bigint)', 'public.portail_aviser_moi(text)', 'public.portail_mes_interets()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
