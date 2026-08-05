-- Affinages de la vue employé :
--   a) la vue expire d'elle-même après 12 h (l'employé retombe sur son état normal) ;
--   b) le Portrait ne peut pas être commandé/téléchargé depuis une vue employé :
--      portrait_token_client fait tourner le jeton du relevé du client et y écrit
--      le courriel de l'appelant, un clic accidentel casserait le lien de
--      téléchargement déjà envoyé au client.

-- Source unique de vérité : le dossier ouvert par un employé, ou NULL.
create or replace function public.portail_vue_employe_active()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select v.producteur_id
  from public.portal_vue_employe v
  where v.user_id = (select auth.uid())
    and v.choisi_le > now() - interval '12 hours'
    and public.est_employe_cfrq()
$function$;

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
    -- Cas normal : le client voit son propre dossier.
    (select pu.producteur_id
       from public.portal_users pu
      where pu.user_id = (select auth.uid())
        and pu.actif = true)
  );
$function$;

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
    'vue_employe', public.portail_vue_employe_active() is not null,
    'client', (
      select jsonb_build_object('id', p.id, 'nom', p.nom, 'no_prod', p.no_prod)
      from public.producteurs p
      where p.id = public.current_producteur_id()
    )
  );
$function$;

create or replace function public.portrait_token_client()
returns jsonb
language plpgsql
security definer
set search_path to 'portrait', 'public', 'extensions'
as $function$
declare
  v_pid   int := public.current_producteur_id();
  v_id    uuid;
  v_nom   text;
  v_muni  text;
  v_nb    int;
  v_token text;
begin
  if v_pid is null then
    return jsonb_build_object('erreur', 'non authentifie');
  end if;

  -- En vue employé : lecture seule. Faire tourner le jeton invaliderait le lien
  -- de téléchargement déjà remis au client.
  if public.portail_vue_employe_active() is not null then
    return jsonb_build_object('erreur', 'vue_employe');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  select id into v_id from portrait.releves
   where producteur_id = v_pid order by cree_le desc limit 1;

  if v_id is null then
    select nom into v_nom from public.producteurs where id = v_pid;
    select count(*), min(municipalite) into v_nb, v_muni
      from public.proprietes where producteur_id = v_pid;
    insert into portrait.releves
      (token_hash, producteur_id, nom, municipalite, courriel, nb_proprietes, statut)
      values (encode(digest(v_token,'sha256'),'hex'), v_pid, coalesce(v_nom,'Client'),
              v_muni, auth.email(), coalesce(v_nb,0), 'genere')
      returning id into v_id;
    insert into portrait.releve_items (releve_id, theme, titre, prix_cents, ordre) values
      (v_id,'complet','Relevé COMPLET (tout réuni)',29900,0),
      (v_id,'bois','Relevé Bois',7900,1),
      (v_id,'carbone','Relevé Carbone',7900,2),
      (v_id,'acericulture','Relevé Acériculture',7900,3),
      (v_id,'faune','Relevé Faune',7900,4),
      (v_id,'biodiversite','Relevé Biodiversité',7900,5),
      (v_id,'fiscalite','Relevé Fiscalité',7900,6);
  else
    update portrait.releves
       set token_hash = encode(digest(v_token,'sha256'),'hex'),
           courriel   = coalesce(auth.email(), courriel)
     where id = v_id;
  end if;

  return jsonb_build_object('token', v_token);
end;
$function$;
