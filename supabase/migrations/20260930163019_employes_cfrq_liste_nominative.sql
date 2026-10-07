-- Employé = une personne nommée sur la liste employes_cfrq, et non plus
-- « toute adresse @cfrq.ca ».
-- Avant : n'importe quel compte @cfrq.ca confirmé ouvrait les dossiers de tous les
-- clients, y compris un compte créé sur la boîte partagée cfrq@cfrq.ca (identité
-- partagée, donc journal d'accès inutilisable). La confirmation du courriel reste
-- exigée : être sur la liste ne suffit pas, il faut posséder la boîte.
--
-- Ajouter quelqu'un :   insert into public.employes_cfrq (courriel, nom) values ('x.y@cfrq.ca', 'Prénom Nom');
-- Retirer quelqu'un :   update public.employes_cfrq set actif = false where courriel = 'x.y@cfrq.ca';
create table if not exists public.employes_cfrq (
  courriel  text primary key check (courriel = lower(courriel)),
  nom       text not null,
  actif     boolean not null default true,
  ajoute_le timestamptz not null default now()
);
alter table public.employes_cfrq enable row level security;
revoke all on table public.employes_cfrq from anon, authenticated;

-- La liste nominative des employés n'est plus dans ce fichier : le dépôt est PUBLIC
-- (retrait le 2026-10-07, plan d'action de l'EFVP, constat 6). Elle vit dans la base
-- (déjà chargée) et, pour reconstruire une base neuve, dans le fichier LOCAL non suivi
-- supabase/seed-local/employes_cfrq.sql (voir .gitignore).

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
    join public.employes_cfrq e on e.courriel = lower(u.email) and e.actif
    where u.id = (select auth.uid())
      and u.deleted_at is null
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
  );
$function$;

revoke all on function public.est_employe_cfrq() from public, anon, authenticated;
