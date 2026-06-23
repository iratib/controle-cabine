-- ============================================================
-- suivi-kpi.sql – Profil "Suivi KPI" (consultation seule)
-- ------------------------------------------------------------
-- À exécuter UNE FOIS dans Supabase → SQL Editor.
-- Ce profil voit toutes les données en LECTURE SEULE
-- (aucune écriture possible, garantie au niveau de la base).
-- ============================================================

-- 1) Autoriser la nouvelle valeur de rôle ---------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'chef', 'superviseur', 'agent', 'suivi_kpi'));

-- 2) Policies LECTURE SEULE pour le rôle suivi_kpi ------------
--    (uniquement SELECT → aucune écriture possible)

drop policy if exists "Suivi KPI lit profils" on public.profiles;
create policy "Suivi KPI lit profils"
  on public.profiles for select
  using (public.get_my_role() = 'suivi_kpi');

drop policy if exists "Suivi KPI lit vols" on public.vols;
create policy "Suivi KPI lit vols"
  on public.vols for select
  using (public.get_my_role() = 'suivi_kpi');

drop policy if exists "Suivi KPI lit controles" on public.controles;
create policy "Suivi KPI lit controles"
  on public.controles for select
  using (public.get_my_role() = 'suivi_kpi');

drop policy if exists "Suivi KPI lit photos" on public.photos;
create policy "Suivi KPI lit photos"
  on public.photos for select
  using (public.get_my_role() = 'suivi_kpi');

drop policy if exists "Suivi KPI lit materiels" on public.materiels_utilises;
create policy "Suivi KPI lit materiels"
  on public.materiels_utilises for select
  using (public.get_my_role() = 'suivi_kpi');

-- Table immatriculations : si elle existe, autoriser la lecture.
-- (Si la table n'existe pas chez vous, ignorez l'erreur sur ce bloc.)
drop policy if exists "Suivi KPI lit immatriculations" on public.immatriculations;
create policy "Suivi KPI lit immatriculations"
  on public.immatriculations for select
  using (public.get_my_role() = 'suivi_kpi');

-- NB : compagnies et sla_config sont déjà lisibles par tout
--      utilisateur authentifié → rien à ajouter pour la lecture.

-- 3) Créer le compte + le profil -----------------------------
-- a. Supabase → Authentication → Users → "Add user"
--    Email    : suivi-kpi@airport.ma
--    Password : (choisir, EN MAJUSCULES) ex. KPI2026
--    ✅ cocher "Auto Confirm User"
-- b. Copier l'UUID du compte créé, puis exécuter :
--
-- insert into public.profiles (id, email, nom, matricule, role, actif)
-- values ('<UUID_DU_COMPTE>', 'suivi-kpi@airport.ma', 'Suivi KPI', null, 'suivi_kpi', true);
