// ============================================================
// demo-db.js – Base de données en mémoire (mode démo)
// Activé automatiquement quand Supabase n'est pas configuré.
// ============================================================

const today      = new Date().toISOString().split('T')[0];
const yesterday  = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().split('T')[0];
const threeDaysAgo = new Date(Date.now() - 259200000).toISOString().split('T')[0];

// ── Agents ───────────────────────────────────────────────────

let _agents = [
  { id: 'agent-1', email: 'agent@demo.com',    nom: 'Ben Ali Hassan', matricule: 'AGT-001', role: 'agent', actif: true },
  { id: 'agent-2', email: 'dupont@demo.com',   nom: 'Dupont Marie',   matricule: 'AGT-002', role: 'agent', actif: true },
  { id: 'agent-3', email: 'rahman@demo.com',   nom: 'El Rahman Youssef', matricule: 'AGT-003', role: 'agent', actif: false },
];
let _agentCounter = 4;

// ── Vols ─────────────────────────────────────────────────────

let _vols = [
  { id: 'vol-1', numero_vol: 'AT621', date_vol: today,        type_vol: 'Gros Porteur Transit',    immatriculation: 'CN-RGB', heure_debut: '06:30', heure_fin: '08:45', agent_id: 'demo',    statut: 'soumis',  created_at: today+'T06:30:00Z',      updated_at: today+'T08:52:00Z' },
  { id: 'vol-2', numero_vol: 'AT305', date_vol: today,        type_vol: 'Gros Porteur Transit',    immatriculation: 'CN-RGA', heure_debut: '14:00', heure_fin: null,    agent_id: 'demo',    statut: 'en_cours',created_at: today+'T14:00:00Z',      updated_at: today+'T14:00:00Z' },
  { id: 'vol-3', numero_vol: 'AT102', date_vol: yesterday,    type_vol: 'Gros Porteur Stop Cmn',   immatriculation: 'CN-RGC', heure_debut: '09:00', heure_fin: '11:00', agent_id: 'demo',    statut: 'validé',  created_at: yesterday+'T09:00:00Z',  updated_at: yesterday+'T11:20:00Z' },
  { id: 'vol-4', numero_vol: 'AT850', date_vol: twoDaysAgo,   type_vol: 'Moyen Porteur Stop Cmn',  immatriculation: 'CN-RGD', heure_debut: '08:00', heure_fin: '10:30', agent_id: 'demo',    statut: 'rejeté',  created_at: twoDaysAgo+'T08:00:00Z', updated_at: twoDaysAgo+'T10:45:00Z', motif_rejet: 'Toilettes insuffisamment désinfectées' },
  { id: 'vol-5', numero_vol: 'AT210', date_vol: today,        type_vol: 'Gros Porteur Transit',    immatriculation: 'CN-RGE', heure_debut: '07:00', heure_fin: '09:15', agent_id: 'agent-1', statut: 'soumis',  created_at: today+'T07:00:00Z',      updated_at: today+'T09:20:00Z', profiles: { nom: 'Ben Ali Hassan', matricule: 'AGT-001' } },
  { id: 'vol-6', numero_vol: 'AT730', date_vol: yesterday,    type_vol: 'Moyen Porteur Transit',   immatriculation: 'CN-RGF', heure_debut: '12:00', heure_fin: '14:00', agent_id: 'agent-2', statut: 'validé',  created_at: yesterday+'T12:00:00Z',  updated_at: yesterday+'T14:10:00Z', profiles: { nom: 'Dupont Marie', matricule: 'AGT-002' } },
  { id: 'vol-7', numero_vol: 'AT412', date_vol: threeDaysAgo, type_vol: 'Moyen Porteur Transit',   immatriculation: 'CN-RGG', heure_debut: '16:00', heure_fin: '17:30', agent_id: 'agent-1', statut: 'validé',  created_at: threeDaysAgo+'T16:00:00Z',updated_at: threeDaysAgo+'T17:45:00Z', profiles: { nom: 'Ben Ali Hassan', matricule: 'AGT-001' } },
];
let _volCounter = 8;

// ── Controles ─────────────────────────────────────────────────

let _controles = {
  'vol-1': [
    { id: 'c1',  vol_id: 'vol-1', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Sol aspiré',                      conformite: 'C',  observation: null },
    { id: 'c2',  vol_id: 'vol-1', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Sièges pilotes propres',           conformite: 'NC', observation: 'Traces sur le siège gauche' },
    { id: 'c3',  vol_id: 'vol-1', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Poubelles vidées',                 conformite: 'C',  observation: null },
    { id: 'c4',  vol_id: 'vol-1', zone: 'Toilettes', sous_zone: null,   point_controle: 'Nettoyage complet et désinfection',conformite: 'C',  observation: null },
    { id: 'c5',  vol_id: 'vol-1', zone: 'Toilettes', sous_zone: null,   point_controle: 'Poubelles vidées',                 conformite: 'NC', observation: 'Poubelle AV non vidée' },
    { id: 'c6',  vol_id: 'vol-1', zone: 'Galley',    sous_zone: null,   point_controle: 'Plans de travail désinfectés',     conformite: 'C',  observation: null },
    { id: 'c7',  vol_id: 'vol-1', zone: 'Galley',    sous_zone: null,   point_controle: 'Bonne odeur cabine',               conformite: 'C',  observation: null },
    { id: 'c8',  vol_id: 'vol-1', zone: 'Cabine',    sous_zone: 'Y/CL', point_controle: 'Moquette aspirée',                 conformite: 'C',  observation: null },
    { id: 'c9',  vol_id: 'vol-1', zone: 'Client',    sous_zone: null,   point_controle: 'Hublots propres, conforme loup',   conformite: 'NC', observation: 'Traces de doigts sur 3 hublots rangée 15' },
  ],
  'vol-2': [],
  'vol-3': [
    { id: 'c10', vol_id: 'vol-3', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Sol aspiré',                      conformite: 'C',  observation: null },
    { id: 'c11', vol_id: 'vol-3', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Sièges pilotes propres',           conformite: 'C',  observation: null },
    { id: 'c12', vol_id: 'vol-3', zone: 'Galley',    sous_zone: null,   point_controle: 'Plans de travail désinfectés',     conformite: 'NC', observation: 'Taches sur le plan de travail AV' },
    { id: 'c13', vol_id: 'vol-3', zone: 'Cabine',    sous_zone: 'Y/CL', point_controle: 'Moquette aspirée',                 conformite: 'C',  observation: null },
    { id: 'c14', vol_id: 'vol-3', zone: 'Toilettes', sous_zone: null,   point_controle: 'Nettoyage complet et désinfection',conformite: 'C',  observation: null },
    { id: 'c15', vol_id: 'vol-3', zone: 'Client',    sous_zone: null,   point_controle: 'Cabine visuellement propre',       conformite: 'C',  observation: null },
  ],
  'vol-4': [
    { id: 'c16', vol_id: 'vol-4', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Sol aspiré',                                    conformite: 'C',  observation: null },
    { id: 'c17', vol_id: 'vol-4', zone: 'Toilettes', sous_zone: null,   point_controle: 'Nettoyage complet et désinfection',              conformite: 'NC', observation: 'Insuffisant – odeur persistante' },
    { id: 'c18', vol_id: 'vol-4', zone: 'Galley',    sous_zone: null,   point_controle: 'Sol lavé et désinfecté',                         conformite: 'NC', observation: 'Sol mouillé non essuyé' },
    { id: 'c30', vol_id: 'vol-4', zone: 'Client',    sous_zone: null,   point_controle: 'Propreté générale cabine satisfaisante',          conformite: 'NC', observation: 'Cabine visuellement sale à l\'embarquement' },
    { id: 'c31', vol_id: 'vol-4', zone: 'Client',    sous_zone: null,   point_controle: "Absence d'odeurs désagréables",                  conformite: 'NC', observation: 'Odeur persistante toilettes AV' },
    { id: 'c32', vol_id: 'vol-4', zone: 'Client',    sous_zone: null,   point_controle: 'Hublots propres',                                conformite: 'C',  observation: null },
    { id: 'c33', vol_id: 'vol-4', zone: 'Client',    sous_zone: null,   point_controle: 'Aucun déchet visible',                           conformite: 'NC', observation: 'Résidus dans poche siège rangée 12' },
    { id: 'c34', vol_id: 'vol-4', zone: 'Client',    sous_zone: null,   point_controle: "Impression générale positive à l'embarquement",  conformite: 'NC', observation: 'Impression mitigée – écarts visibles' },
  ],
  'vol-5': [
    { id: 'c19', vol_id: 'vol-5', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Sol aspiré',                                    conformite: 'C',  observation: null },
    { id: 'c20', vol_id: 'vol-5', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Poubelles vidées',                               conformite: 'C',  observation: null },
    { id: 'c21', vol_id: 'vol-5', zone: 'Cabine',    sous_zone: 'Y/CL', point_controle: 'Sièges propres (dossiers, accoudoirs 18-11-12-24-25)', conformite: 'NC', observation: 'Rangée 24 tachée' },
    { id: 'c22', vol_id: 'vol-5', zone: 'Galley',    sous_zone: null,   point_controle: 'Plans de travail désinfectés',                   conformite: 'C',  observation: null },
    { id: 'c35', vol_id: 'vol-5', zone: 'Client',    sous_zone: null,   point_controle: 'Cabine visuellement propre',                     conformite: 'C',  observation: null },
    { id: 'c36', vol_id: 'vol-5', zone: 'Client',    sous_zone: null,   point_controle: "Absence totale d'odeurs",                        conformite: 'C',  observation: null },
    { id: 'c37', vol_id: 'vol-5', zone: 'Client',    sous_zone: null,   point_controle: 'Sièges confortables et propres',                 conformite: 'NC', observation: 'Siège 24F non remis en position' },
    { id: 'c38', vol_id: 'vol-5', zone: 'Client',    sous_zone: null,   point_controle: 'Écrans propres et lisibles',                     conformite: 'C',  observation: null },
    { id: 'c39', vol_id: 'vol-5', zone: 'Client',    sous_zone: null,   point_controle: "Toilettes propres à l'embarquement",             conformite: 'C',  observation: null },
    { id: 'c40', vol_id: 'vol-5', zone: 'Client',    sous_zone: null,   point_controle: 'Galley discret et propre',                       conformite: 'C',  observation: null },
    { id: 'c41', vol_id: 'vol-5', zone: 'Client',    sous_zone: null,   point_controle: 'Niveau de propreté conforme long-courrier',       conformite: 'C',  observation: null },
  ],
  'vol-6': [
    { id: 'c23', vol_id: 'vol-6', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Sol aspiré',                                    conformite: 'C',  observation: null },
    { id: 'c24', vol_id: 'vol-6', zone: 'Toilettes', sous_zone: null,   point_controle: 'Lavabo et robinetterie propres',                 conformite: 'C',  observation: null },
    { id: 'c25', vol_id: 'vol-6', zone: 'Galley',    sous_zone: null,   point_controle: 'Bonne odeur cabine',                             conformite: 'C',  observation: null },
    { id: 'c42', vol_id: 'vol-6', zone: 'Client',    sous_zone: null,   point_controle: 'Propreté générale cabine satisfaisante',          conformite: 'C',  observation: null },
    { id: 'c43', vol_id: 'vol-6', zone: 'Client',    sous_zone: null,   point_controle: "Absence d'odeurs désagréables",                  conformite: 'C',  observation: null },
    { id: 'c44', vol_id: 'vol-6', zone: 'Client',    sous_zone: null,   point_controle: 'Tablettes sans traces',                           conformite: 'NC', observation: 'Traces grasses sur tablettes rangée 5' },
    { id: 'c45', vol_id: 'vol-6', zone: 'Client',    sous_zone: null,   point_controle: 'Hublots propres',                                conformite: 'C',  observation: null },
    { id: 'c46', vol_id: 'vol-6', zone: 'Client',    sous_zone: null,   point_controle: 'Toilettes acceptables pour usage immédiat',       conformite: 'C',  observation: null },
    { id: 'c47', vol_id: 'vol-6', zone: 'Client',    sous_zone: null,   point_controle: 'Aucun déchet visible',                           conformite: 'C',  observation: null },
    { id: 'c48', vol_id: 'vol-6', zone: 'Client',    sous_zone: null,   point_controle: "Impression générale positive à l'embarquement",  conformite: 'C',  observation: null },
  ],
  'vol-7': [
    { id: 'c26', vol_id: 'vol-7', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Sol aspiré',                                    conformite: 'C',  observation: null },
    { id: 'c27', vol_id: 'vol-7', zone: 'Cockpit',   sous_zone: null,   point_controle: 'Sièges pilotes propres',                         conformite: 'NC', observation: 'Dossier taché' },
    { id: 'c28', vol_id: 'vol-7', zone: 'Client',    sous_zone: null,   point_controle: 'Propreté générale cabine satisfaisante',          conformite: 'C',  observation: null },
    { id: 'c49', vol_id: 'vol-7', zone: 'Client',    sous_zone: null,   point_controle: "Absence d'odeurs désagréables",                  conformite: 'C',  observation: null },
    { id: 'c50', vol_id: 'vol-7', zone: 'Client',    sous_zone: null,   point_controle: 'Tablettes sans traces',                           conformite: 'C',  observation: null },
    { id: 'c51', vol_id: 'vol-7', zone: 'Client',    sous_zone: null,   point_controle: 'Hublots propres',                                conformite: 'NC', observation: 'Traces sur hublots rangée 9' },
    { id: 'c52', vol_id: 'vol-7', zone: 'Client',    sous_zone: null,   point_controle: 'Toilettes acceptables pour usage immédiat',       conformite: 'C',  observation: null },
    { id: 'c53', vol_id: 'vol-7', zone: 'Client',    sous_zone: null,   point_controle: 'Aucun déchet visible',                           conformite: 'C',  observation: null },
    { id: 'c54', vol_id: 'vol-7', zone: 'Client',    sous_zone: null,   point_controle: "Impression générale positive à l'embarquement",  conformite: 'C',  observation: null },
  ],
};
let _controleCounter = 55;

// ── API Vols ──────────────────────────────────────────────────

export function demoGetVols(agentId = null) {
  const list = agentId ? _vols.filter(v => v.agent_id === agentId) : [..._vols];
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function demoGetVol(volId) {
  return _vols.find(v => v.id === volId) || null;
}

export function demoCreateVol(data) {
  const vol = { ...data, id: `vol-${_volCounter++}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  _vols.unshift(vol);
  _controles[vol.id] = [];
  return vol;
}

export function demoUpdateVol(volId, data) {
  const idx = _vols.findIndex(v => v.id === volId);
  if (idx >= 0) _vols[idx] = { ..._vols[idx], ...data, updated_at: new Date().toISOString() };
  return _vols[idx] || null;
}

// ── API Controles ─────────────────────────────────────────────

export function demoGetControles(volId) {
  return _controles[volId] || [];
}

export function demoUpsertControle(data) {
  if (!_controles[data.vol_id]) _controles[data.vol_id] = [];
  const list = _controles[data.vol_id];
  const idx = list.findIndex(c =>
    c.zone === data.zone &&
    (c.sous_zone || null) === (data.sous_zone || null) &&
    c.point_controle === data.point_controle
  );
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...data };
    return list[idx];
  }
  const item = { ...data, id: `c${_controleCounter++}` };
  list.push(item);
  return item;
}

export function demoGetAllControles() {
  return Object.values(_controles).flat();
}

// ── API Agents ────────────────────────────────────────────────

export function demoGetAgents() {
  return [..._agents];
}

export function demoToggleAgent(agentId, actif) {
  const idx = _agents.findIndex(a => a.id === agentId);
  if (idx >= 0) _agents[idx] = { ..._agents[idx], actif };
}

export function demoCreateAgent(data) {
  const agent = { ...data, id: `agent-${_agentCounter++}`, role: 'agent', actif: true };
  _agents.push(agent);
  return agent;
}
