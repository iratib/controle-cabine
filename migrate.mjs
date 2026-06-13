// ============================================================
// migrate.mjs – Import données Excel Forms → Supabase
// Usage:
//   1. npm install xlsx @supabase/supabase-js
//   2. Renseigner SERVICE_ROLE_KEY et les chemins des fichiers
//   3. node migrate.mjs
// ============================================================

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ── CONFIG ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://htkdryptzdvztcgjgfax.supabase.co';

// Supabase Dashboard → Settings → API → service_role (secret)
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2RyeXB0emR2enRjZ2pnZmF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTA2ODkxMywiZXhwIjoyMDk2NjQ0OTEzfQ.Aj_yRZ1XDUJXZHAzMGeC6l-QfUEzQLn6XCuq717_hNI';

// Chemins absolus vers vos fichiers Excel
const FICHIER_MOYEN_PORTEUR = 'C:/Users/hp/Desktop/EK/CONTROLE AVION MOYEN PORTEUR (1-4760).xlsx';
const FICHIER_GROS_PORTEUR  = 'C:/Users/hp/Desktop/EK/CHECK LIST CONTROLE AVION GROS PORTEUR (1-738).xlsx';

// ── SUPABASE (service role → bypass RLS) ─────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── MAPPING COLONNES → POINTS DE CONTRÔLE ────────────────────
// Index 0-based sur le tableau de la ligne Excel
// col = colonne valeur (C/NC), obs = colonne remarque

const MAPPING_MOYEN_PORTEUR = [
  // Cockpit
  { col: 11, obs: 12, zone: 'Cockpit',   sous_zone: null,   point: 'Sol propre (sans résidus, poussières)' },
  { col: 13, obs: 14, zone: 'Cockpit',   sous_zone: null,   point: 'Tablettes pilotes propres' },
  { col: 15, obs: 16, zone: 'Cockpit',   sous_zone: null,   point: 'Poubelles vidées' },
  { col: 17, obs: 18, zone: 'Cockpit',   sous_zone: null,   point: 'Pare-brise intérieur essuyé' },
  { col: 19, obs: 20, zone: 'Cockpit',   sous_zone: null,   point: 'Aucun objet oublié (FOD)' },
  // Cabine Y/CL
  { col: 21, obs: 22, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Sièges propres et alignés (Rangée 8-9-10-17-18-19)' },
  { col: 23, obs: 24, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Ceintures croisées correctement (Rangée 8-9-10-17-18-19)' },
  { col: 25, obs: 26, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Tablettes propres et fonctionnelles' },
  { col: 27, obs: 28, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Poches sièges vides (Rangée 8-9-10-17-18-19)' },
  { col: 29, obs: 30, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Rideaux propres' },
  { col: 31, obs: 32, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Coffres à bagages propres' },
  { col: 33, obs: 34, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Moquette aspirée' },
  // Toilettes
  { col: 35, obs: 36, zone: 'Toilettes', sous_zone: null,   point: 'Cuvette nettoyée et désinfectée' },
  { col: 37, obs: 38, zone: 'Toilettes', sous_zone: null,   point: 'Lunette toilette propre' },
  { col: 39, obs: 40, zone: 'Toilettes', sous_zone: null,   point: 'Lavabo propre et désinfecté' },
  { col: 41, obs: 42, zone: 'Toilettes', sous_zone: null,   point: 'Miroir propre' },
  { col: 43, obs: 44, zone: 'Toilettes', sous_zone: null,   point: 'Sol lavé et désinfecté' },
  { col: 45, obs: 46, zone: 'Toilettes', sous_zone: null,   point: 'Poubelle vidée' },
  { col: 47, obs: 48, zone: 'Toilettes', sous_zone: null,   point: 'Odeur neutre' },
  // Galley
  { col: 49, obs: 50, zone: 'Galley',    sous_zone: null,   point: 'Plans de travail nettoyés' },
  { col: 51, obs: 52, zone: 'Galley',    sous_zone: null,   point: 'Tiroirs propres' },
  { col: 53, obs: 54, zone: 'Galley',    sous_zone: null,   point: 'Sol nettoyé et sec' },
  { col: 55, obs: 56, zone: 'Galley',    sous_zone: null,   point: 'Poubelles vidées' },
  { col: 57, obs: 58, zone: 'Galley',    sous_zone: null,   point: 'Aucun reste alimentaire' },
  // Client
  { col: 59, obs: 60, zone: 'Client',    sous_zone: null,   point: 'Propreté générale cabine satisfaisante' },
  { col: 61, obs: 62, zone: 'Client',    sous_zone: null,   point: "Absence d'odeurs désagréables" },
  { col: 63, obs: 64, zone: 'Client',    sous_zone: null,   point: 'Tablettes sans traces' },
  { col: 65, obs: 66, zone: 'Client',    sous_zone: null,   point: 'Hublots propres' },
  { col: 67, obs: 68, zone: 'Client',    sous_zone: null,   point: 'Toilettes acceptables pour usage immédiat' },
  { col: 69, obs: 70, zone: 'Client',    sous_zone: null,   point: 'Aucun déchet visible' },
  { col: 71, obs: 72, zone: 'Client',    sous_zone: null,   point: "Impression générale positive à l'embarquement" },
];

// Gros Porteur : même mapping colonnes (même formulaire, colonnes identiques)
// Si les colonnes diffèrent, ajustez les index ici
const MAPPING_GROS_PORTEUR = MAPPING_MOYEN_PORTEUR;

// ── HELPERS ──────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return null;
  // Excel serial number
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(val).trim();
  // "4/2/2026" ou "02/04/2026"
  const parts = s.split('/');
  if (parts.length === 3) {
    const [a, b, c] = parts;
    // Année sur 4 chiffres en position 2 → j/m/aaaa
    if (c.length === 4) return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    // Année sur 2 chiffres
    if (c.length === 2) return `20${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
  }
  return s;
}

function parseTime(val) {
  if (!val) return null;
  // Excel fraction de jour
  if (typeof val === 'number') {
    const totalSec = Math.round(val * 86400);
    const h = Math.floor(totalSec / 3600) % 24;
    const m = Math.floor((totalSec % 3600) / 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  // "4/2/26 21:52:34" → extraire l'heure
  const s = String(val).trim();
  const timeMatch = s.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) return `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}`;
  return null;
}

function normalizeConformite(val) {
  if (!val) return null;
  const v = String(val).trim().toUpperCase();
  if (v === 'C')  return 'C';
  if (v === 'NC') return 'NC';
  return null; // NA ou vide → ignoré (pas de ligne controle)
}

// ── LISTE OFFICIELLE DES AGENTS ──────────────────────────────
// emailForms = préfixe de l'adresse Microsoft Forms (avant le @)
const AGENTS_MASTER = [
  { matricule: '65736', nom: 'SABIR',    prenom: 'BOUCHAIB',   emailForms: 'BSABIR',     email: 'bouchaib.sabir@ramhandling.com' },
  { matricule: '65052', nom: 'AMHAOUCH', prenom: 'SOUAD',      emailForms: 'SAMHAOUCH',  email: 'souad.amhaouch@ramhandling.com' },
  { matricule: '65500', nom: 'KABLI',    prenom: 'DRISSIA',    emailForms: 'DKABLI',     email: 'drissia.kabli@ramhandling.com' },
  { matricule: '65265', nom: 'TADILI',   prenom: 'NADIA',      emailForms: 'NTADILI',    email: 'nadia.tadili@ramhandling.com' },
  { matricule: '67925', nom: 'GHAZAOUI', prenom: 'SAFAE',      emailForms: 'SGHAZOUI',   email: 'safae.ghazaoui@ramhandling.com' },
  { matricule: '65503', nom: 'KHAIA',    prenom: 'ABDERRAHIM', emailForms: 'AKHAIA',     email: 'abderrahim.khaia@ramhandling.com' },
  { matricule: '65358', nom: 'EDAGHRAM', prenom: 'SIHAM',      emailForms: 'SEDAGHRAM',  email: 'siham.edaghram@ramhandling.com' },
];

// Index de recherche par préfixe email Forms
const AGENT_BY_EMAIL = {};
for (const a of AGENTS_MASTER) AGENT_BY_EMAIL[a.emailForms] = a;

// Résoudre via l'adresse de messagerie Forms (col 3) — fiable
// Fallback : recherche par nom/prénom dans la chaîne brute
function resolveAgent(emailForms, nomBrut) {
  if (emailForms) {
    const prefix = String(emailForms).toUpperCase().split('@')[0].trim();
    if (AGENT_BY_EMAIL[prefix]) return AGENT_BY_EMAIL[prefix];
  }
  // Fallback nom
  if (nomBrut) {
    const upper = String(nomBrut).toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    for (const agent of AGENTS_MASTER) {
      if (upper.includes(agent.nom) || upper.includes(agent.prenom)) return agent;
    }
  }
  return null;
}

// ── CACHE AGENTS ─────────────────────────────────────────────
const agentCache = {}; // matricule → uuid

async function getOrCreateAgent(emailForms, nomBrut) {
  const agent = resolveAgent(emailForms, nomBrut);
  if (!agent) {
    console.warn(`  ⚠ Nom non reconnu : "${nomBrut}" → ligne ignorée`);
    return null;
  }
  if (agentCache[agent.matricule]) return agentCache[agent.matricule];

  // Chercher si l'utilisateur auth existe déjà
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  let userId;
  const existing = users?.find(u => u.email === agent.email);

  if (existing) {
    userId = existing.id;
    console.log(`  = Agent existant : ${agent.prenom} ${agent.nom}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: agent.email,
      password: 'RamHandling2025!',
      email_confirm: true,
    });
    if (error) { console.error(`  ✗ Erreur création "${agent.nom}":`, error.message); return null; }
    userId = data.user.id;
    console.log(`  + Agent créé : ${agent.prenom} ${agent.nom} → ${agent.email}`);
  }

  // Upsert profil
  const { error: profErr } = await supabase.from('profiles').upsert({
    id: userId,
    email: agent.email,
    nom: `${agent.prenom} ${agent.nom}`,
    matricule: agent.matricule,
    role: 'agent',
  }, { onConflict: 'id' });
  if (profErr) console.warn(`  ⚠ Profil "${agent.nom}":`, profErr.message);

  agentCache[agent.matricule] = userId;
  return userId;
}

// ── TRAITEMENT D'UN FICHIER ───────────────────────────────────
async function importerFichier(cheminFichier, typeVol, mapping) {
  console.log(`\n📂 ${typeVol}`);
  console.log(`   Fichier : ${cheminFichier}`);

  let wb;
  try {
    wb = XLSX.readFile(cheminFichier, { cellDates: false });
  } catch (e) {
    console.error(`   ✗ Impossible d'ouvrir le fichier : ${e.message}`);
    return;
  }

  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  console.log(`   ${rows.length - 1} lignes à traiter`);

  let inseres = 0, erreurs = 0, ignores = 0, nonReconnus = 0;
  const nomsInconnus = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c == null || c === '')) { ignores++; continue; }

    // Col 3 = adresse messagerie (fiable), col 10 = "Contrôlé par", col 4 = "Nom"
    const emailForms = String(row[3] || '').trim();
    const nomBrut    = String(row[10] || row[4] || '').trim();
    if (!emailForms && !nomBrut) { ignores++; continue; }

    const agentId = await getOrCreateAgent(emailForms, nomBrut);
    if (!agentId) { nonReconnus++; nomsInconnus.add(emailForms || nomBrut); continue; }

    const numeroVol  = row[6] ? String(row[6]).trim().toUpperCase() : '';
    const dateVol    = parseDate(row[8]);
    const heureDebut = parseTime(row[1]);
    const heureFin   = parseTime(row[2]);
    const immat      = row[7] ? String(row[7]).trim().toUpperCase() : null;

    if (!numeroVol || !dateVol) {
      console.warn(`  ⚠ Ligne ${i+1} : numéro vol ou date manquant, ignorée`);
      ignores++; continue;
    }

    // Insérer le vol
    const { data: vol, error: volErr } = await supabase
      .from('vols')
      .insert({
        agent_id:       agentId,
        type_vol:       typeVol,
        numero_vol:     numeroVol,
        date_vol:       dateVol,
        immatriculation: immat,
        heure_debut:    heureDebut,
        heure_fin:      heureFin,
        statut:         'soumis',
        source:         'migration',
      })
      .select('id')
      .single();

    if (volErr) {
      console.error(`  ✗ Ligne ${i+1} (vol) :`, volErr.message);
      erreurs++; continue;
    }

    // Construire les lignes contrôles
    const controles = [];
    for (const m of mapping) {
      const conformite = normalizeConformite(row[m.col]);
      if (!conformite) continue;
      const obs = row[m.obs] ? String(row[m.obs]).trim() : null;
      controles.push({
        vol_id:         vol.id,
        zone:           m.zone,
        sous_zone:      m.sous_zone,
        point_controle: m.point,
        conformite,
        observation:    obs || null,
      });
    }

    if (controles.length > 0) {
      const { error: ctrlErr } = await supabase.from('controles').insert(controles);
      if (ctrlErr) console.error(`  ✗ Ligne ${i+1} (controles) :`, ctrlErr.message);
    }

    inseres++;
    if (inseres % 200 === 0) console.log(`   … ${inseres} vols insérés`);
  }

  console.log(`\n   ✅ Résultat : ${inseres} insérés | ${erreurs} erreurs | ${nonReconnus} agents non reconnus | ${ignores} vides`);
  if (nomsInconnus.size > 0) {
    console.log(`   ⚠ Emails/noms non reconnus :`);
    for (const n of nomsInconnus) console.log(`      - "${n}"`);
  }
}

// ── POINT D'ENTRÉE ────────────────────────────────────────────
async function main() {
  if (SERVICE_ROLE_KEY === 'REMPLACER_PAR_SERVICE_ROLE_KEY') {
    console.error('❌ Veuillez renseigner SERVICE_ROLE_KEY dans le script.');
    process.exit(1);
  }

  console.log('🚀 Début de la migration\n');

  await importerFichier(FICHIER_MOYEN_PORTEUR, 'Moyen Porteur Transit', MAPPING_MOYEN_PORTEUR);
  await importerFichier(FICHIER_GROS_PORTEUR,  'Gros Porteur Transit',  MAPPING_GROS_PORTEUR);

  console.log('\n📋 Agents créés / retrouvés :');
  for (const [nom, id] of Object.entries(agentCache)) {
    console.log(`   ${nom.padEnd(30)} ${nomToEmail(nom)}   (mot de passe: RamHandling2025!)`);
  }

  console.log('\n✅ Migration terminée.');
}

main().catch(err => { console.error('Erreur fatale :', err); process.exit(1); });
