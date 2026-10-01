-- Lots et PAF : l'accès se calcule une fois par requête, plus une fois par ligne.
--
-- Les règles « proprietaire lit ses lots » et « proprietaire lit ses paf » appelaient
-- peut_voir_propriete(propriete_id) sur CHAQUE ligne de la table (2 956 lots), et
-- chaque appel relisait current_producteur_id() deux fois : environ 3,5 s à chaque
-- ouverture du tableau de bord, 4,3 s depuis l'ajout des partages d'accès.
--
-- proprietes_visibles() rend la liste des propriétés du dossier affiché. Placée dans
-- un (select ...), elle devient un InitPlan : Postgres la calcule une seule fois,
-- puis l'index lots_prop_idx trouve directement les lignes. Même résultat, mêmes
-- propriétés visibles (producteur ou propriétaire légal).

create or replace function public.proprietes_visibles()
returns integer[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(p.id), '{}')
  from public.proprietes p
  where p.producteur_id = (select public.current_producteur_id())
     or p.proprietaire_legal_producteur_id = (select public.current_producteur_id());
$function$;

-- Appelée par les règles RLS, donc avec les droits de l'appelant : authenticated
-- doit pouvoir l'exécuter. Elle ne rend que les propriétés qu'il voit déjà.
revoke execute on function public.proprietes_visibles() from public, anon;
grant execute on function public.proprietes_visibles() to authenticated;

drop policy if exists "proprietaire lit ses lots" on public.lots;
create policy "proprietaire lit ses lots" on public.lots
  as permissive for select to authenticated
  using (propriete_id = any ((select public.proprietes_visibles())::integer[]));

drop policy if exists "proprietaire lit ses paf" on public.paf;
create policy "proprietaire lit ses paf" on public.paf
  as permissive for select to authenticated
  using (propriete_id = any ((select public.proprietes_visibles())::integer[]));
