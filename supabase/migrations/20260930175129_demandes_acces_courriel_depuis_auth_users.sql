-- Le courriel vient de auth.users, pas du jeton : auth.email() lit une réclamation du
-- jeton qui peut manquer (le premier test a inséré une demande sans courriel). Même
-- correctif pour « traitee_par », le journal des employés et les intérêts.
create or replace function public.courriel_courant()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select email from auth.users where id = (select auth.uid());
$function$;
revoke all on function public.courriel_courant() from public, anon, authenticated;

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
    values (v_uid, public.courriel_courant(), trim(p_nom), trim(p_municipalite),
            nullif(trim(coalesce(p_telephone, '')), ''), nullif(trim(coalesce(p_no_producteur, '')), ''))
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'statut', 'en_attente');
end;
$function$;

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
     set statut = 'reliee', producteur_id = p_producteur_id, traitee_le = now(), traitee_par = public.courriel_courant()
   where id = p_demande_id;

  insert into public.portal_acces_employe (user_id, courriel, producteur_id, action)
  values ((select auth.uid()), public.courriel_courant(), p_producteur_id, 'relier_compte ' || r.courriel);

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
     set statut = 'refusee', traitee_le = now(), traitee_par = public.courriel_courant()
   where id = p_demande_id and statut = 'en_attente';
  return jsonb_build_object('ok', found);
end;
$function$;

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
  values (auth.uid(), public.courriel_courant(), public.current_producteur_id(), p_fonctionnalite)
  on conflict (user_id, fonctionnalite) do nothing;
  return jsonb_build_object('ok', true);
end;
$function$;
