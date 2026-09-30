-- Les fonctions du Portrait ne doivent pas être appelables par le rôle `anon`.
--
-- Piège Supabase : `revoke ... from public` ne suffit pas. À la création d'une
-- fonction dans le schéma `public`, Supabase accorde EXECUTE **explicitement** à
-- `anon`, `authenticated` et `service_role`. Un `revoke from public` ne retire que
-- le droit implicite de PUBLIC et laisse `anon` appeler la fonction par PostgREST.
-- Il faut donc révoquer nommément, et le refaire après chaque `create or replace`.
--
-- Constaté le 2026-09-15 : `marquer_achat` (qui marque un relevé comme payé) était
-- exécutable par tout visiteur, connecté ou non. Corrigé en base le jour même ; cette
-- migration existe pour qu'un redéploiement ne rouvre pas la porte.
--
-- Les deux fonctions restent ouvertes à `authenticated` : c'est le client connecté
-- qui les appelle depuis son espace client, et elles sont bornées par
-- `current_producteur_id()`, donc chacun ne voit que son propre dossier.
--
-- Le `do` garde les révocations idempotentes et tolère l'absence d'une fonction :
-- `portrait_offre_client` a été appliquée hors migration et n'existe pas sur une base
-- reconstruite de zéro.

do $$
begin
  if to_regprocedure('public.portrait_token_client()') is not null then
    revoke execute on function public.portrait_token_client() from public, anon;
    grant  execute on function public.portrait_token_client() to authenticated;
  end if;

  if to_regprocedure('public.portrait_offre_client()') is not null then
    revoke execute on function public.portrait_offre_client() from public, anon;
    grant  execute on function public.portrait_offre_client() to authenticated;
  end if;
end $$;
