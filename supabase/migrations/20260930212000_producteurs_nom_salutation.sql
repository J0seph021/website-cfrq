-- Nom à qui dire « Bonjour » dans l'espace client : le représentant du dossier
-- dans PlaniLogix (sinon le propriétaire s'il s'agit d'une personne), remis en
-- « Prénom Nom ». null pour une société sans représentant : le portail dit alors
-- « Bonjour » tout court. Rempli par scripts/noms-salutation.mjs.
alter table public.producteurs add column if not exists nom_salutation text;
comment on column public.producteurs.nom_salutation is
  'Prénom Nom du représentant (sinon du propriétaire personne), pour la salutation du portail. Rempli par scripts/noms-salutation.mjs.';
