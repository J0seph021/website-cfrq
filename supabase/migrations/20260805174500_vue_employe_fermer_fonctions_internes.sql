-- Les deux fonctions d'appui de la vue employé n'ont aucune raison d'être
-- appelables depuis l'API REST : elles ne servent qu'aux autres fonctions
-- SECURITY DEFINER (qui, elles, s'exécutent sous le propriétaire et gardent
-- donc le droit de les appeler).
revoke all on function public.est_employe_cfrq() from public, anon, authenticated;
revoke all on function public.portail_vue_employe_active() from public, anon, authenticated;
