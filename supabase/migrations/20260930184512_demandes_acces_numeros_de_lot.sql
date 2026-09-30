-- Numéros de lot dans la demande d'accès (facultatifs) : affichés à l'employé et,
-- surtout, meilleur indice pour trouver le dossier (un nom peut exister en double,
-- un lot non). Testé : un lot possédé fait remonter le bon dossier en tête même
-- avec un nom sans rapport.
alter table public.demandes_acces add column if not exists lots text;

-- Numéros de lot saisis librement (« 5 833 738, 5835396 ») -> chiffres seulement.
create or replace function public.lots_normalises(t text)
returns text[]
language sql
immutable
as $function$
  select coalesce(array_agg(distinct regexp_replace(m[1], '\D', '', 'g')), '{}')
  from regexp_matches(coalesce(t, ''), '(\d[\d ]{5,9}\d)', 'g') as m;
$function$;
revoke all on function public.lots_normalises(text) from public, anon, authenticated;

drop function if exists public.portail_demander_acces(text, text, text, text);
create or replace function public.portail_demander_acces(
  p_nom text, p_municipalite text, p_telephone text default null, p_no_producteur text default null,
  p_lots text default null)
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
     or length(coalesce(p_no_producteur, '')) > 40
     or length(coalesce(p_lots, '')) > 200 then
    raise exception 'Champs invalides' using errcode = '22023';
  end if;

  update public.demandes_acces
     set nom = trim(p_nom), municipalite = trim(p_municipalite),
         telephone = nullif(trim(coalesce(p_telephone, '')), ''),
         no_producteur = nullif(trim(coalesce(p_no_producteur, '')), ''),
         lots = nullif(trim(coalesce(p_lots, '')), '')
   where user_id = v_uid and statut = 'en_attente'
  returning id into v_id;

  if v_id is null then
    insert into public.demandes_acces (user_id, courriel, nom, municipalite, telephone, no_producteur, lots)
    values (v_uid, public.courriel_courant(), trim(p_nom), trim(p_municipalite),
            nullif(trim(coalesce(p_telephone, '')), ''), nullif(trim(coalesce(p_no_producteur, '')), ''),
            nullif(trim(coalesce(p_lots, '')), ''))
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'statut', 'en_attente');
end;
$function$;
revoke all on function public.portail_demander_acces(text, text, text, text, text) from public, anon;
grant execute on function public.portail_demander_acces(text, text, text, text, text) to authenticated;

create or replace function public.portail_ma_demande()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('id', id, 'statut', statut, 'nom', nom, 'municipalite', municipalite,
                            'telephone', telephone, 'no_producteur', no_producteur, 'lots', lots, 'cree_le', cree_le)
  from public.demandes_acces
  where user_id = (select auth.uid())
  order by cree_le desc
  limit 1;
$function$;

-- Score : lot possédé 100, numéro de producteur 100, tous les mots du nom 60 (un seul
-- 25), une propriété dans la municipalité 30. Seuil 55, 5 suggestions au plus.
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
                exists (select 1 from public.portal_users pu where pu.producteur_id = p.id and pu.actif) as a_compte,
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
