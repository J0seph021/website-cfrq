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

insert into public.employes_cfrq (courriel, nom) values
  ('a.fortier@cfrq.ca',      'Alexandra Fortier'),
  ('a.bouillon@cfrq.ca',     'Alexandre Bouillon'),
  ('ar.rheaume@cfrq.ca',     'Ann-Renée Rhéaume'),
  ('c.boisvert@cfrq.ca',     'Camay Boisvert'),
  ('c.maheu@cfrq.ca',        'Cédric Maheu'),
  ('c.dumont@cfrq.ca',       'Christian Dumont'),
  ('fo.soucy@cfrq.ca',       'Frank-Olivier Soucy'),
  ('g.kelly-poulin@cfrq.ca', 'Gabrielle Kelly-Poulin'),
  ('jb.girard@cfrq.ca',      'Jean-Benoît Girard'),
  ('j.moffet@cfrq.ca',       'Joseph Moffet'),
  ('l.chabot@cfrq.ca',       'Louis Chabot'),
  ('m.jolibois@cfrq.ca',     'Mathieu Jolibois'),
  ('p.cadorette@cfrq.ca',    'Pierre Cadorette'),
  ('s.rioux@cfrq.ca',        'Sébastien Rioux'),
  ('s.proulx@cfrq.ca',       'Simon Proulx')
on conflict (courriel) do nothing;

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
