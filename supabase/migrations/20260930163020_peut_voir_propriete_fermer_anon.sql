-- peut_voir_propriete sert aux règles d'accès de lots et paf (rôle authenticated).
-- Un visiteur sans compte n'a aucune raison de l'appeler : on retire anon et PUBLIC,
-- et on redonne explicitement le droit à authenticated pour ne pas casser ces règles.
revoke execute on function public.peut_voir_propriete(integer) from public, anon;
grant execute on function public.peut_voir_propriete(integer) to authenticated;
