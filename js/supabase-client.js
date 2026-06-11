// ============================================================
// supabase-client.js – Initialisation Supabase
// IMPORTANT : Remplacer les valeurs ci-dessous par vos
// credentials Supabase (Project URL + anon key)
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://htkdryptzdvztcgjgfax.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2RyeXB0emR2enRjZ2pnZmF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNjg5MTMsImV4cCI6MjA5NjY0NDkxM30.SaMz55J0D6w8T8wWBxO7Tx755Eb0mwWf42sBhIKX4Js';

// Mode démo activé automatiquement si Supabase n'est pas configuré
export const isDemoMode = SUPABASE_URL.includes('VOTRE_PROJECT_ID');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export { SUPABASE_URL, SUPABASE_ANON_KEY };
