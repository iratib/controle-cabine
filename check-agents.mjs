// check-agents.mjs – Vérification des agents sans rien insérer
// node check-agents.mjs

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const FICHIER_MOYEN_PORTEUR = 'C:/Users/hp/Desktop/EK/CONTROLE AVION MOYEN PORTEUR (1-4760).xlsx';
const FICHIER_GROS_PORTEUR  = 'C:/Users/hp/Desktop/EK/CHECK LIST CONTROLE AVION GROS PORTEUR (1-738).xlsx';

const AGENTS_MASTER = [
  { matricule: '65736', nom: 'SABIR',    prenom: 'BOUCHAIB',   emailForms: 'BSABIR'    },
  { matricule: '65052', nom: 'AMHAOUCH', prenom: 'SOUAD',      emailForms: 'SAMHAOUCH' },
  { matricule: '65500', nom: 'KABLI',    prenom: 'DRISSIA',    emailForms: 'DKABLI'    },
  { matricule: '65265', nom: 'TADILI',   prenom: 'NADIA',      emailForms: 'NTADILI'   },
  { matricule: '67925', nom: 'GHAZAOUI', prenom: 'SAFAE',      emailForms: 'SGHAZOUI'  },
  { matricule: '65503', nom: 'KHAIA',    prenom: 'ABDERRAHIM', emailForms: 'AKHAIA'    },
  { matricule: '65358', nom: 'EDAGHRAM', prenom: 'SIHAM',      emailForms: 'SEDAGHRAM' },
];
const AGENT_BY_EMAIL = {};
for (const a of AGENTS_MASTER) AGENT_BY_EMAIL[a.emailForms] = a;

function resolveAgent(emailForms, nomBrut) {
  if (emailForms) {
    const prefix = String(emailForms).toUpperCase().split('@')[0].trim();
    if (AGENT_BY_EMAIL[prefix]) return AGENT_BY_EMAIL[prefix];
  }
  if (nomBrut) {
    const upper = String(nomBrut).toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    for (const a of AGENTS_MASTER) {
      if (upper.includes(a.nom) || upper.includes(a.prenom)) return a;
    }
  }
  return null;
}

function analyserFichier(chemin, label) {
  console.log(`\n📂 ${label}`);
  let wb;
  try { wb = XLSX.readFile(chemin, { cellDates: false }); }
  catch (e) { console.error(`   ✗ ${e.message}`); return; }

  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  console.log(`   ${rows.length - 1} lignes`);

  const reconnus   = new Map(); // email → agent
  const nonReconnus = new Map(); // email → nom brut

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c == null || c === '')) continue;
    const emailForms = String(row[3] || '').trim();
    const nomBrut    = String(row[10] || row[4] || '').trim();
    if (!emailForms && !nomBrut) continue;

    const agent = resolveAgent(emailForms, nomBrut);
    const key   = emailForms || nomBrut;

    if (agent) {
      if (!reconnus.has(key)) reconnus.set(key, agent);
    } else {
      if (!nonReconnus.has(key)) nonReconnus.set(key, nomBrut);
    }
  }

  console.log(`\n   ✅ RECONNUS (${reconnus.size}) :`);
  for (const [email, agent] of reconnus) {
    console.log(`      ${email.padEnd(30)} → ${agent.matricule}  ${agent.prenom} ${agent.nom}`);
  }

  if (nonReconnus.size > 0) {
    console.log(`\n   ❌ NON RECONNUS (${nonReconnus.size}) — à corriger :`);
    for (const [email, nom] of nonReconnus) {
      console.log(`      email: "${email}"   nom brut: "${nom}"`);
    }
  } else {
    console.log(`\n   ✅ Aucun agent non reconnu.`);
  }
}

analyserFichier(FICHIER_MOYEN_PORTEUR, 'Moyen Porteur');
analyserFichier(FICHIER_GROS_PORTEUR,  'Gros Porteur');
