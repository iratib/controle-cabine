-- ============================================================
-- sla-lecture-superviseur.sql
-- Restreint l'ÉCRITURE de la configuration SLA à admin + chef.
-- Le superviseur garde la LECTURE (via "Lecture SLA authentifié").
-- À exécuter UNE FOIS dans Supabase → SQL Editor.
-- ============================================================

drop policy if exists "Admin gère SLA" on public.sla_config;
create policy "Admin gère SLA"
  on public.sla_config for all
  using (public.get_my_role() in ('admin', 'chef'));
