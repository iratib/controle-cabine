-- ============================================================
-- IMMATRICULATIONS.SQL
-- Exécuter dans Supabase SQL Editor après schema.sql
-- ============================================================

-- 1. Ajouter la colonne type_avion dans la table vols
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS type_avion text
  CHECK (type_avion IN ('ATR', '737', '787', 'E190', '767'));

-- 2. Créer la table immatriculations
CREATE TABLE IF NOT EXISTS public.immatriculations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type_avion    text        NOT NULL CHECK (type_avion IN ('ATR', '737', '787', 'E190', '767')),
  immatriculation text      NOT NULL,
  actif         boolean     DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (type_avion, immatriculation)
);

-- 3. Row Level Security
ALTER TABLE public.immatriculations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gère immatriculations" ON public.immatriculations;
DROP POLICY IF EXISTS "Lecture immatriculations authentifié" ON public.immatriculations;

CREATE POLICY "Admin gère immatriculations"
  ON public.immatriculations FOR ALL
  USING (public.get_my_role() IN ('admin', 'chef', 'superviseur'));

CREATE POLICY "Lecture immatriculations authentifié"
  ON public.immatriculations FOR SELECT
  USING (auth.role() = 'authenticated');

-- 4. Données exemples (optionnel — à supprimer ou adapter)
-- INSERT INTO public.immatriculations (type_avion, immatriculation) VALUES
--   ('ATR', 'CN-COC'), ('ATR', 'CN-COD'), ('ATR', 'CN-COE'),
--   ('737', 'CN-RGX'), ('737', 'CN-RGY'), ('737', 'CN-RGZ'),
--   ('787', 'CN-RGT'), ('787', 'CN-RGU'),
--   ('E190', 'CN-RGA'), ('E190', 'CN-RGB'),
--   ('767', 'CN-RNL'), ('767', 'CN-RNM')
-- ON CONFLICT DO NOTHING;
