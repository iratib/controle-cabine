// ============================================================
// migrate-fix-controles.mjs
// Répare les vols sans contrôles : insère uniquement les contrôles
// manquants à partir des fichiers Excel, sans toucher aux vols
// ni aux contrôles déjà enregistrés.
//
// Usage :
//   node migrate-fix-controles.mjs
// ============================================================

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ── CONFIG ───────────────────────────────────────────────────
const SUPABASE_URL     = 'https://htkdryptzdvztcgjgfax.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2RyeXB0emR2enRjZ2pnZmF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTA2ODkxMywiZXhwIjoyMDk2NjQ0OTEzfQ.Aj_yRZ1XDUJXZHAzMGeC6l-QfUEzQLn6XCuq717_hNI';

const FICHIER_MOYEN_PORTEUR = 'C:/Users/hp/Desktop/EK/CONTROLE AVION MOYEN PORTEUR (1-4760).xlsx';
const FICHIER_GROS_PORTEUR  = 'C:/Users/hp/Desktop/EK/CHECK LIST CONTROLE AVION GROS PORTEUR (1-738).xlsx';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── MAPPING (identique à migrate.mjs) ────────────────────────
const MAPPING_MOYEN_PORTEUR = [
  { col: 11, obs: 12, zone: 'Cockpit',   sous_zone: null,   point: 'Sol propre (sans résidus, poussières)' },
  { col: 13, obs: 14, zone: 'Cockpit',   sous_zone: null,   point: 'Tablettes pilotes propres' },
  { col: 15, obs: 16, zone: 'Cockpit',   sous_zone: null,   point: 'Poubelles vidées' },
  { col: 17, obs: 18, zone: 'Cockpit',   sous_zone: null,   point: 'Pare-brise intérieur essuyé' },
  { col: 19, obs: 20, zone: 'Cockpit',   sous_zone: null,   point: 'Aucun objet oublié (FOD)' },
  { col: 21, obs: 22, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Sièges propres et alignés (Rangée 8-9-10-17-18-19)' },
  { col: 23, obs: 24, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Ceintures croisées correctement (Rangée 8-9-10-17-18-19)' },
  { col: 25, obs: 26, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Tablettes propres et fonctionnelles' },
  { col: 27, obs: 28, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Poches sièges vides (Rangée 8-9-10-17-18-19)' },
  { col: 29, obs: 30, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Rideaux propres' },
  { col: 31, obs: 32, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Coffres à bagages propres' },
  { col: 33, obs: 34, zone: 'Cabine',    sous_zone: 'Y/CL', point: 'Moquette aspirée' },
  { col: 35, obs: 36, zone: 'Toilettes', sous_zone: null,   point: 'Cuvette nettoyée et désinfectée' },
  { col: 37, obs: 38, zone: 'Toilettes', sous_zone: null,   point: 'Lunette toilette propre' },
  { col: 39, obs: 40, zone: 'Toilettes', sous_zone: null,   point: 'Lavabo propre et désinfecté' },
  { col: 41, obs: 42, zone: 'Toilettes', sous_zone: null,   point: 'Miroir propre' },
  { col: 43, obs: 44, zone: 'Toilettes', sous_zone: null,   point: 'Sol lavé et désinfecté' },
  { col: 45, obs: 46, zone: 'Toilettes', sous_zone: null,   point: 'Poubelle vidée' },
  { col: 47, obs: 48, zone: 'Toilettes', sous_zone: null,   point: 'Odeur neutre' },
  { col: 49, obs: 50, zone: 'Galley',    sous_zone: null,   point: 'Plans de travail nettoyés' },
  { col: 51, obs: 52, zone: 'Galley',    sous_zone: null,   point: 'Tiroirs propres' },
  { col: 53, obs: 54, zone: 'Galley',    sous_zone: null,   point: 'Sol nettoyé et sec' },
  { col: 55, obs: 56, zone: 'Galley',    sous_zone: null,   point: 'Poubelles vidées' },
  { col: 57, obs: 58, zone: 'Galley',    sous_zone: null,   point: 'Aucun reste alimentaire' },
  { col: 59, obs: 60, zone: 'Client',    sous_zone: null,   point: 'Propreté générale cabine satisfaisante' },
  { col: 61, obs: 62, zone: 'Client',    sous_zone: null,   point: "Absence d'odeurs désagréables" },
  { col: 63, obs: 64, zone: 'Client',    sous_zone: null,   point: 'Tablettes sans traces' },
  { col: 65, obs: 66, zone: 'Client',    sous_zone: null,   point: 'Hublots propres' },
  { col: 67, obs: 68, zone: 'Client',    sous_zone: null,   point: 'Toilettes acceptables pour usage immédiat' },
  { col: 69, obs: 70, zone: 'Client',    sous_zone: null,   point: 'Aucun déchet visible' },
  { col: 71, obs: 72, zone: 'Client',    sous_zone: null,   point: "Impression générale positive à l'embarquement" },
];
const MAPPING_GROS_PORTEUR = MAPPING_MOYEN_PORTEUR;

// ── HELPERS ──────────────────────────────────────────────────
function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(val).trim();
  const parts = s.split('/');
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (c.length === 4) return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    if (c.length === 2) return `20${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
  }
  return s;
}

function normalizeConformite(val) {
  if (!val) return null;
  const v = String(val).trim().toUpperCase();
  if (v === 'C')  return 'C';
  if (v === 'NC') return 'NC';
  return null;
}

// Normalise le numéro de vol : supprime les espaces multiples, uppercase
function normalizeNumVol(val) {
  if (!val) return '';
  return String(val).trim().toUpperCase().replace(/\s+/g, ' ');
}

// ── ÉTAPE 1 : Charger tous les vols sans contrôles depuis Supabase ──
async function chargerVolsSansControles() {
  console.log('📡 Chargement des vols sans contrôles depuis Supabase…');

  // On récupère tous les vols et on filtre côté script (pas de COUNT en RPC simple)
  // On utilise une requête SQL directe via rpc ou on fait en deux temps

  // Récupère tous les vols
  const { data: vols, error } = await supabase
    .from('vols')
    .select('id, numero_vol, date_vol, type_vol, immatriculation, agent_id')
    .eq('statut', 'soumis');

  if (error) { console.error('✗ Erreur chargement vols :', error.message); process.exit(1); }

  // Pour chaque vol, vérifier s'il a des contrôles (par batch de 500 vol_ids)
  const volIds = vols.map(v => v.id);
  const volsAvecControles = new Set();

  const CHUNK = 500;
  for (let i = 0; i < volIds.length; i += CHUNK) {
    const chunk = volIds.slice(i, i + CHUNK);
    const { data: ctrl } = await supabase
      .from('controles')
      .select('vol_id')
      .in('vol_id', chunk);
    if (ctrl) ctrl.forEach(c => volsAvecControles.add(c.vol_id));
  }

  const sansCtrls = vols.filter(v => !volsAvecControles.has(v.id));
  console.log(`   ${vols.length} vols au total, ${sansCtrls.length} sans contrôles\n`);

  // Construire un index : "NUMERO_VOL|DATE" → [vol, vol, ...]
  // (plusieurs entrées possibles si même vol/date avec immat différente)
  const index = {};
  for (const v of sansCtrls) {
    const key = `${normalizeNumVol(v.numero_vol)}|${v.date_vol}`;
    if (!index[key]) index[key] = [];
    index[key].push(v);
  }

  return index;
}

// ── ÉTAPE 2 : Parcourir l'Excel et insérer les contrôles manquants ──
async function reparer(cheminFichier, typeVolLabel, mapping, volsIndex) {
  console.log(`\n📂 ${typeVolLabel}`);
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
  console.log(`   ${rows.length - 1} lignes dans le fichier`);

  let repares = 0, nonTrouves = 0, sansData = 0, erreurs = 0;
  const nonTrouvesListe = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c == null || c === '')) continue;

    const numeroVol = normalizeNumVol(row[6]);
    const dateVol   = parseDate(row[8]);

    if (!numeroVol || !dateVol) continue;

    const key = `${numeroVol}|${dateVol}`;
    const candidats = volsIndex[key];

    if (!candidats || candidats.length === 0) {
      // Ce vol de l'Excel existe déjà avec des contrôles → on ignore
      continue;
    }

    // Construire les contrôles depuis cette ligne Excel
    const controles = [];
    for (const m of mapping) {
      const conformite = normalizeConformite(row[m.col]);
      if (!conformite) continue;
      const obs = row[m.obs] ? String(row[m.obs]).trim() : null;
      controles.push({
        zone:           m.zone,
        sous_zone:      m.sous_zone,
        point_controle: m.point,
        conformite,
        observation:    obs || null,
      });
    }

    if (controles.length === 0) {
      console.warn(`   ⚠ Ligne ${i+1} (${numeroVol} / ${dateVol}) : aucune valeur C/NC dans l'Excel`);
      sansData++;
      continue;
    }

    // S'il y a plusieurs vols avec même numéro/date (cas rare), on les traite tous
    for (const vol of candidats) {
      const rows_insert = controles.map(c => ({ ...c, vol_id: vol.id }));
      const { error } = await supabase.from('controles').insert(rows_insert);
      if (error) {
        console.error(`   ✗ Ligne ${i+1} (${numeroVol} / ${dateVol}) :`, error.message);
        erreurs++;
      } else {
        console.log(`   ✅ ${numeroVol} | ${dateVol} → ${controles.length} contrôles insérés`);
        repares++;
        // Retirer du index pour éviter double-insertion si la ligne apparaît 2× dans l'Excel
        delete volsIndex[key];
      }
    }
  }

  // Lister les vols qui n'ont pas été trouvés dans l'Excel
  for (const [key, vols] of Object.entries(volsIndex)) {
    const [numVol, date] = key.split('|');
    // Filtrer par type_vol correspondant à ce fichier
    const correspondants = vols.filter(v => v.type_vol === typeVolLabel ||
      (typeVolLabel.includes('Gros') && v.type_vol.includes('Gros')) ||
      (typeVolLabel.includes('Moyen') && v.type_vol.includes('Moyen'))
    );
    if (correspondants.length > 0) {
      nonTrouvesListe.push({ numVol, date, vols: correspondants });
      nonTrouves += correspondants.length;
    }
  }

  console.log(`\n   ✅ Résultat : ${repares} réparés | ${sansData} sans data Excel | ${erreurs} erreurs`);
  if (nonTrouvesListe.length > 0) {
    console.log(`\n   ⚠ ${nonTrouves} vol(s) sans contrôles NON TROUVÉS dans ce fichier Excel :`);
    for (const { numVol, date } of nonTrouvesListe) {
      console.log(`      - ${numVol} | ${date}`);
    }
  }
}

// ── POINT D'ENTRÉE ────────────────────────────────────────────
async function main() {
  console.log('🔧 Migration de réparation – contrôles manquants\n');

  // Charger l'index des vols sans contrôles
  const volsIndex = await chargerVolsSansControles();

  if (Object.keys(volsIndex).length === 0) {
    console.log('✅ Aucun vol sans contrôles. Rien à faire.');
    return;
  }

  // Réparer depuis les deux fichiers Excel
  await reparer(FICHIER_MOYEN_PORTEUR, 'Moyen Porteur Transit', MAPPING_MOYEN_PORTEUR, volsIndex);
  await reparer(FICHIER_GROS_PORTEUR,  'Gros Porteur Transit',  MAPPING_GROS_PORTEUR,  volsIndex);

  console.log('\n✅ Réparation terminée.');
}

main().catch(err => { console.error('Erreur fatale :', err); process.exit(1); });
