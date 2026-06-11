// ============================================================
// auth.js – Authentification, session, rôles
// ============================================================

import { supabase, isDemoMode } from './supabase-client.js';

// ── Comptes démo ─────────────────────────────────────────────
const DEMO_ACCOUNTS = {
  'admin@demo.com':  { password: 'demo123', role: 'admin',  nom: 'Admin Démo',  prenom: 'Admin' },
  'agent@demo.com':  { password: 'demo123', role: 'agent',  nom: 'Agent Démo',  prenom: 'Agent' },
};

function getDemoProfile() {
  try { return JSON.parse(sessionStorage.getItem('demo_profile')); } catch { return null; }
}

function setDemoProfile(profile) {
  sessionStorage.setItem('demo_profile', JSON.stringify(profile));
}

function clearDemoProfile() {
  sessionStorage.removeItem('demo_profile');
}

// ── API publique ──────────────────────────────────────────────

export async function getSession() {
  if (isDemoMode) {
    const p = getDemoProfile();
    return p ? { user: { id: 'demo', email: p.email } } : null;
  }
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}

export async function getProfile(userId) {
  if (isDemoMode) return getDemoProfile();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

// Convertit un matricule (ex: "AG-001" ou "ADMIN") en email Supabase
export function matriculeToEmail(matricule) {
  return `${matricule.trim().toUpperCase()}@airport.ma`.toLowerCase();
}

// Connexion — accepte un matricule OU un email complet
export async function login(matriculeOrEmail, password) {
  const email = matriculeOrEmail.includes('@')
    ? matriculeOrEmail.toLowerCase()
    : matriculeToEmail(matriculeOrEmail);

  if (isDemoMode) {
    const account = DEMO_ACCOUNTS[email];
    if (!account || account.password !== password) {
      throw new Error('Matricule ou mot de passe incorrect.');
    }
    const profile = {
      id: 'demo',
      email,
      role: account.role,
      nom: account.nom,
      prenom: account.prenom,
      actif: true
    };
    setDemoProfile(profile);
    return { user: { id: 'demo', email } };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Déconnexion
export async function logout() {
  if (isDemoMode) {
    clearDemoProfile();
    window.location.href = '/index.html';
    return;
  }
  await supabase.auth.signOut();
  window.location.href = '/index.html';
}

// Rôles autorisés sur chaque page
const ADMIN_ROLES = ['admin', 'chef', 'superviseur'];

function getHomePage(role) {
  return ADMIN_ROLES.includes(role) ? '/admin.html' : '/agent.html';
}

// Vérifie la session + page attendue, redirige si nécessaire
// expectedPage : 'admin' | 'agent'
export async function requireRole(expectedPage) {
  if (isDemoMode) {
    const profile = getDemoProfile();
    if (!profile) { window.location.href = '/index.html'; return null; }
    const page = ADMIN_ROLES.includes(profile.role) ? 'admin' : 'agent';
    if (page !== expectedPage) {
      window.location.href = getHomePage(profile.role);
      return null;
    }
    return { session: { user: { id: 'demo', email: profile.email } }, profile };
  }

  const session = await getSession();
  if (!session) { window.location.href = '/index.html'; return null; }

  const profile = await getProfile(session.user.id);
  if (!profile || !profile.actif) {
    await supabase.auth.signOut();
    window.location.href = '/index.html';
    return null;
  }

  const page = ADMIN_ROLES.includes(profile.role) ? 'admin' : 'agent';
  if (page !== expectedPage) {
    window.location.href = getHomePage(profile.role);
    return null;
  }
  return { session, profile };
}

// Redirige après login selon le rôle
export async function redirectByRole() {
  if (isDemoMode) {
    const profile = getDemoProfile();
    if (!profile) return;
    window.location.href = getHomePage(profile.role);
    return;
  }

  const session = await getSession();
  if (!session) return;
  const profile = await getProfile(session.user.id);
  if (!profile) return;
  window.location.href = getHomePage(profile.role);
}
