-- ============================================================
-- SCHEMA.SQL – Application Contrôle Cabines Avions
-- Exécuter dans Supabase SQL Editor
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

-- TABLE PROFILES
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  nom text not null,
  matricule text,
  role text not null check (role in ('admin', 'chef', 'superviseur', 'agent')),
  actif boolean default true,
  created_at timestamptz default now()
);

-- TABLE VOLS
create table if not exists public.vols (
  id uuid primary key default gen_random_uuid(),
  numero_vol text not null,
  date_vol date not null,
  type_vol text not null
    check (type_vol in ('Moyen Porteur Transit','Gros Porteur Transit','Moyen Porteur Stop Cmn','Gros Porteur Stop Cmn')),
  immatriculation text,
  heure_debut time,
  heure_fin time,
  agent_id uuid references public.profiles(id),
  statut text default 'en_cours'
    check (statut in ('en_cours','soumis','validé','rejeté')),
  motif_rejet text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TABLE CONTROLES
create table if not exists public.controles (
  id uuid primary key default gen_random_uuid(),
  vol_id uuid references public.vols(id) on delete cascade not null,
  zone text not null,
  sous_zone text,
  point_controle text not null,
  conformite text check (conformite in ('C','NC')),
  observation text,
  created_at timestamptz default now()
);

-- TABLE PHOTOS
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  controle_id uuid references public.controles(id) on delete cascade,
  vol_id uuid references public.vols(id) on delete cascade,
  storage_path text not null,
  url_publique text,
  uploaded_at timestamptz default now()
);

-- TABLE MATERIELS_UTILISES
create table if not exists public.materiels_utilises (
  id uuid primary key default gen_random_uuid(),
  vol_id uuid references public.vols(id) on delete cascade,
  categorie text not null,
  nom_materiel text not null,
  quantite integer default 0,
  utilise boolean default false
);

-- ============================================================
-- TRIGGER updated_at
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.vols;
create trigger set_updated_at
  before update on public.vols
  for each row execute function update_updated_at();

-- ============================================================
-- REALTIME
-- ============================================================

alter publication supabase_realtime add table public.vols;
alter publication supabase_realtime add table public.controles;

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

insert into storage.buckets (id, name, public)
values ('photos-controle', 'photos-controle', true)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.vols enable row level security;
alter table public.controles enable row level security;
alter table public.photos enable row level security;
alter table public.materiels_utilises enable row level security;

-- Drop existing policies to avoid conflicts
drop policy if exists "Voir son profil" on public.profiles;
drop policy if exists "Admin voit tous les profils" on public.profiles;
drop policy if exists "Agent voit ses vols" on public.vols;
drop policy if exists "Agent insère ses vols" on public.vols;
drop policy if exists "Agent modifie ses vols en cours" on public.vols;
drop policy if exists "Admin voit tous les vols" on public.vols;
drop policy if exists "Agent gère ses contrôles" on public.controles;
drop policy if exists "Admin voit tous les contrôles" on public.controles;
drop policy if exists "Agent gère ses photos" on public.photos;
drop policy if exists "Admin voit toutes les photos" on public.photos;
drop policy if exists "Agent gère ses matériels" on public.materiels_utilises;
drop policy if exists "Admin voit tous les matériels" on public.materiels_utilises;
drop policy if exists "Upload photos contrôle" on storage.objects;
drop policy if exists "Lecture photos publique" on storage.objects;

-- Fonction sécurisée pour lire le rôle sans récursion RLS
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Policies profiles
create policy "Voir son profil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admin voit tous les profils"
  on public.profiles for all
  using (public.get_my_role() in ('admin', 'chef', 'superviseur'));

-- Policies vols
create policy "Agent voit ses vols"
  on public.vols for select
  using (agent_id = auth.uid());

create policy "Agent insère ses vols"
  on public.vols for insert
  with check (agent_id = auth.uid());

create policy "Agent modifie ses vols en cours"
  on public.vols for update
  using (agent_id = auth.uid() and statut = 'en_cours');

create policy "Admin voit tous les vols"
  on public.vols for all
  using (public.get_my_role() in ('admin', 'chef', 'superviseur'));

-- Policies controles
create policy "Agent gère ses contrôles"
  on public.controles for all
  using (
    exists (select 1 from public.vols
            where id = vol_id and agent_id = auth.uid())
  );

create policy "Admin voit tous les contrôles"
  on public.controles for all
  using (public.get_my_role() in ('admin', 'chef', 'superviseur'));

-- Policies photos
create policy "Agent gère ses photos"
  on public.photos for all
  using (
    exists (select 1 from public.vols
            where id = vol_id and agent_id = auth.uid())
  );

create policy "Admin voit toutes les photos"
  on public.photos for all
  using (public.get_my_role() in ('admin', 'chef', 'superviseur'));

-- Policies matériels
create policy "Agent gère ses matériels"
  on public.materiels_utilises for all
  using (
    exists (select 1 from public.vols
            where id = vol_id and agent_id = auth.uid())
  );

create policy "Admin voit tous les matériels"
  on public.materiels_utilises for all
  using (public.get_my_role() in ('admin', 'chef', 'superviseur'));

-- Storage policies
create policy "Upload photos contrôle"
  on storage.objects for insert
  with check (bucket_id = 'photos-controle' and auth.role() = 'authenticated');

create policy "Lecture photos publique"
  on storage.objects for select
  using (bucket_id = 'photos-controle');

-- ============================================================
-- NOTES : CRÉATION DES COMPTES UTILISATEURS
-- ============================================================
-- Les comptes doivent être créés manuellement dans
-- Supabase Authentication > Users, puis les profils
-- seront insérés via le trigger ou manuellement.
--
-- Comptes à créer :
--
-- 1. ADMIN@airport.ma / ADMIN2024
-- 2. AGENT.001@airport.ma / AGENT001
-- 3. AGENT.002@airport.ma / AGENT002
--
-- Après création des comptes auth, récupérer les UUID
-- et insérer dans profiles :
--
-- INSERT INTO public.profiles (id, email, nom, matricule, role)
-- VALUES
--   ('<UUID_ADMIN>',  'ADMIN@airport.ma',       'Administrateur', NULL,     'admin'),
--   ('<UUID_AGENT1>', 'AGENT.001@airport.ma',    'Agent 001',      'AG-001', 'agent'),
--   ('<UUID_AGENT2>', 'AGENT.002@airport.ma',    'Agent 002',      'AG-002', 'agent');
--
-- OU utiliser le trigger automatique ci-dessous :

-- TRIGGER AUTO-INSERT PROFILE après création auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Le profil sera créé via l'application au premier login
  -- si non existant (voir auth.js)
  return new;
end;
$$ language plpgsql security definer;
