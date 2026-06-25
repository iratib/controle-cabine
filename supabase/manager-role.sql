-- ============================================================
-- AJOUT DU RÔLE "manager" (mêmes droits que "chef")
-- À exécuter une fois dans Supabase → SQL Editor.
-- ============================================================

-- 1) Autoriser la valeur 'manager' dans profiles.role
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'chef', 'manager', 'superviseur', 'agent', 'suivi_kpi'));

-- 2) Recréer les policies qui accordaient les droits "chef" pour inclure "manager"
drop policy if exists "Admin voit tous les profils" on public.profiles;
create policy "Admin voit tous les profils"
  on public.profiles for all
  using (public.get_my_role() in ('admin', 'chef', 'manager', 'superviseur'));

drop policy if exists "Admin voit tous les vols" on public.vols;
create policy "Admin voit tous les vols"
  on public.vols for all
  using (public.get_my_role() in ('admin', 'chef', 'manager', 'superviseur'));

drop policy if exists "Admin voit tous les contrôles" on public.controles;
create policy "Admin voit tous les contrôles"
  on public.controles for all
  using (public.get_my_role() in ('admin', 'chef', 'manager', 'superviseur'));

drop policy if exists "Admin voit toutes les photos" on public.photos;
create policy "Admin voit toutes les photos"
  on public.photos for all
  using (public.get_my_role() in ('admin', 'chef', 'manager', 'superviseur'));

drop policy if exists "Admin voit tous les matériels" on public.materiels_utilises;
create policy "Admin voit tous les matériels"
  on public.materiels_utilises for all
  using (public.get_my_role() in ('admin', 'chef', 'manager', 'superviseur'));

drop policy if exists "Admin gère compagnies" on public.compagnies;
create policy "Admin gère compagnies"
  on public.compagnies for all
  using (public.get_my_role() in ('admin', 'chef', 'manager', 'superviseur'));

drop policy if exists "Admin gère SLA" on public.sla_config;
create policy "Admin gère SLA"
  on public.sla_config for all
  using (public.get_my_role() in ('admin', 'chef', 'manager'));

drop policy if exists "Admin supprime photos storage" on storage.objects;
create policy "Admin supprime photos storage"
  on storage.objects for delete
  using (bucket_id = 'photos-controle' and public.get_my_role() in ('admin', 'chef', 'manager', 'superviseur'));
