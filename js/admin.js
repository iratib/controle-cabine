// ============================================================
// admin.js – Logique interface administrateur
// ============================================================

import { supabase, isDemoMode } from './supabase-client.js';
import { requireRole, logout } from './auth.js';
import { showToast, formatDate, getStatutBadge, formatRelativeTime } from './utils.js';
import { initTheme } from './theme.js';
import {
  demoGetVols, demoGetVol, demoGetControles, demoUpdateVol,
  demoGetAllControles, demoGetAgents, demoToggleAgent, demoCreateAgent
} from './demo-db.js';

const MONTH_NAMES_FULL = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// Registre des instances Chart.js — pour destroy avant re-rendu
const _charts = {};
function _destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}
function _makeCanvas(container, minHeight = 220) {
  _destroyChart(container.id);
  container.innerHTML = '';
  container.style.position = 'relative';
  // Wrap flex:1 pour remplir toute la hauteur de la card-body
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative;width:100%;flex:1;min-height:${minHeight}px`;
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  container.appendChild(wrap);
  return canvas;
}
const _CHART_DEFAULTS = {
  font: { family: "'Inter', system-ui, sans-serif", size: 11 },
  color: '#6b7a99',
};
Chart.defaults.font.family = _CHART_DEFAULTS.font.family;
Chart.defaults.font.size   = _CHART_DEFAULTS.font.size;
Chart.defaults.color       = _CHART_DEFAULTS.color;

// Couleurs adaptées au thème actif (mode nuit = teintes plus vives/opaques pour rester visibles)
function _isDarkTheme() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
function _gridColor() { return _isDarkTheme() ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)'; }
function _barInspColor() { return _isDarkTheme() ? 'rgba(239,68,68,.55)' : 'rgba(190,30,45,.15)'; }
function _barInspHoverColor() { return _isDarkTheme() ? 'rgba(239,68,68,.8)' : 'rgba(190,30,45,.35)'; }

function getMonthsList() {
  const months = [];
  const start = new Date(2026, 1, 1);
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d >= start) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ value, label: MONTH_NAMES_FULL[d.getMonth()] + ' ' + d.getFullYear() });
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

function monthToRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2,'0')}-01`;
  const lastDay = new Date(y, m, 0);
  const last = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`;
  return { first, last };
}

function populateMonthSelects() {
  const months = getMonthsList();
  const ids = ['dbFilterMois', 'filterMois', 'selectAgentMois', 'filterNcMois', 'mpFilterFrom', 'mpFilterTo', 'gpFilterFrom', 'gpFilterTo'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const first = el.options[0] || null;
    el.innerHTML = '';
    if (first) el.appendChild(first);
    months.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      el.appendChild(opt);
    });
  });
}

async function fetchControlesForVols(volIds, columns = 'conformite, zone, vol_id, point_controle') {
  const CHUNK = 20;
  const CONCURRENCY = 3;

  async function fetchChunk(chunk) {
    const { data, error } = await supabase.from('controles')
      .select(columns).in('vol_id', chunk);
    if (error) throw error;
    return data || [];
  }

  const chunks = [];
  const safeIds = volIds.filter(Boolean);
  for (let i = 0; i < safeIds.length; i += CHUNK) chunks.push(safeIds.slice(i, i + CHUNK));

  const results = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fetchChunk));
    batchResults.forEach(r => results.push(...r));
  }
  return results;
}

const FICHE_STRUCTURES = {
  'Moyen Porteur Transit': [
    { zone: 'Cockpit', partie: 'Équipage', sous_zone: null, icon: '🛩', points: ['Sol propre (sans résidus, poussières)','Tablettes pilotes propres','Poubelles vidées','Pare-brise intérieur essuyé','Aucun objet oublié (FOD)'] },
    { zone: 'Cabine', partie: 'Équipage', sous_zone: 'Y/CL', icon: '💺', points: ['Sièges propres et alignés (Rangée 8-9-10-17-18-19)','Reste Sièges propres et alignés','Ceintures croisées correctement (Rangée 8-9-10-17-18-19)','Reste Ceintures croisées correctement','Tablettes propres et fonctionnelles','Poches sièges vides (Rangée 8-9-10-17-18-19)','Reste Poches sièges vides','Rideaux propres','Coffres à bagages propres','Moquette aspirée'] },
    { zone: 'Cabine', partie: 'Équipage', sous_zone: 'C/CL', icon: '👑', points: ['Totalité Sièges et consoles propres','Totalité Écrans sans traces','Totalité Table repas propre','Rideaux propres'] },
    { zone: 'Toilettes', partie: null, sous_zone: null, icon: '🚽', points: ['Cuvette nettoyée et désinfectée','Lunette toilette propre','Lavabo propre et désinfecté','Miroir propre','Sol lavé et désinfecté','Poubelle vidée','Odeur neutre'] },
    { zone: 'Galley', partie: null, sous_zone: null, icon: '🍽', points: ['Plans de travail nettoyés','Tiroirs propres','Sol nettoyé et sec','Poubelles vidées','Aucun reste alimentaire'] },
    { zone: 'Client', partie: 'Client', sous_zone: null, icon: '🧑‍✈️', points: ["Propreté générale cabine satisfaisante","Absence d'odeurs désagréables","Tablettes sans traces","Hublots propres","Toilettes acceptables pour usage immédiat","Aucun déchet visible","Impression générale positive à l'embarquement"] }
  ]
};
FICHE_STRUCTURES['Gros Porteur Transit'] = [
  { zone: 'Cockpit', partie: 'Équipage', sous_zone: null, icon: '🛩', points: ['Sol aspiré','Sièges pilotes propres','Tablettes et panneaux essuyés','Poubelles vidées','Aucun objet oublié'] },
  { zone: 'Cabine', partie: 'Équipage', sous_zone: 'Y/CL', icon: '💺', points: ['Sièges propres (dossier, accoudoirs Rangee 10-11-12-28-29)','Reste Sièges propres et alignés','Tablettes propres','Écrans nettoyés','Ceintures croisées (Rangee 10-11-12-28-29)','Reste Ceintures croisées correctement','Poches sièges vides (Rangee 10-11-12-28-29)','Reste Poches sièges vides','Moquette aspirée'] },
  { zone: 'Cabine', partie: 'Équipage', sous_zone: 'C/CL', icon: '👑', points: ['Totalité Sièges propres','Totalité Écrans sans traces','Totalité Table repas propre','Espaces personnels nettoyés','Rideaux propres'] },
  { zone: 'Premium Economy', partie: 'Équipage', sous_zone: null, icon: '⭐', points: ['Siège et repose pieds propres'] },
  { zone: 'CRC', partie: 'Équipage', sous_zone: null, icon: '🛌', points: ['Avant (PNT)','Arrière (PNC)'] },
  { zone: 'Toilettes', partie: null, sous_zone: null, icon: '🚽', points: ['Nettoyage complet et désinfection','Sol lavé et sec','Lavabo et robinetterie propres','Table à langer propre','Poubelles vidées','Produits consommables en place'] },
  { zone: 'Galley', partie: null, sous_zone: null, icon: '🍽', points: ['Plans de travail désinfectés','Compartiments propres','Sol lavé et désinfecté','Poubelles vidées','Aucun reste catering'] },
  { zone: 'Client', partie: 'Client', sous_zone: null, icon: '🧑‍✈️', points: ['Cabine visuellement propre',"Absence totale d'odeurs",'Sièges confortables et propres','Écrans propres et lisibles',"Toilettes propres à l'embarquement",'Galley discret et propre','Niveau de propreté conforme long-courrier'] }
];
FICHE_STRUCTURES['Moyen Porteur Stop Cmn'] = [
  { zone: 'Cockpit', partie: 'Équipage', sous_zone: null, icon: '🛩', points: ['Sol propre (sans résidus, poussières)','Tablettes pilotes propres','Poubelles vidées','Pare-brise intérieur essuyé','Aucun objet oublié (FOD)'] },
  { zone: 'Cabine', partie: 'Équipage', sous_zone: 'Y/CL', icon: '💺', points: ['Totalité Sièges propres et alignés','Totalité Ceintures croisées correctement','Totalité Tablettes propres et fonctionnelles','Totalité Poches sièges vides','Rideaux propres','Coffres à bagages propres','Moquette aspirée'] },
  { zone: 'Cabine', partie: 'Équipage', sous_zone: 'C/CL', icon: '👑', points: ['Totalité Sièges et consoles propres','Totalité Écrans sans traces','Totalité Table repas propre','Espaces personnels nettoyés','Rideaux propres'] },
  { zone: 'Toilettes', partie: null, sous_zone: null, icon: '🚽', points: ['Cuvette nettoyée et désinfectée','Lunette toilette propre','Lavabo propre et désinfecté','Miroir propre','Sol lavé et désinfecté','Poubelle vidée','Odeur neutre'] },
  { zone: 'Galley', partie: null, sous_zone: null, icon: '🍽', points: ['Plans de travail nettoyés','Tiroirs propres','Sol nettoyé et sec','Poubelles vidées','Aucun reste alimentaire'] },
  { zone: 'Client', partie: 'Client', sous_zone: null, icon: '🧑‍✈️', points: ['Propreté générale cabine satisfaisante',"Absence d'odeurs désagréables",'Tablettes sans traces','Hublots propres','Toilettes acceptables pour usage immédiat','Aucun déchet visible',"Impression générale positive à l'embarquement"] }
];
FICHE_STRUCTURES['Gros Porteur Stop Cmn'] = [
  { zone: 'Cockpit', partie: 'Équipage', sous_zone: null, icon: '🛩', points: ['Sol aspiré','Sièges pilotes propres','Tablettes et panneaux essuyés','Poubelles vidées','Aucun objet oublié'] },
  { zone: 'Cabine ECO', partie: 'Équipage', sous_zone: null, icon: '💺', points: ['Sièges propres (dossier, accoudoirs)','Totalité Tablettes propres','Totalité Écrans nettoyés','Totalité Ceintures croisées','Totalité Poches sièges vides','Moquette aspirée'] },
  { zone: 'Premium Economy', partie: 'Équipage', sous_zone: null, icon: '⭐', points: ['Totalité Siège et repose pieds propres'] },
  { zone: 'Cabine', partie: 'Équipage', sous_zone: 'C/CL', icon: '👑', points: ['Totalité Sièges propres','Totalité Écrans sans traces','Totalité Table repas propre','Espaces personnels nettoyés','Rideaux propres'] },
  { zone: 'CRC', partie: 'Équipage', sous_zone: null, icon: '🛌', points: ['Avant (PNT)','Arrière (PNC)'] },
  { zone: 'Toilettes', partie: null, sous_zone: null, icon: '🚽', points: ['Nettoyage complet et désinfection','Sol lavé et sec','Lavabo et robinetterie propres','Table à langer propre','Poubelles vidées','Produits consommables en place'] },
  { zone: 'Galley', partie: null, sous_zone: null, icon: '🍽', points: ['Plans de travail désinfectés','Compartiments propres','Sol lavé et désinfecté','Poubelles vidées','Aucun reste catering'] },
  { zone: 'Client', partie: 'Client', sous_zone: null, icon: '🧑‍✈️', points: ['Cabine visuellement propre',"Absence totale d'odeurs",'Sièges confortables et propres','Écrans propres et lisibles',"Toilettes propres à l'embarquement",'Galley discret et propre','Niveau de propreté conforme long-courrier'] }
];

function getFicheStructure(typeVol) {
  return FICHE_STRUCTURES[typeVol] || FICHE_STRUCTURES['Moyen Porteur Transit'];
}

let currentUser = null;
let allAgents = [];
let realtimeSub = null;
let dashboardFilters = { period: '30', typeVol: '', agentId: '', month: '', cieCode: '' };
let allCompagnies = [];

// ---- INIT ----

async function init() {
  initTheme();
  const auth = await requireRole('admin'); // admin, chef, superviseur
  if (!auth) return;
  currentUser = auth.profile;
  // Sidebar
  document.getElementById('adminNom').textContent = currentUser.nom;
  const initials = currentUser.nom.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const sidebarAv = document.getElementById('sidebarAvatar');
  if (sidebarAv) sidebarAv.textContent = initials;
  // Topbar
  const nomTopbar = document.getElementById('adminNomTopbar');
  if (nomTopbar) nomTopbar.textContent = currentUser.nom;
  const topbarAv = document.getElementById('topbarAvatar');
  if (topbarAv) topbarAv.textContent = initials;
  document.getElementById('btnLogout').addEventListener('click', logout);

  // Label rôle sidebar
  const roleLabels = { admin: 'ADMINISTRATEUR', chef: 'CHEF DÉPARTEMENT', superviseur: 'SUPERVISEUR', agent: 'AGENT' };
  const sidebarRole = document.getElementById('sidebarUserRole');
  if (sidebarRole) sidebarRole.textContent = roleLabels[currentUser.role] || currentUser.role.toUpperCase();

  // Masquer "Gestion utilisateurs" pour les non-admin
  if (currentUser.role !== 'admin') {
    const navAgents = document.getElementById('navAgents');
    if (navAgents) navAgents.style.display = 'none';
  }

  setupNavigation();
  await Promise.all([
    loadAgentsList(),
    loadAllCompagnies()
  ]);
  initDashboardFilters();
  initAnalyseFilters();
  setupDashboardPdf();
  loadDashboard();
  if (!isDemoMode) setupRealtime();
  setupModals();
  setupExport();
  setupNotifications();

  document.getElementById('btnMenu').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('sidebar-open');
  });
}

// ---- NAVIGATION ----

function setupNavigation() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
      document.getElementById('view' + capitalize(view.replace('-', ''))) && (document.getElementById('view' + capitalize(view.replace('-', ''))).style.display = 'block');
      document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.getElementById('sidebar').classList.remove('sidebar-open');

      if (view === 'dashboard') loadDashboard();
      else if (view === 'controles') {
        const today = new Date().toISOString().split('T')[0];
        const deDe = document.getElementById('filterDateDe');
        const dateA = document.getElementById('filterDateA');
        if (deDe && !deDe.value) deDe.value = today;
        if (dateA && !dateA.value) dateA.value = today;
        loadTousControles({ dateDe: deDe?.value || today, dateA: dateA?.value || today });
      }
      else if (view === 'par-agent') setupParAgent();
      else if (view === 'nc') loadNC();
      else if (view === 'agents') loadAgentsTable();
      else if (view === 'export') setupExportView();
      else if (view === 'analyse-mp') loadAnalyseType('MP');
      else if (view === 'analyse-gp') loadAnalyseType('GP');
      else if (view === 'sla-config')     loadSlaConfigView();
      else if (view === 'sla-conformite') loadSlaConformiteView();
      else if (view === 'compagnies') loadCompagniesView();
      else if (view === 'immatriculations') loadImmatriculationsView();
      else if (view === 'archive') loadArchiveView();
    });
  });
}

function capitalize(str) {
  const map = {
    'dashboard': 'Dashboard', 'controles': 'Controles',
    'par-agent': 'ParAgent', 'paragent': 'ParAgent',
    'nc': 'NC', 'agents': 'Agents', 'export': 'Export',
    'analyse-mp': 'AnalyseMP', 'analysemp': 'AnalyseMP',
    'analyse-gp': 'AnalyseGP', 'analysegp': 'AnalyseGP',
    'sla-config':     'Slaconfig',
    'slaconfig':      'Slaconfig',
    'sla-conformite': 'Slaconformite',
    'slaconformite':  'Slaconformite',
    'compagnies': 'Compagnies',
    'immatriculations': 'Immatriculations',
    'archive': 'Archive'
  };
  return map[str] || str.charAt(0).toUpperCase() + str.slice(1);
}

// ---- CHARGEMENT AGENTS ----

async function loadAgentsList() {
  populateMonthSelects();
  if (isDemoMode) {
    allAgents = demoGetAgents();
    populateAgentSelects();
    return;
  }
  const { data } = await supabase.from('profiles').select('*').eq('role', 'agent').order('nom');
  allAgents = data || [];
  populateAgentSelects();
}

async function loadAllCompagnies() {
  if (isDemoMode) {
    allCompagnies = [{ code: 'AT', nom: 'Royal Air Maroc' }, { code: 'AF', nom: 'Air France' }];
  } else {
    const { data } = await supabase.from('compagnies').select('code, nom, logo_url').eq('actif', true).order('code');
    allCompagnies = data || [];
  }
  // Peupler le select filtre dashboard
  const sel = document.getElementById('dbFilterCie');
  if (sel) {
    sel.innerHTML = '<option value="">Toutes</option>' +
      allCompagnies.map(c => `<option value="${c.code}">${c.code} – ${c.nom}</option>`).join('');
  }
}

function populateAgentSelects() {
  const selects = ['filterAgent', 'filterNcAgent', 'selectAgentDetail', 'dbFilterAgent'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const firstOpt = el.options[0];
    el.innerHTML = '';
    el.appendChild(firstOpt);
    allAgents.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.nom + ' (' + (a.matricule || '—') + ')';
      el.appendChild(opt);
    });
  });
}

// ---- DASHBOARD ----

function initDashboardFilters() {
  document.querySelectorAll('#viewDashboard .db-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      dashboardFilters[btn.dataset.filter] = btn.dataset.value;
      btn.closest('.db-pills').querySelectorAll('.db-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadDashboard();
    });
  });
  document.getElementById('dbFilterAgent')?.addEventListener('change', function () {
    dashboardFilters.agentId = this.value;
    loadDashboard();
  });
  document.getElementById('dbFilterCie')?.addEventListener('change', function () {
    dashboardFilters.cieCode = this.value;
    loadDashboard();
  });
  document.getElementById('dbFilterMois')?.addEventListener('change', function () {
    dashboardFilters.month = this.value;
    if (this.value) {
      document.querySelectorAll('.db-pill[data-filter="period"]').forEach(b => b.classList.remove('active'));
    } else {
      document.querySelector('.db-pill[data-filter="period"][data-value="all"]')?.classList.add('active');
      dashboardFilters.period = 'all';
    }
    loadDashboard();
  });

  document.getElementById('filterMois')?.addEventListener('change', function () {
    if (!this.value) { document.getElementById('filterDateDe').value = ''; document.getElementById('filterDateA').value = ''; return; }
    const { first, last } = monthToRange(this.value);
    document.getElementById('filterDateDe').value = first;
    document.getElementById('filterDateA').value = last;
  });
}

function initAnalyseFilters() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  ['mp', 'gp'].forEach(prefix => {
    const fromEl = document.getElementById(`${prefix}FilterFrom`);
    const toEl   = document.getElementById(`${prefix}FilterTo`);
    const type   = prefix.toUpperCase();
    if (fromEl) { fromEl.value = defaultMonth; }
    if (toEl)   { toEl.value   = defaultMonth; }
    fromEl?.addEventListener('change', () => loadAnalyseType(type));
    toEl?.addEventListener('change',   () => loadAnalyseType(type));
    document.getElementById(`btnRefresh${type}`)?.addEventListener('click', () => loadAnalyseType(type));
  });
}

async function loadDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const { period, typeVol, agentId, month, cieCode } = dashboardFilters;

  let fromDate = null, toDate = null;
  if (month) {
    const range = monthToRange(month);
    fromDate = range.first;
    toDate = range.last;
  } else if (period === 'today') { fromDate = today; toDate = today; }
  else if (period === '7') { const d = new Date(); d.setDate(d.getDate() - 6); fromDate = d.toISOString().split('T')[0]; }
  else if (period === '30') { const d = new Date(); d.setDate(d.getDate() - 29); fromDate = d.toISOString().split('T')[0]; }

  const titleEl = document.getElementById('chartEvolutionTitle');
  if (titleEl) {
    if (month) {
      const [y, m] = month.split('-');
      titleEl.textContent = 'Évolution — ' + MONTH_NAMES_FULL[parseInt(m) - 1] + ' ' + y;
    } else {
      const periodTitles = { today: "Aujourd'hui", '7': '7 derniers jours', '30': '30 derniers jours', all: 'Tout' };
      titleEl.textContent = 'Évolution — ' + (periodTitles[period] || '30 derniers jours');
    }
  }

  // Indicateurs de chargement
  ['statTotalVols', 'statAujourd', 'statTaux', 'statNcTotal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.add('loading'); }
  });
  // Détruire les instances Chart.js avant rechargement
  ['chartVolsParAgent','chartConformiteZoneMP','chartConformiteZoneGP','chartEvolution','chartDonutConformite',
   'chartControlesType','chartTypeVol','chartCompagnies'].forEach(id => _destroyChart(id));

  const loadingHtml = '<div class="loading-state">Chargement…</div>';
  ['chartVolsParAgent','chartConformiteZoneMP','chartConformiteZoneGP','chartEvolution','chartDonutConformite',
   'chartControlesType','chartTypeVol','chartCompagnies','topNcList','activiteRecente'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = loadingHtml;
  });

  try {
    let vols = [], allControles = [], todayCount = 0;

    if (isDemoMode) {
      vols = demoGetVols();
      if (fromDate) vols = vols.filter(v => v.date_vol >= fromDate);
      if (toDate) vols = vols.filter(v => v.date_vol <= toDate);
      if (typeVol === 'MP') vols = vols.filter(v => v.type_vol?.includes('Moyen'));
      if (typeVol === 'GP') vols = vols.filter(v => v.type_vol?.includes('Gros'));
      if (agentId) vols = vols.filter(v => v.agent_id === agentId);
      if (cieCode) vols = vols.filter(v => v.numero_vol?.match(/^[A-Z]+/)?.[0] === cieCode);
      todayCount = demoGetVols().filter(v => v.date_vol === today).length;
      const ids = new Set(vols.map(v => v.id));
      allControles = demoGetAllControles().filter(c => ids.has(c.vol_id));
      document.getElementById('statTotalVols').textContent = vols.length;
    } else {
      // Construire les filtres communs
      const applyFilters = q => {
        if (fromDate) q = q.gte('date_vol', fromDate);
        if (toDate) q = q.lte('date_vol', toDate);
        else if (period === 'today') q = q.lte('date_vol', today);
        if (typeVol === 'MP') q = q.in('type_vol', ['Moyen Porteur Transit', 'Moyen Porteur Stop Cmn']);
        if (typeVol === 'GP') q = q.in('type_vol', ['Gros Porteur Transit', 'Gros Porteur Stop Cmn']);
        if (agentId) q = q.eq('agent_id', agentId);
        if (cieCode) q = q.like('numero_vol', `${cieCode}%`);
        return q;
      };

      const [{ count: totalCount }, { count: tc }] = await Promise.all([
        applyFilters(supabase.from('vols').select('*', { count: 'exact', head: true })),
        supabase.from('vols').select('*', { count: 'exact', head: true }).eq('date_vol', today)
      ]);
      todayCount = tc ?? 0;

      // Paginate vols to bypass the 1000-row Supabase cap
      const allDashVols = [];
      let dbOffset = 0;
      while (true) {
        const { data: vPage, error: vErr } = await applyFilters(
          supabase.from('vols')
            .select('id, statut, date_vol, type_vol, numero_vol, agent_id, profiles(nom)')
            .order('date_vol')
        ).range(dbOffset, dbOffset + 999);
        if (vErr) throw vErr;
        if (!vPage || vPage.length === 0) break;
        allDashVols.push(...vPage);
        if (vPage.length < 1000) break;
        dbOffset += 1000;
      }
      vols = allDashVols;

      document.getElementById('statTotalVols').textContent = totalCount ?? vols.length;

      if (vols.length) {
        allControles = await fetchControlesForVols(vols.map(v => v.id));
      }
    }

    const C  = allControles.filter(c => c.conformite === 'C').length;
    const NC = allControles.filter(c => c.conformite === 'NC').length;
    const taux = (C + NC) > 0 ? ((C / (C + NC)) * 100).toFixed(1) : '—';

    ['statTotalVols', 'statAujourd', 'statTaux', 'statNcTotal'].forEach(id => {
      document.getElementById(id)?.classList.remove('loading');
    });
    document.getElementById('statAujourd').textContent = todayCount;
    document.getElementById('statTaux').textContent = taux !== '—' ? taux + '%' : '—';
    document.getElementById('statNcTotal').textContent = NC;

    const _safe = (fn) => { try { fn(); } catch(e) { console.error('Chart render error:', e); } };
    _safe(() => renderChartVolsParAgent(vols));
    _safe(() => renderChartZones(allControles, vols));
    _safe(() => renderChartEvolution(period, fromDate, toDate, month, vols, allControles));
    _safe(() => renderChartDonutConformite(C, NC));
    _safe(() => renderChartControlesType(vols, allControles));
    _safe(() => renderChartTypeVol(vols, allControles));
    _safe(() => renderChartCompagnies(vols));
    _safe(() => renderTopNC(allControles));
    loadActiviteRecente();
    loadDashboardSla();
    loadDashboardSlaFiltered(vols.map(v => v.id));
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

// ---- EXPORT PDF DU TABLEAU DE BORD ----

// Texte récapitulatif des filtres actifs (pour l'en-tête du PDF)
function _dbFiltersSubtitle() {
  const f = dashboardFilters;
  const parts = [];
  if (f.month) {
    const [y, m] = f.month.split('-');
    parts.push('Mois : ' + MONTH_NAMES_FULL[parseInt(m) - 1] + ' ' + y);
  } else {
    const pt = { today: "Aujourd'hui", '7': '7 derniers jours', '30': '30 derniers jours', all: 'Toutes périodes' };
    parts.push('Période : ' + (pt[f.period] || f.period));
  }
  if (f.typeVol) parts.push('Type : ' + f.typeVol);
  const selText = (id) => { const s = document.getElementById(id); return s && s.selectedIndex > 0 ? s.options[s.selectedIndex].text : null; };
  if (f.agentId) { const t = selText('dbFilterAgent'); if (t) parts.push('Agent : ' + t); }
  if (f.cieCode) { const t = selText('dbFilterCie'); parts.push('Compagnie : ' + (t || f.cieCode)); }
  return parts.join('   •   ');
}

function _pdfSafe(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/→/g, 'au').replace(/[—–]/g, '-').replace(/•/g, '-');
}

// Couleur de fond utilisée pour la capture (selon le thème)
function _captureBg(el) {
  const bg = getComputedStyle(el).backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
  return _isDarkTheme() ? '#0f172a' : '#f4f6fb';
}

// Dessine l'en-tête (logo + titre + date + filtres) et renvoie la hauteur occupée (mm)
async function _drawDashboardPdfHeader(doc, title, subtitle) {
  const W = doc.internal.pageSize.getWidth();
  const margin = 14;
  try {
    const logo = await fetchImageAsBase64('images/logo.png');
    doc.addImage(logo, 'PNG', margin, 12, 16, 16);
  } catch (_) { /* logo optionnel */ }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(190, 30, 45);
  doc.text(_pdfSafe(title), margin + 20, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(110, 120, 140);
  doc.text(_pdfSafe('Genere le ' + new Date().toLocaleString('fr-FR')), margin + 20, 26);

  let y = 34;
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(70, 80, 100);
    const lines = doc.splitTextToSize(_pdfSafe(subtitle), W - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 2;
  }
  doc.setDrawColor(220, 225, 232);
  doc.line(margin, y, W - margin, y);
  return y + 4; // hauteur totale réservée
}

// Ajoute un canvas dans le PDF, en le découpant sur plusieurs pages A4 si besoin
function _addCanvasPaged(doc, canvas, headerH, bgColor) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 14;
  const imgW = W - margin * 2;
  const scale = imgW / canvas.width;           // mm par pixel source
  const firstAvail = H - headerH - margin;     // hauteur dispo 1re page (mm)
  const restAvail = H - margin * 2;            // hauteur dispo pages suivantes

  let srcY = 0;
  let first = true;
  while (srcY < canvas.height) {
    const availMm = first ? firstAvail : restAvail;
    const sliceH = Math.min(canvas.height - srcY, Math.floor(availMm / scale));
    if (sliceH <= 0) break;

    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = sliceH;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    if (!first) doc.addPage();
    const topMm = first ? headerH : margin;
    doc.addImage(tmp.toDataURL('image/png'), 'PNG', margin, topMm, imgW, sliceH * scale);

    srcY += sliceH;
    first = false;
  }
}

// Capture un élément DOM via html2canvas
async function _captureElement(el, bgColor) {
  return html2canvas(el, {
    scale: 2,
    backgroundColor: bgColor,
    useCORS: true,
    logging: false,
    ignoreElements: (node) => node.classList && node.classList.contains('pdf-ignore'),
  });
}

// Export complet du tableau de bord
async function exportDashboardPdf() {
  if (!window.jspdf || !window.html2canvas) { showToast('Bibliothèque PDF non chargée. Rechargez la page.', 'error'); return; }
  const btn = document.getElementById('btnExportDashboardPDF');
  const view = document.getElementById('viewDashboard');
  if (!view) return;
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération…'; }

  try {
    const bg = _captureBg(view);
    const canvas = await _captureElement(view, bg);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const headerH = await _drawDashboardPdfHeader(doc, 'Tableau de bord', _dbFiltersSubtitle());
    _addCanvasPaged(doc, canvas, headerH, bg);
    doc.save('Tableau_de_bord_' + new Date().toISOString().split('T')[0] + '.pdf');
    showToast('PDF du tableau de bord généré.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erreur génération PDF : ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

// Export d'une seule section (carte)
async function exportSectionPdf(cardEl, title, btn) {
  if (!window.jspdf || !window.html2canvas) { showToast('Bibliothèque PDF non chargée. Rechargez la page.', 'error'); return; }
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  try {
    const bg = _captureBg(cardEl);
    const canvas = await _captureElement(cardEl, bg);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const headerH = await _drawDashboardPdfHeader(doc, title, _dbFiltersSubtitle());
    _addCanvasPaged(doc, canvas, headerH, bg);
    const safeName = title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    doc.save('Section_' + safeName + '_' + new Date().toISOString().split('T')[0] + '.pdf');
    showToast('PDF de la section généré.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erreur génération PDF : ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

// Mise en place des boutons PDF (global + par section)
function setupDashboardPdf() {
  document.getElementById('btnExportDashboardPDF')?.addEventListener('click', exportDashboardPdf);

  // Injecte un bouton PDF dans l'en-tête de chaque carte du tableau de bord
  document.querySelectorAll('#viewDashboard .card > .card-header').forEach(header => {
    if (header.querySelector('.card-pdf-btn')) return;
    const card = header.closest('.card');
    const titleEl = header.querySelector('h2, h3');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card-pdf-btn pdf-ignore';
    btn.title = 'Exporter cette section en PDF';
    btn.innerHTML = '<i class="fas fa-file-pdf"></i>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const title = (titleEl ? titleEl.textContent : 'Section').trim();
      exportSectionPdf(card, title, btn);
    });
    header.appendChild(btn);
  });
}

function _barLabelPlugin(id, getData) {
  return {
    id,
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const label = getData(i);
        if (label === null || label === undefined || label === '') return;
        const barWidth = Math.abs(bar.x - bar.base);
        ctx.save();
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textBaseline = 'middle';
        const textW = ctx.measureText(label).width;
        if (barWidth >= textW + 10) {
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'right';
          ctx.fillText(label, bar.x - 6, bar.y);
        } else if (bar.x > bar.base) {
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#64748b';
          ctx.textAlign = 'left';
          ctx.fillText(label, bar.x + 5, bar.y);
        }
        ctx.restore();
      });
    }
  };
}

function renderChartVolsParAgent(vols) {
  const container = document.getElementById('chartVolsParAgent');
  const agentCounts = {};
  vols.forEach(v => {
    const nom = v.profiles?.nom || (v.agent_id === 'demo' ? 'Agent Démo' : 'Inconnu');
    agentCounts[nom] = (agentCounts[nom] || 0) + 1;
  });
  const entries = Object.entries(agentCounts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { container.innerHTML = '<div class="empty-state">Aucune donnée</div>'; return; }
  const canvas = _makeCanvas(container, Math.max(160, entries.length * 42));
  _charts[container.id] = new Chart(canvas, {
    type: 'bar',
    plugins: [_barLabelPlugin('agentLabel', i => entries[i]?.[1]?.toString())],
    data: {
      labels: entries.map(([nom]) => nom),
      datasets: [{
        data: entries.map(([, c]) => c),
        backgroundColor: 'rgba(190,30,45,.8)',
        hoverBackgroundColor: 'rgba(190,30,45,1)',
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x} vol${ctx.parsed.x > 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: _gridColor() } },
        y: { grid: { display: false } }
      }
    }
  });
}

let _zoneChartVols = [];
let _zoneChartControles = [];

function renderChartZones(controles, vols) {
  if (vols      !== undefined) _zoneChartVols      = vols;
  if (controles !== undefined) _zoneChartControles = controles;

  _renderZoneChart('chartConformiteZoneMP', 'MP');
  _renderZoneChart('chartConformiteZoneGP', 'GP');
}

function _renderZoneChart(containerId, typeFilter) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const keyword = typeFilter === 'MP' ? 'Moyen' : 'Gros';
  const volIds = new Set(_zoneChartVols.filter(v => v.type_vol?.includes(keyword)).map(v => v.id));
  const filteredControles = _zoneChartControles.filter(c => volIds.has(c.vol_id));

  const zones = ['Cockpit', 'Cabine', 'Cabine ECO', 'Toilettes', 'Galley', 'Client', 'Premium Economy', 'CRC'];
  const zoneData = {};
  zones.forEach(z => { zoneData[z] = { C: 0, NC: 0 }; });
  filteredControles.forEach(c => {
    if (zoneData[c.zone]) {
      zoneData[c.zone][c.conformite] = (zoneData[c.zone][c.conformite] || 0) + 1;
    }
  });

  const canvas = _makeCanvas(container, 280);
  const tauxArr = zones.map(zone => {
    const d = zoneData[zone];
    const total = d.C + d.NC;
    return total > 0 ? Math.round((d.C / total) * 100) : null;
  });
  const bgColors = tauxArr.map(t =>
    t === null ? 'rgba(0,0,0,.08)' : t >= 80 ? 'rgba(16,185,129,.8)' : t >= 50 ? 'rgba(245,158,11,.8)' : 'rgba(239,68,68,.8)'
  );
  const hoverColors = bgColors.map(c => c.replace(/[\d.]+\)$/, '1)'));

  _charts[containerId] = new Chart(canvas, {
    type: 'bar',
    plugins: [_barLabelPlugin('zoneLabel_' + containerId, i => tauxArr[i] !== null ? tauxArr[i] + '%' : null)],
    data: {
      labels: zones,
      datasets: [{
        data: tauxArr.map(t => t ?? 0),
        backgroundColor: bgColors,
        hoverBackgroundColor: hoverColors,
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = zoneData[zones[ctx.dataIndex]];
              const total = d.C + d.NC;
              return total > 0 ? ` ${ctx.parsed.x}%  (${d.C} C / ${d.NC} NC)` : ' Aucun contrôle';
            }
          }
        }
      },
      scales: {
        x: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: _gridColor() } },
        y: { grid: { display: false } }
      }
    }
  });
}

function renderChartEvolution(period, fromDate, toDate, month, vols, controles) {
  const container = document.getElementById('chartEvolution');
  if (!vols || !vols.length) {
    container.innerHTML = '<div class="empty-state">Aucune donnée</div>';
    return;
  }

  // Choisir le regroupement selon la période
  const useMonth = period === 'all' || (!month && !fromDate);
  const useWeek  = false; // was: period==='30' groupait par semaine → 1 seule barre si peu de données
  // Pour 7j / 30j / mois sélectionné → par jour (useWeek désactivé)

  const volToGroup = {};
  const groupLabels = {};

  vols.forEach(v => {
    if (!v.date_vol) return;
    let key, label;
    if (useMonth) {
      key   = v.date_vol.slice(0, 7);
      const [y, m] = key.split('-');
      label = MONTH_LABELS[parseInt(m) - 1] + ' ' + y;
    } else if (useWeek) {
      const d   = new Date(v.date_vol + 'T00:00:00');
      const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const mon = new Date(d); mon.setDate(d.getDate() - day);
      key   = mon.toISOString().split('T')[0];
      label = mon.getDate().toString().padStart(2,'0') + '/' + String(mon.getMonth()+1).padStart(2,'0');
    } else {
      key   = v.date_vol;
      label = v.date_vol.slice(5).replace('-', '/');
    }
    volToGroup[v.id] = key;
    groupLabels[key] = label;
  });

  // Agréger vols et conformité par groupe
  const byGroup = {};
  vols.forEach(v => {
    const k = volToGroup[v.id];
    if (!k) return;
    if (!byGroup[k]) byGroup[k] = { insp: 0, C: 0, NC: 0 };
    byGroup[k].insp++;
  });
  (controles || []).forEach(c => {
    const k = volToGroup[c.vol_id];
    if (!k || !byGroup[k]) return;
    if (c.conformite === 'C')  byGroup[k].C++;
    if (c.conformite === 'NC') byGroup[k].NC++;
  });

  const keys = Object.keys(byGroup).sort();
  if (!keys.length) { container.innerHTML = '<div class="empty-state">Aucune donnée</div>'; return; }

  const data = keys.map(k => ({
    label: groupLabels[k] || k,
    insp:  byGroup[k].insp,
    taux:  (byGroup[k].C + byGroup[k].NC) > 0
           ? byGroup[k].C / (byGroup[k].C + byGroup[k].NC) * 100
           : null,
    partial: false
  }));

  const canvas = _makeCanvas(container, 280);
  const isDark = _isDarkTheme();
  const labelColor = isDark ? '#e2e8f0' : '#374151';

  _charts[container.id] = new Chart(canvas, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels: data.map(d => d.label),
      datasets: [
        {
          type: 'bar',
          label: 'Inspections',
          data: data.map(d => d.insp),
          backgroundColor: _barInspColor(),
          hoverBackgroundColor: _barInspHoverColor(),
          borderRadius: 4,
          yAxisID: 'yInsp',
          order: 2,
          datalabels: {
            anchor: 'center',
            align: 'center',
            color: isDark ? '#fff' : '#1f2937',
            font: { weight: 'bold', size: 12 },
            formatter: v => v,
          }
        },
        {
          type: 'line',
          label: 'Taux conformité (%)',
          data: data.map(d => d.taux),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,.1)',
          borderWidth: 2.5,
          pointBackgroundColor: '#10b981',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.35,
          fill: true,
          yAxisID: 'yTaux',
          order: 1,
          spanGaps: true,
          datalabels: {
            anchor: 'end',
            align: 'bottom',
            offset: 6,
            color: '#10b981',
            font: { weight: '700', size: 10 },
            formatter: v => v !== null ? v.toFixed(0) + '%' : '',
          }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label === 'Inspections'
              ? ` ${ctx.parsed.y} inspection${ctx.parsed.y > 1 ? 's' : ''}`
              : ctx.parsed.y !== null ? ` ${ctx.parsed.y.toFixed(1)}% conformité` : ' —'
          }
        },
        datalabels: { display: true }
      },
      scales: {
        yInsp: {
          type: 'linear', position: 'left', beginAtZero: true, ticks: { stepSize: 1 },
          grid: { color: _gridColor() }, title: { display: true, text: 'Inspections' }
        },
        yTaux: {
          type: 'linear', position: 'right', min: 0, max: 100,
          ticks: { callback: v => v + '%' }, grid: { display: false },
          title: { display: true, text: 'Conformité' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderTopNC(controles) {
  const container = document.getElementById('topNcTable');
  const allData = isDemoMode ? demoGetAllControles() : controles;

  const ncCount = {};
  const totalCount = {};
  allData.forEach(c => {
    const k = c.zone + ' | ' + c.point_controle;
    totalCount[k] = (totalCount[k] || 0) + 1;
    if (c.conformite === 'NC') ncCount[k] = (ncCount[k] || 0) + 1;
  });

  const sorted = Object.entries(ncCount)
    .map(([k, nc]) => ({ k, nc, total: totalCount[k] || 1, pct: Math.round((nc / (totalCount[k] || 1)) * 100) }))
    .sort((a, b) => b.nc - a.nc)
    .slice(0, 10);

  if (!sorted.length) {
    container.innerHTML = '<div class="empty-state">Aucune non-conformité.</div>';
    return;
  }

  const rows = sorted.map(({ k, nc, total, pct }) => {
    const [zone, ...rest] = k.split(' | ');
    return `<tr>
      <td>${rest.join(' | ')}</td>
      <td>${zone}</td>
      <td><span class="badge-nc-count">${nc}</span></td>
      <td><span class="pct-badge ${pct >= 50 ? 'pct-red' : 'pct-orange'}">${pct}%</span></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Point de contrôle</th><th>Zone</th><th>Nb NC</th><th>% NC</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderChartDonutConformite(C, NC) {
  const container = document.getElementById('chartDonutConformite');
  if (!container) return;
  const total = C + NC;
  if (!total) { container.innerHTML = '<div class="empty-state">Aucune donnée</div>'; return; }

  const pctC = (C / total * 100).toFixed(1);
  const centerTextPlugin = {
    id: 'donutCenter',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { top, bottom, left, right } } = chart;
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.fillStyle = '#10b981';
      ctx.fillText(pctC + '%', cx, cy - 8);
      ctx.font = '11px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Conformes', cx, cy + 10);
      ctx.restore();
    }
  };

  const canvas = _makeCanvas(container, 220);
  _charts[container.id] = new Chart(canvas, {
    type: 'doughnut',
    plugins: [centerTextPlugin],
    data: {
      labels: ['Conforme', 'Non conforme'],
      datasets: [{
        data: [C, NC],
        backgroundColor: ['#10b981', '#ef4444'],
        hoverBackgroundColor: ['#059669', '#dc2626'],
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = (ctx.parsed / total * 100).toFixed(1);
              return ` ${ctx.label} : ${ctx.parsed.toLocaleString('fr-FR')} pts (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderChartControlesType(vols, controles) {
  const container = document.getElementById('chartControlesType');
  if (!container) return;
  if (!vols.length) { container.innerHTML = '<div class="empty-state">Aucune donnée</div>'; return; }

  const TYPES = [
    { key: 'Moyen Porteur Transit',  label: 'MP Transit',  color: '#e57282' },
    { key: 'Gros Porteur Transit',   label: 'GP Transit',  color: '#3b82f6' },
    { key: 'Moyen Porteur Stop Cmn', label: 'MP Stop CMN', color: '#f59e0b' },
    { key: 'Gros Porteur Stop Cmn',  label: 'GP Stop CMN', color: '#8b5cf6' },
  ];

  const volTypeMap = {};
  vols.forEach(v => { volTypeMap[v.id] = v.type_vol; });

  const data = {};
  TYPES.forEach(t => { data[t.key] = { vols: 0, ctrl: 0, C: 0, NC: 0 }; });
  vols.forEach(v => { if (data[v.type_vol]) data[v.type_vol].vols++; });
  controles.forEach(c => {
    const t = volTypeMap[c.vol_id];
    if (!data[t]) return;
    data[t].ctrl++;
    if (c.conformite === 'C') data[t].C++;
    else if (c.conformite === 'NC') data[t].NC++;
  });

  const ctrlTaux = TYPES.map(t => {
    const d = data[t.key];
    return (d.C + d.NC) > 0 ? Math.round(d.C / (d.C + d.NC) * 100) : null;
  });
  const canvas = _makeCanvas(container, 200);
  _charts[container.id] = new Chart(canvas, {
    type: 'bar',
    plugins: [_barLabelPlugin('ctrlTypeLabel', i => ctrlTaux[i] !== null ? ctrlTaux[i] + '%' : null)],
    data: {
      labels: TYPES.map(t => t.label),
      datasets: [{
        data: ctrlTaux.map(t => t ?? 0),
        backgroundColor: TYPES.map(t => t.color + 'cc'),
        hoverBackgroundColor: TYPES.map(t => t.color),
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const t = TYPES[ctx.dataIndex];
              const d = data[t.key];
              const taux = ctrlTaux[ctx.dataIndex] !== null ? ctrlTaux[ctx.dataIndex] + '%' : '—';
              return ` ${taux}  (${d.vols} vol${d.vols !== 1 ? 's' : ''} · ${d.ctrl} pts)`;
            }
          }
        }
      },
      scales: {
        x: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: _gridColor() } },
        y: { grid: { display: false } }
      }
    }
  });
}

function renderChartTypeVol(vols, controles) {
  const container = document.getElementById('chartTypeVol');
  if (!container) return;
  const groups = { 'Moyen Porteur': ['Moyen Porteur Transit', 'Moyen Porteur Stop Cmn'], 'Gros Porteur': ['Gros Porteur Transit', 'Gros Porteur Stop Cmn'] };
  const volMap  = {};
  vols.forEach(v => { for (const [g, types] of Object.entries(groups)) { if (types.includes(v.type_vol)) { volMap[v.id] = g; break; } } });
  const data    = { 'Moyen Porteur': { C: 0, NC: 0, vols: 0 }, 'Gros Porteur': { C: 0, NC: 0, vols: 0 } };
  vols.forEach(v => { if (volMap[v.id]) data[volMap[v.id]].vols++; });
  controles.forEach(c => { const g = volMap[c.vol_id]; if (g && (c.conformite === 'C' || c.conformite === 'NC')) data[g][c.conformite]++; });
  const colorMap = { 'Moyen Porteur': '#e57282', 'Gros Porteur': '#3b82f6' };
  const hasData  = Object.values(data).some(d => d.vols > 0);
  if (!hasData) { container.innerHTML = '<div class="empty-state">Aucune donnée</div>'; return; }
  const labels = Object.keys(data);
  const typeVolTaux = labels.map(g => {
    const d = data[g];
    const total = d.C + d.NC;
    return total > 0 ? Math.round(d.C / total * 100) : null;
  });
  const canvas = _makeCanvas(container, 140);
  _charts[container.id] = new Chart(canvas, {
    type: 'bar',
    plugins: [_barLabelPlugin('typeVolLabel', i => typeVolTaux[i] !== null ? typeVolTaux[i] + '%' : null)],
    data: {
      labels,
      datasets: [{
        data: typeVolTaux.map(t => t ?? 0),
        backgroundColor: labels.map(g => colorMap[g] + 'cc'),
        hoverBackgroundColor: labels.map(g => colorMap[g]),
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = data[labels[ctx.dataIndex]];
              return ` ${ctx.parsed.x}%  (${d.vols} vol${d.vols !== 1 ? 's' : ''} · ${d.C} C / ${d.NC} NC)`;
            }
          }
        }
      },
      scales: {
        x: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: _gridColor() } },
        y: { grid: { display: false } }
      }
    }
  });
}

function renderChartCompagnies(vols) {
  const container = document.getElementById('chartCompagnies');
  if (!container) return;

  const cieMap = Object.fromEntries(allCompagnies.map(c => [c.code, c]));
  const validCodes = new Set(allCompagnies.map(c => c.code));
  const counts = {};
  vols.forEach(v => {
    const cie = v.numero_vol?.match(/^[A-Z]+/)?.[0];
    if (cie && validCodes.has(cie)) counts[cie] = (counts[cie] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { container.innerHTML = '<div class="empty-state">Aucune donnée</div>'; return; }

  const maxCount = entries[0][1];
  container.innerHTML = `
    <div class="cie-cards-grid">
      ${entries.map(([code, count]) => {
        const cie = cieMap[code] || { code, nom: code, logo_url: null };
        const pct = Math.round(count / maxCount * 100);
        const logoHtml = cie.logo_url
          ? `<img src="cieslogs/${cie.logo_url}" alt="${cie.code}"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : '';
        return `
          <div class="cie-vol-card">
            <div class="cie-vol-logo">
              ${logoHtml}
              <span class="cie-vol-initials" style="${cie.logo_url ? 'display:none' : ''}">${cie.code}</span>
            </div>
            <div class="cie-vol-info">
              <div class="cie-vol-name">${cie.nom || cie.code}</div>
              <div class="cie-vol-count">${count} vol${count > 1 ? 's' : ''}</div>
              <div class="cie-vol-bar-track"><div class="cie-vol-bar-fill" style="width:${pct}%"></div></div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

async function loadActiviteRecente() {
  const container = document.getElementById('activiteRecente');

  let data;
  if (isDemoMode) {
    data = demoGetVols()
      .filter(v => v.statut === 'soumis')
      .slice(0, 5)
      .map(v => ({ ...v, profiles: v.profiles || { nom: 'Agent Démo', matricule: '—' } }));
  } else {
    const { data: d } = await supabase
      .from('vols')
      .select('*, profiles(nom, matricule)')
      .eq('statut', 'soumis')
      .order('updated_at', { ascending: false })
      .limit(5);
    data = d || [];
  }

  if (!data.length) {
    container.innerHTML = '<div class="empty-state">Aucune activité récente.</div>';
    return;
  }

  const rows = data.map(v => `
    <div class="activity-item">
      <div class="activity-icon">✈</div>
      <div class="activity-body">
        <strong>${v.numero_vol}</strong> — ${v.profiles?.nom || '—'}
        <span class="activity-time">${formatDatetime(v.updated_at)}</span>
      </div>
      <span class="statut-badge statut-soumis">Soumis</span>
    </div>
  `).join('');

  container.innerHTML = '<div class="activity-list">' + rows + '</div>';
}

// ---- REALTIME ----

function setupRealtime() {
  realtimeSub = supabase
    .channel('admin-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vols' }, () => {
      showToast('Nouvelle activité reçue en temps réel', 'info');
      loadActiviteRecente();
      loadDashboard();
      loadNotifications();
    })
    .subscribe();
}

// ---- NOTIFICATIONS ----

let _notifPollTimer = null;
// Référence "ouverture de l'app" — seuls les vols soumis après ce moment comptent dans la cloche
const _appOpenedAt = new Date().toISOString();

function setupNotifications() {
  const wrap = document.getElementById('notifWrap');
  const btn = document.getElementById('btnNotif');
  const dropdown = document.getElementById('notifDropdown');
  if (!wrap || !btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = dropdown.style.display !== 'block';
    dropdown.style.display = opening ? 'block' : 'none';
    if (opening) loadNotifications();
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) dropdown.style.display = 'none';
  });

  loadNotifications();
  if (!isDemoMode) _notifPollTimer = setInterval(loadNotifications, 60000);
}

async function loadNotifications() {
  const badge = document.getElementById('notifBadge');
  const list = document.getElementById('notifList');
  if (!badge || !list) return;

  let vols = [];
  let totalCount = 0;
  try {
    if (isDemoMode) {
      const allSoumis = demoGetVols().filter(v => v.statut === 'soumis' && v.updated_at > _appOpenedAt);
      totalCount = allSoumis.length;
      vols = allSoumis
        .map(v => ({ ...v, profiles: v.profiles || { nom: 'Agent Démo' } }))
        .slice(0, 15);
    } else {
      const { count, error: countError } = await supabase
        .from('vols')
        .select('id', { count: 'exact', head: true })
        .eq('statut', 'soumis')
        .gt('updated_at', _appOpenedAt);
      if (countError) throw countError;
      totalCount = count || 0;

      const { data, error } = await supabase
        .from('vols')
        .select('id, numero_vol, date_vol, statut, updated_at, profiles(nom)')
        .eq('statut', 'soumis')
        .gt('updated_at', _appOpenedAt)
        .order('updated_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      vols = data || [];
    }
  } catch (err) {
    console.error(err);
    return;
  }

  badge.style.display = totalCount > 0 ? 'flex' : 'none';
  if (totalCount > 0) badge.textContent = totalCount > 99 ? '99+' : String(totalCount);

  list.innerHTML = vols.length
    ? vols.map(v => `
        <div class="notif-item" onclick="window.adminViewFiche('${v.id}','${(v.numero_vol||'').replace(/'/g,"\\'")}','${v.date_vol}')">
          <i class="fas fa-paper-plane notif-item-icon"></i>
          <div class="notif-item-body">
            <div class="notif-item-text"><strong>${v.numero_vol}</strong> soumis par ${v.profiles?.nom || '—'}</div>
            <div class="notif-item-time">${formatRelativeTime(v.updated_at)}</div>
          </div>
        </div>
      `).join('')
    : '<div class="notif-empty">Aucune notification</div>';
}

// ---- TOUS LES CONTRÔLES ----

async function loadTousControles(filters = {}) {
  const container = document.getElementById('tousControlesTable');
  container.innerHTML = '<div class="loading-state">Chargement…</div>';

  try {
    let vols;

    if (isDemoMode) {
      vols = demoGetVols().map(v => {
        const ctrl = demoGetControles(v.id);
        return {
          ...v,
          profiles: v.profiles || { nom: 'Agent Démo', matricule: '—' },
          controles: ctrl
        };
      });
      if (filters.statut) vols = vols.filter(v => v.statut === filters.statut);
      if (filters.typeVol) vols = vols.filter(v => v.type_vol === filters.typeVol);
    } else {
      let query = supabase
        .from('vols')
        .select('*, profiles(nom, matricule)')
        .order('date_vol', { ascending: false });

      if (filters.agent) query = query.eq('agent_id', filters.agent);
      if (filters.dateDe) query = query.gte('date_vol', filters.dateDe);
      if (filters.dateA) query = query.lte('date_vol', filters.dateA);
      if (filters.statut) query = query.eq('statut', filters.statut);
      if (filters.typeVol) query = query.eq('type_vol', filters.typeVol);

      const { data, error } = await query;
      if (error) throw error;
      vols = data || [];

      if (vols.length) {
        const volIds = vols.map(v => v.id);
        const CHUNK = 20;
        const allCtrl = [];
        for (let i = 0; i < volIds.length; i += CHUNK) {
          const chunk = volIds.slice(i, i + CHUNK);
          const { data: ctrlData, error: ctrlError } = await supabase
            .from('controles')
            .select('vol_id, conformite')
            .in('vol_id', chunk)
            .limit(10000);
          if (ctrlError) throw ctrlError;
          allCtrl.push(...(ctrlData || []));
        }
        const ctrlMap = {};
        allCtrl.forEach(c => {
          if (!ctrlMap[c.vol_id]) ctrlMap[c.vol_id] = [];
          ctrlMap[c.vol_id].push(c);
        });
        vols = vols.map(v => ({ ...v, controles: ctrlMap[v.id] || [] }));
      }
    }

    if (!vols.length) {
      container.innerHTML = '<div class="empty-state">Aucun contrôle trouvé.</div>';
      return;
    }

    const rows = vols.map(vol => {
      const ctrl = vol.controles || [];
      const C = ctrl.filter(c => c.conformite === 'C').length;
      const NC = ctrl.filter(c => c.conformite === 'NC').length;
      const total = ctrl.length;
      const taux = (C + NC) > 0 ? ((C / (C + NC)) * 100).toFixed(1) : '—';
      const badge = getStatutBadge(vol.statut);

      return `
        <tr>
          <td><strong>${vol.numero_vol}</strong></td>
          <td>${formatDate(vol.date_vol)}</td>
          <td>${vol.immatriculation || '—'}</td>
          <td>${vol.type_vol}</td>
          <td>${vol.profiles?.nom || '—'}</td>
          <td>${vol.heure_debut || '—'} → ${vol.heure_fin || '—'}</td>
          <td>${total > 0 ? total : '<span class="badge badge-warn" title="Aucun point de contrôle enregistré">Vide</span>'}</td>
          <td>${C}</td>
          <td><span class="badge-nc-count">${NC}</span></td>
          <td>${taux !== '—' ? taux + '%' : (total === 0 ? '<span class="badge badge-warn">—</span>' : '—')}</td>
          <td>${badge}</td>
          <td class="actions-cell">
            <button class="btn btn-outline btn-xs" onclick="adminViewFiche('${vol.id}', '${vol.numero_vol}', '${vol.date_vol}')">Voir</button>
            ${['admin','chef'].includes(currentUser?.role) && vol.statut === 'soumis' ? `<button class="btn btn-outline btn-xs" style="color:#16a34a;border-color:#16a34a;" onclick="adminEditVol('${vol.id}','${vol.numero_vol.replace(/'/g,"\\'")}','${vol.date_vol}','${(vol.immatriculation||'').replace(/'/g,"\\'")}','${vol.type_vol}','${vol.heure_debut||''}','${vol.heure_fin||''}')"><i class="fas fa-pen"></i></button>` : ''}
            ${['admin','chef'].includes(currentUser?.role) ? `<button class="btn btn-danger btn-xs" onclick="adminConfirmDeleteVol('${vol.id}','${vol.numero_vol}')">🗑</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="table-scroll">
        <table class="data-table data-table-wide">
          <thead>
            <tr>
              <th>N° vol</th><th>Date</th><th>Immat.</th><th>Type</th><th>Agent</th>
              <th>Heures</th><th>Total</th><th>C</th><th>NC</th>
              <th>Taux</th><th>Statut</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<div class="empty-state error">Erreur de chargement.</div>';
    console.error(err);
  }
}

// Filtres
document.getElementById('btnFiltrer')?.addEventListener('click', () => {
  const filters = {
    agent: document.getElementById('filterAgent').value,
    dateDe: document.getElementById('filterDateDe').value,
    dateA: document.getElementById('filterDateA').value,
    statut: document.getElementById('filterStatut').value,
    typeVol: document.getElementById('filterTypeVol').value
  };
  loadTousControles(filters);
});

document.getElementById('btnResetFiltres')?.addEventListener('click', () => {
  ['filterAgent', 'filterStatut', 'filterTypeVol'].forEach(id => document.getElementById(id).value = '');
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('filterDateDe').value = today;
  document.getElementById('filterDateA').value = today;
  loadTousControles({ dateDe: today, dateA: today });
});

// ---- VOIR FICHE (ADMIN) ----

window.adminViewFiche = async function(volId, numero, date) {
  document.getElementById('modalFiche').style.display = 'flex';
  document.getElementById('modalFicheTitle').textContent = 'Fiche – Vol ' + numero + ' – ' + formatDate(date);
  const body = document.getElementById('modalFicheBody');
  body.innerHTML = '<div class="loading-state">Chargement…</div>';

  try {
    let vol, controlesList, photosList;

    if (isDemoMode) {
      vol = demoGetVol(volId);
      controlesList = demoGetControles(volId);
      photosList = [];
      if (vol) vol.profiles = vol.profiles || { nom: 'Agent Démo', matricule: '—' };
    } else {
      const r1 = await supabase.from('vols').select('*, profiles(nom, matricule)').eq('id', volId).single();
      const r2 = await supabase.from('controles').select('*').eq('vol_id', volId);
      const r3 = await supabase.from('photos').select('*').eq('vol_id', volId);
      vol = r1.data;
      controlesList = r2.data || [];
      photosList = r3.data || [];
    }

    if (!vol) { body.innerHTML = '<div class="empty-state error">Introuvable.</div>'; return; }

    document.getElementById('modalFicheTitle').textContent = 'Fiche – Vol ' + vol.numero_vol + ' – ' + formatDate(vol.date_vol);

    const controleMap = {};
    controlesList.forEach(c => {
      const key = c.zone + '|' + (c.sous_zone || '') + '|' + c.point_controle;
      controleMap[key] = c;
    });
    const photosMap = {};
    photosList.forEach(p => {
      if (p.controle_id) {
        if (!photosMap[p.controle_id]) photosMap[p.controle_id] = [];
        photosMap[p.controle_id].push(p);
      }
    });

    const vals = Object.values(controleMap);
    const C = vals.filter(c => c.conformite === 'C').length;
    const NC = vals.filter(c => c.conformite === 'NC').length;
    const taux = (C + NC) > 0 ? ((C / (C + NC)) * 100).toFixed(1) : '—';

    let html = `
      <div class="fiche-header-print">
        <div class="fiche-meta-grid">
          <div><strong>Vol :</strong> ${vol.numero_vol}</div>
          <div><strong>Type :</strong> ${vol.type_vol}</div>
          <div><strong>Date :</strong> ${formatDate(vol.date_vol)}</div>
          <div><strong>Immat. :</strong> ${vol.immatriculation || '—'}</div>
          <div><strong>Agent :</strong> ${vol.profiles?.nom || '—'} (${vol.profiles?.matricule || '—'})</div>
          <div><strong>Heures :</strong> ${vol.heure_debut || '—'} → ${vol.heure_fin || '—'}</div>
        </div>
        <div class="resume-stats">
          <span class="badge-stat badge-c">✅ ${C} C</span>
          <span class="badge-stat badge-nc">❌ ${NC} NC</span>
          <span class="badge-stat">📊 Taux : ${taux}%</span>
        </div>
        ${vol.motif_rejet ? '<div class="motif-rejet">Motif rejet : ' + vol.motif_rejet + '</div>' : ''}
      </div>
    `;

    getFicheStructure(vol.type_vol).forEach(section => {
      const label = section.sous_zone ? section.zone + ' – ' + section.sous_zone : section.zone;
      html += '<div class="fiche-section-print"><h4>' + section.icon + ' ' + label + '</h4><div class="fiche-points-print">';
      section.points.forEach(point => {
        const key = section.zone + '|' + (section.sous_zone || '') + '|' + point;
        const ctrl = controleMap[key];
        const conf = ctrl?.conformite || '—';
        const confClass = conf === 'C' ? 'conf-c' : conf === 'NC' ? 'conf-nc' : '';
        const confLabel = conf === 'C' ? '✅ C' : conf === 'NC' ? '❌ NC' : '—';
        const photos = ctrl ? (photosMap[ctrl.id] || []) : [];
        html += `
          <div class="fiche-point-row ${confClass}">
            <span class="point-name">${point}</span>
            <span class="point-conf ${confClass}">${confLabel}</span>
            ${ctrl?.observation ? '<span class="point-obs">📝 ' + ctrl.observation + '</span>' : ''}
            <div class="point-photos">${photos.map(p => '<img src="' + p.url_publique + '" class="photo-thumb-sm" onclick="openLightbox(\'' + p.url_publique + '\')" />').join('')}</div>
          </div>
        `;
      });
      html += '</div></div>';
    });

    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div class="empty-state error">Erreur de chargement.</div>';
    console.error(err);
  }
};

// ---- PAR AGENT ----

function setupParAgent() {
  const select = document.getElementById('selectAgentDetail');
  const selectMois = document.getElementById('selectAgentMois');
  const reload = async () => {
    const agentId = select.value;
    if (!agentId) { document.getElementById('agentDetailContent').innerHTML = ''; return; }
    await loadAgentDetail(agentId, selectMois?.value || '');
  };
  select.addEventListener('change', reload);
  selectMois?.addEventListener('change', reload);
}

async function loadAgentDetail(agentId, month = '') {
  const container = document.getElementById('agentDetailContent');
  container.innerHTML = '<div class="loading-state">Chargement…</div>';

  const range = month ? monthToRange(month) : null;
  let volsList, ncList;
  let totalVols = 0, totalC = 0, totalNC = 0;

  if (isDemoMode) {
    volsList = demoGetVols(agentId).map(v => ({ ...v, controles: demoGetControles(v.id) }));
    if (range) volsList = volsList.filter(v => v.date_vol >= range.first && v.date_vol <= range.last);
    ncList = demoGetAllControles().filter(c => {
      const vol = demoGetVol(c.vol_id);
      return c.conformite === 'NC' && vol?.agent_id === agentId;
    }).map(c => ({ zone: c.zone, point_controle: c.point_controle }));
    totalVols = volsList.length;
    volsList.forEach(v => (v.controles || []).forEach(c => {
      if (c.conformite === 'C') totalC++; else if (c.conformite === 'NC') totalNC++;
    }));
  } else {
    // 1 — Stats globales via RPC (totalVols, totalC, totalNC en 1 requête)
    const [{ data: statsData }, { data: volsData }] = await Promise.all([
      supabase.rpc('agent_stats', {
        p_agent_id: agentId,
        p_from: range?.first || null,
        p_to:   range?.last  || null
      }),
      (() => {
        let q = supabase.from('vols')
          .select('id, numero_vol, date_vol, type_vol, statut')
          .eq('agent_id', agentId).order('date_vol', { ascending: false }).limit(1000);
        if (range) q = q.gte('date_vol', range.first).lte('date_vol', range.last);
        return q;
      })()
    ]);

    const stats = statsData?.[0] || { total_vols: 0, total_c: 0, total_nc: 0 };
    totalVols = Number(stats.total_vols);
    totalC    = Number(stats.total_c);
    totalNC   = Number(stats.total_nc);
    volsList  = volsData || [];

    // 2 — Contrôles des vols affichés (pour colonnes C/NC du tableau + top NC)
    const displayIds = volsList.map(v => v.id);
    const displayControles = displayIds.length > 0
      ? await fetchControlesForVols(displayIds, 'conformite, zone, point_controle, vol_id')
      : [];

    const byVol = {};
    displayControles.forEach(c => {
      if (!byVol[c.vol_id]) byVol[c.vol_id] = { C: 0, NC: 0 };
      if (c.conformite === 'C')       byVol[c.vol_id].C++;
      else if (c.conformite === 'NC') byVol[c.vol_id].NC++;
    });
    volsList.forEach(v => { v._C = (byVol[v.id] || {}).C || 0; v._NC = (byVol[v.id] || {}).NC || 0; });

    ncList = displayControles
      .filter(c => c.conformite === 'NC')
      .map(c => ({ zone: c.zone, point_controle: c.point_controle }));
  }
  const taux = (totalC + totalNC) > 0 ? ((totalC / (totalC + totalNC)) * 100).toFixed(1) : '—';

  const ncCount = {};
  ncList.forEach(c => {
    const k = c.zone + ' | ' + c.point_controle;
    ncCount[k] = (ncCount[k] || 0) + 1;
  });
  const topNc = Object.entries(ncCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const volRows = volsList.map(v => {
    const C  = v._C  ?? (v.controles || []).filter(c => c.conformite === 'C').length;
    const NC = v._NC ?? (v.controles || []).filter(c => c.conformite === 'NC').length;
    return `<tr>
      <td>${v.numero_vol}</td>
      <td>${formatDate(v.date_vol)}</td>
      <td>${v.type_vol}</td>
      <td>${C}</td>
      <td><span class="badge-nc-count">${NC}</span></td>
      <td>${getStatutBadge(v.statut)}</td>
      <td><button class="btn btn-outline btn-xs" onclick="adminViewFiche('${v.id}','${v.numero_vol}','${v.date_vol}')">Voir</button></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="stats-grid" style="margin-bottom:1.5rem;">
      <div class="stat-card"><div class="stat-icon">✈</div><div class="stat-body"><div class="stat-value">${totalVols}</div><div class="stat-label">Total vols</div></div></div>
      <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-body"><div class="stat-value">${taux !== '—' ? taux + '%' : '—'}</div><div class="stat-label">Taux conformité</div></div></div>
      <div class="stat-card"><div class="stat-icon">❌</div><div class="stat-body"><div class="stat-value">${totalNC}</div><div class="stat-label">Total NC</div></div></div>
    </div>
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><h3>Historique des vols</h3></div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>N° vol</th><th>Date</th><th>Type</th><th>C</th><th>NC</th><th>Statut</th><th>Action</th></tr></thead>
            <tbody>${volRows || '<tr><td colspan="7" class="empty-state">Aucun vol</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
    ${topNc.length ? `
    <div class="card">
      <div class="card-header"><h3>🔴 NC les plus fréquentes</h3></div>
      <div class="card-body">
        <table class="data-table">
          <thead><tr><th>Point de contrôle</th><th>Nb NC</th></tr></thead>
          <tbody>${topNc.map(([k, n]) => '<tr><td>' + k + '</td><td><span class="badge-nc-count">' + n + '</span></td></tr>').join('')}</tbody>
        </table>
      </div>
    </div>` : ''}
  `;
}

// ---- NON-CONFORMITÉS ----

async function loadNC(filters = {}) {
  const container = document.getElementById('ncTable');
  container.innerHTML = '<div class="loading-state">Chargement…</div>';

  try {
    let data;

    if (isDemoMode) {
      data = demoGetAllControles()
        .filter(c => c.conformite === 'NC')
        .map(c => {
          const vol = demoGetVol(c.vol_id);
          return {
            ...c,
            photos: [],
            vols: vol ? { ...vol, profiles: vol.profiles || { nom: 'Agent Démo', matricule: '—' } } : null
          };
        });
      if (filters.zone) data = data.filter(c => c.zone === filters.zone);
    } else {
      let query = supabase
        .from('controles')
        .select('*, vols!inner(numero_vol, date_vol, statut, agent_id, profiles(nom, matricule)), photos(url_publique)')
        .eq('conformite', 'NC')
        .order('created_at', { ascending: false });

      if (filters.zone)   query = query.eq('zone', filters.zone);
      if (filters.agent)  query = query.eq('vols.agent_id', filters.agent);
      if (filters.dateDe) query = query.gte('vols.date_vol', filters.dateDe);
      if (filters.dateA)  query = query.lte('vols.date_vol', filters.dateA);

      const { data: d, error } = await query;
      if (error) throw error;
      data = d || [];
    }

    if (!data.length) {
      container.innerHTML = '<div class="empty-state">Aucune non-conformité.</div>';
      return;
    }

    const rows = data.map(c => {
      const photos = c.photos || [];
      const thumbs = photos.map(p => '<img src="' + p.url_publique + '" class="photo-thumb-xs" onclick="openLightbox(\'' + p.url_publique + '\')" />').join('');
      return `
        <tr>
          <td>${c.vols?.profiles?.nom || '—'}</td>
          <td>${c.vols?.numero_vol || '—'}</td>
          <td>${formatDate(c.vols?.date_vol)}</td>
          <td>${c.zone}</td>
          <td>${c.point_controle}</td>
          <td>${c.observation || '—'}</td>
          <td>${thumbs || '—'}</td>
          <td>${getStatutBadge(c.vols?.statut)}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Agent</th><th>N° vol</th><th>Date</th><th>Zone</th>
            <th>Point de contrôle</th><th>Observation</th><th>Photo</th><th>Statut</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = '<div class="empty-state error">Erreur.</div>';
    console.error(err);
  }
}

document.getElementById('btnFiltrerNC')?.addEventListener('click', () => {
  const mois = document.getElementById('filterNcMois')?.value || '';
  const range = mois ? monthToRange(mois) : null;
  loadNC({
    zone: document.getElementById('filterNcZone').value,
    agent: document.getElementById('filterNcAgent').value,
    dateDe: range ? range.first : '',
    dateA:  range ? range.last  : ''
  });
});

// ---- GESTION AGENTS ----

const ROLE_LABELS = { agent: 'Agent Contrôle', superviseur: 'Superviseur', chef: 'Chef Dept', admin: 'Admin' };
const ROLE_COLORS = { agent: 'statut-valide', superviseur: 'statut-en-cours', chef: 'statut-soumis', admin: 'statut-rejete' };

async function loadAgentsTable() {
  const container = document.getElementById('agentsTable');
  container.innerHTML = '<div class="loading-state">Chargement…</div>';

  let data;
  if (isDemoMode) {
    data = demoGetAgents().map(a => ({ ...a, vols: demoGetVols(a.id) }));
  } else {
    const { data: d } = await supabase
      .from('profiles')
      .select('*, vols(count)')
      .neq('role', 'admin')
      .order('nom');
    data = d || [];
  }

  if (!data.length) { container.innerHTML = '<div class="empty-state">Aucun utilisateur.</div>'; return; }

  const isAdmin = currentUser?.role === 'admin';
  const rows = data.map(a => `
    <tr>
      <td><strong>${a.nom}</strong></td>
      <td><code>${a.matricule || '—'}</code></td>
      <td><span class="statut-badge ${ROLE_COLORS[a.role] || ''}">${ROLE_LABELS[a.role] || a.role}</span></td>
      <td>${Array.isArray(a.vols) && a.vols[0]?.count !== undefined ? a.vols[0].count : (a.vols || []).length}</td>
      <td>${a.actif ? '<span class="statut-badge statut-valide">Actif</span>' : '<span class="statut-badge statut-rejete">Inactif</span>'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        ${a.actif
          ? `<button class="btn btn-outline btn-xs btn-danger" onclick="toggleAgent('${a.id}', false)">Désactiver</button>`
          : `<button class="btn btn-success btn-xs" onclick="toggleAgent('${a.id}', true)">Activer</button>`
        }
        ${(isAdmin || currentUser?.role === 'chef') && a.role === 'agent'
          ? `<button class="btn btn-warning btn-xs" onclick="resetPasswordAgent('${a.id}','${a.nom.replace(/'/g, "\\'")}')"><i class="fas fa-key"></i> CABINE</button>`
          : ''}
        ${isAdmin && ['agent','superviseur'].includes(a.role)
          ? (a.role === 'agent'
              ? `<button class="btn btn-outline btn-xs" onclick="changeRole('${a.id}','superviseur','${a.nom.replace(/'/g, "\\'")}')"><i class="fas fa-arrow-up"></i> Superviseur</button>`
              : `<button class="btn btn-outline btn-xs" onclick="changeRole('${a.id}','agent','${a.nom.replace(/'/g, "\\'")}')"><i class="fas fa-arrow-down"></i> Agent</button>`)
          : ''}
        ${isAdmin ? `<button class="btn btn-danger btn-xs" onclick="confirmDeleteUser('${a.id}','${a.nom.replace(/'/g, "\\'")}')">Supprimer</button>` : ''}
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Nom</th><th>Matricule</th><th>Rôle</th><th>Nb vols</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

window.resetPasswordAgent = async function(agentId, nom) {
  if (!confirm(`Réinitialiser le mot de passe de ${nom} à "CABINE" ?`)) return;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.access_token) {
      showToast('Session expirée — veuillez vous reconnecter.', 'error');
      return;
    }
    const res = await fetch(
      'https://htkdryptzdvztcgjgfax.supabase.co/functions/v1/reset-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: agentId })
      }
    );
    let result;
    try { result = await res.json(); } catch { result = {}; }
    if (!res.ok) throw new Error(result.error || `Erreur serveur (${res.status})`);
    showToast(`Mot de passe de ${nom} réinitialisé à "CABINE".`, 'success', 4000);
  } catch (err) {
    showToast(err.message || 'Erreur réinitialisation', 'error');
    console.error('[resetPasswordAgent]', err);
  }
};

let _changeRolePending = null;

window.changeRole = function(agentId, newRole, nom) {
  const label = newRole === 'superviseur' ? 'Superviseur' : 'Agent de contrôle';
  const fromLabel = newRole === 'superviseur' ? 'Agent de contrôle' : 'Superviseur';
  _changeRolePending = { agentId, newRole, nom };
  document.getElementById('modalChangeRoleTitle').textContent = `Changer le rôle de ${nom} ?`;
  document.getElementById('modalChangeRoleText').innerHTML =
    `Le rôle de <strong>${nom}</strong> passera de <strong>${fromLabel}</strong> à <strong>${label}</strong>.<br>Cette action prend effet immédiatement.`;
  document.getElementById('modalChangeRole').style.display = 'flex';
};

document.getElementById('btnAnnulerChangeRole')?.addEventListener('click', () => {
  document.getElementById('modalChangeRole').style.display = 'none';
  _changeRolePending = null;
});

document.getElementById('btnConfirmerChangeRole')?.addEventListener('click', async () => {
  if (!_changeRolePending) return;
  const { agentId, newRole, nom } = _changeRolePending;
  const label = newRole === 'superviseur' ? 'Superviseur' : 'Agent de contrôle';
  const btn = document.getElementById('btnConfirmerChangeRole');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';
  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', agentId);
  btn.disabled = false;
  btn.textContent = 'Confirmer';
  document.getElementById('modalChangeRole').style.display = 'none';
  _changeRolePending = null;
  if (error) { showToast('Erreur lors du changement de rôle', 'error'); return; }
  showToast(`${nom} est maintenant ${label}.`, 'success');
  loadAgentsTable();
});

window.toggleAgent = async function(agentId, actif) {
  if (isDemoMode) {
    demoToggleAgent(agentId, actif);
    showToast(actif ? 'Utilisateur activé' : 'Utilisateur désactivé', 'success');
    loadAgentsTable();
    return;
  }
  const { error } = await supabase.from('profiles').update({ actif }).eq('id', agentId);
  if (error) { showToast('Erreur', 'error'); return; }
  showToast(actif ? 'Utilisateur activé' : 'Utilisateur désactivé', 'success');
  loadAgentsTable();
};

let deleteUserId = null;

window.confirmDeleteUser = function(userId, nom) {
  deleteUserId = userId;
  document.getElementById('deleteUserNom').textContent = nom;
  document.getElementById('modalDeleteUser').style.display = 'flex';
};

// ---- MODALS ----

function setupModals() {
  // Ajouter utilisateur
  document.getElementById('btnAjouterAgent')?.addEventListener('click', () => {
    document.getElementById('agentNomField').value = '';
    document.getElementById('agentMatriculeField').value = '';
    document.getElementById('agentPasswordField').value = 'CABINE';
    document.getElementById('agentRoleField').value = 'agent';
    document.getElementById('agentModalError').style.display = 'none';
    document.getElementById('modalAgent').style.display = 'flex';
  });
  document.getElementById('btnAnnulerAgent')?.addEventListener('click', () => {
    document.getElementById('modalAgent').style.display = 'none';
  });
  document.getElementById('btnConfirmerAgent')?.addEventListener('click', createAgent);

  // Supprimer utilisateur
  document.getElementById('btnAnnulerDelete')?.addEventListener('click', () => {
    document.getElementById('modalDeleteUser').style.display = 'none';
    deleteUserId = null;
  });
  document.getElementById('btnConfirmerDelete')?.addEventListener('click', deleteUser);

  // Fiche
  document.getElementById('btnCloseFiche')?.addEventListener('click', () => {
    document.getElementById('modalFiche').style.display = 'none';
  });
  document.getElementById('btnFermerFiche')?.addEventListener('click', () => {
    document.getElementById('modalFiche').style.display = 'none';
  });
}

async function createAgent() {
  const nom = document.getElementById('agentNomField').value.trim();
  const matricule = document.getElementById('agentMatriculeField').value.trim().toUpperCase();
  const role = document.getElementById('agentRoleField').value;
  const password = document.getElementById('agentPasswordField').value.trim().toUpperCase();
  const errEl = document.getElementById('agentModalError');

  if (!nom || !matricule || !password) {
    errEl.textContent = 'Veuillez remplir tous les champs obligatoires.';
    errEl.style.display = 'block';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = 'Le mot de passe doit contenir au moins 6 caractères.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('btnConfirmerAgent');
  const btnText = document.getElementById('btnConfirmerAgentText');
  const btnSpinner = document.getElementById('btnConfirmerAgentSpinner');
  btn.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline';

  try {
    if (isDemoMode) {
      demoCreateAgent({ nom, matricule, email: `${matricule}@airport.ma` });
      document.getElementById('modalAgent').style.display = 'none';
      showToast('Utilisateur créé (mode démo).', 'success', 4000);
      await loadAgentsTable();
      await loadAgentsList();
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      'https://htkdryptzdvztcgjgfax.supabase.co/functions/v1/create-user',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ matricule, nom, role, password })
      }
    );
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erreur serveur');

    document.getElementById('modalAgent').style.display = 'none';
    showToast(`${nom} (${matricule}) créé avec succès.`, 'success', 5000);
    await loadAgentsTable();
    await loadAgentsList();
  } catch (err) {
    errEl.textContent = err.message || 'Erreur lors de la création.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
  }
}

async function deleteUser() {
  if (!deleteUserId) return;
  const btn = document.getElementById('btnConfirmerDelete');
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      'https://htkdryptzdvztcgjgfax.supabase.co/functions/v1/delete-user',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId: deleteUserId })
      }
    );
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erreur serveur');

    document.getElementById('modalDeleteUser').style.display = 'none';
    showToast('Utilisateur supprimé.', 'success');
    deleteUserId = null;
    await loadAgentsTable();
    await loadAgentsList();
  } catch (err) {
    showToast(err.message || 'Erreur suppression', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Supprimer';
  }
}

// ---- EXPORT ----

function setupExport() {
  document.getElementById('btnExportCSV')?.addEventListener('click', exportCSV);
  document.getElementById('btnPrintFiche')?.addEventListener('click', printFiche);
}

async function setupExportView() {
  let data;
  if (isDemoMode) {
    data = demoGetVols().map(v => ({ id: v.id, numero_vol: v.numero_vol, date_vol: v.date_vol }));
  } else {
    const { data: d } = await supabase.from('vols').select('id, numero_vol, date_vol').order('date_vol', { ascending: false });
    data = d || [];
  }

  const select = document.getElementById('selectVolPrint');
  if (!select) return;
  select.innerHTML = '<option value="">-- Choisir un vol --</option>';
  data.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.numero_vol + ' – ' + formatDate(v.date_vol);
    select.appendChild(opt);
  });
}

async function exportCSV() {
  showToast('Génération du CSV…', 'info');

  let data;
  if (isDemoMode) {
    data = demoGetAllControles().map(c => {
      const vol = demoGetVol(c.vol_id);
      return {
        ...c,
        vols: vol ? { ...vol, profiles: vol.profiles || { nom: 'Agent Démo', matricule: '—' } } : null
      };
    });
  } else {
    const { data: d } = await supabase
      .from('controles')
      .select('*, vols!inner(numero_vol, date_vol, type_vol, immatriculation, agent_id, profiles(nom, matricule))')
      .order('created_at', { ascending: false });
    data = d || [];
  }

  if (!data.length) { showToast('Aucune donnée à exporter', 'error'); return; }

  const headers = ['Date', 'N° Vol', 'Immatriculation', 'Type avion', 'Agent', 'Matricule', 'Zone', 'Sous-zone', 'Point de contrôle', 'Conformité', 'Observation'];
  const rows = data.map(c => [
    c.vols?.date_vol || '',
    c.vols?.numero_vol || '',
    c.vols?.immatriculation || '',
    c.vols?.type_vol || '',
    c.vols?.profiles?.nom || '',
    c.vols?.profiles?.matricule || '',
    c.zone || '',
    c.sous_zone || '',
    c.point_controle || '',
    c.conformite || '',
    (c.observation || '').replace(/"/g, '""')
  ]);

  const csvContent = [headers, ...rows].map(r => r.map(v => '"' + v + '"').join(',')).join('\n');
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'controles_cabines_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV téléchargé ✓', 'success');
}

async function printFiche() {
  const volId = document.getElementById('selectVolPrint').value;
  if (!volId) { showToast('Choisir un vol', 'error'); return; }
  const vol = isDemoMode ? demoGetVol(volId) : null;
  await adminViewFiche(volId, vol?.numero_vol || '', vol?.date_vol || '');
}

// ---- LIGHTBOX ----

window.openLightbox = function(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').style.display = 'flex';
};
document.getElementById('lightboxClose')?.addEventListener('click', () => {
  document.getElementById('lightbox').style.display = 'none';
});
document.getElementById('lightboxOverlay')?.addEventListener('click', () => {
  document.getElementById('lightbox').style.display = 'none';
});

// ---- HELPERS ----

function formatDatetime(dtStr) {
  if (!dtStr) return '—';
  const d = new Date(dtStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ---- ANALYSES MP / GP ----

const ZONE_DISPLAY = {
  'Cockpit':         { label: 'Cockpit',                      icon: 'fa-plane' },
  'Cabine':          { label: 'Cabine / Sièges',              icon: 'fa-chair' },
  'Cabine ECO':      { label: 'Cabine ECO',                   icon: 'fa-chair' },
  'Premium Economy': { label: 'Premium Economy',              icon: 'fa-star' },
  'CRC':             { label: 'Crew Rest (CRC)',               icon: 'fa-bed' },
  'Toilettes':       { label: 'Toilettes',                    icon: 'fa-toilet' },
  'Galley':          { label: 'Galley / Office',              icon: 'fa-utensils' },
  'Client':          { label: 'Contrôle final / Impression',  icon: 'fa-eye' },
};

async function loadAnalyseType(type) {
  const isMP = type === 'MP';
  const kpiGridId = isMP ? 'mpKpiGrid' : 'gpKpiGrid';
  const typeVolValues = isMP
    ? ['Moyen Porteur Transit', 'Moyen Porteur Stop Cmn']
    : ['Gros Porteur Transit', 'Gros Porteur Stop Cmn'];

  const kpiGrid = document.getElementById(kpiGridId);
  if (!kpiGrid) return;
  kpiGrid.innerHTML = '<div class="loading-state">Chargement…</div>';

  // Spin le bouton actualiser
  const refreshIcon = document.getElementById(isMP ? 'iconRefreshMP' : 'iconRefreshGP');
  const lastUpdatedEl = document.getElementById(isMP ? 'mpLastUpdated' : 'gpLastUpdated');
  if (refreshIcon) refreshIcon.classList.add('spin');

  // Lire le filtre De/À
  const fromSel  = document.getElementById(isMP ? 'mpFilterFrom' : 'gpFilterFrom');
  const toSel    = document.getElementById(isMP ? 'mpFilterTo'   : 'gpFilterTo');
  const now          = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;
  const fromDate = monthToRange(fromSel?.value || defaultMonth).first;
  const toDate   = monthToRange(toSel?.value   || defaultMonth).last;

  try {
    let vols = [], controles = [];
    let profiles = [];

    // Charger les compagnies actives et peupler le filtre
    let allCies = [];
    if (isDemoMode) {
      allCies = [{ code: 'AT', nom: 'Royal Air Maroc' }, { code: 'AF', nom: 'Air France' }];
    } else {
      const { data: cieData } = await supabase.from('compagnies').select('code, nom').eq('actif', true).order('code');
      allCies = cieData || [];
    }
    const cieSel = document.getElementById(isMP ? 'mpFilterCie' : 'gpFilterCie');
    if (cieSel) {
      const prev = cieSel.value;
      cieSel.innerHTML = '<option value="">Toutes</option>' +
        allCies.map(c => `<option value="${c.code}">${c.code} – ${c.nom}</option>`).join('');
      if (allCies.find(c => c.code === prev)) cieSel.value = prev;
    }
    const cieFilter = cieSel?.value || '';
    const validCieCodes = new Set(allCies.map(c => c.code));

    if (isDemoMode) {
      vols = demoGetVols().filter(v =>
        typeVolValues.includes(v.type_vol) &&
        v.statut === 'soumis' &&
        v.date_vol >= fromDate && v.date_vol <= toDate &&
        (!cieFilter || v.numero_vol?.match(/^[A-Z]+/)?.[0] === cieFilter)
      );
      const ids = new Set(vols.map(v => v.id));
      controles = demoGetAllControles().filter(c => ids.has(c.vol_id));
      profiles = demoGetAgents();
    } else {
      // Paginate vols to bypass Supabase's 1000-row default cap
      const allVols = [];
      let volOffset = 0;
      const VOL_PAGE = 1000;
      while (true) {
        let q = supabase
          .from('vols')
          .select('id, numero_vol, immatriculation, agent_id, date_vol, type_vol')
          .eq('statut', 'soumis')
          .in('type_vol', typeVolValues)
          .gte('date_vol', fromDate)
          .lte('date_vol', toDate)
          .order('date_vol')
          .range(volOffset, volOffset + VOL_PAGE - 1);
        if (cieFilter) q = q.like('numero_vol', `${cieFilter}%`);
        const { data: vPage, error: vErr } = await q;
        if (vErr) throw vErr;
        if (!vPage || vPage.length === 0) break;
        allVols.push(...vPage);
        if (vPage.length < VOL_PAGE) break;
        volOffset += VOL_PAGE;
      }
      vols = allVols;

      if (vols.length) {
        const volIds = vols.map(v => v.id);
        const agentIds = [...new Set(vols.map(v => v.agent_id).filter(Boolean))];
        const [cData, pRes] = await Promise.all([
          fetchControlesForVols(volIds, 'vol_id, zone, point_controle, conformite, observation'),
          supabase.from('profiles').select('id, nom').in('id', agentIds)
        ]);
        controles = cData;
        profiles  = pRes.data || [];
      }
    }

    // ---- KPI calcul ----
    // Compter uniquement les codes présents dans la table compagnies
    const rawCieCodes = new Set(vols.map(v => v.numero_vol?.match(/^[A-Z]+/)?.[0]).filter(Boolean));
    const cieSet = new Set([...rawCieCodes].filter(code => validCieCodes.has(code)));
    const agentSet  = new Set(vols.map(v => v.agent_id).filter(Boolean));

    const structs    = typeVolValues.flatMap(t => FICHE_STRUCTURES[t] || []);
    const ZONE_CANON = { 'Cabine ECO': 'Cabine', 'CRC': 'Cabine', 'Premium Economy': 'Cabine' };
    const canonicalZones = new Set(structs.map(s => ZONE_CANON[s.zone] || s.zone).filter(z => z !== 'Client'));
    const uniqueZones = [...new Set(structs.map(s => s.zone))];


    // Période
    let periodeLabel = 'aucun vol enregistré';
    if (vols.length) {
      const months = ['jan.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
      const fmtM = d => { const [y, m] = d.split('-'); return months[parseInt(m) - 1] + ' ' + y; };
      const dates = vols.map(v => v.date_vol).filter(Boolean).sort();
      periodeLabel = dates[0] === dates[dates.length - 1]
        ? 'en ' + fmtM(dates[0])
        : 'sur la période ' + fmtM(dates[0]) + ' – ' + fmtM(dates[dates.length - 1]);
    }

    kpiGrid.innerHTML = `
      <div class="rapport-kpi-card">
        <div class="rapport-kpi-icon"><i class="fas fa-clipboard-check"></i></div>
        <div class="rapport-kpi-value">${vols.length.toLocaleString('fr-FR')}</div>
        <div class="rapport-kpi-label">vols contrôlés</div>
        <div class="rapport-kpi-sublabel">${periodeLabel}</div>
      </div>
      <div class="rapport-kpi-card">
        <div class="rapport-kpi-icon"><i class="fas fa-plane"></i></div>
        <div class="rapport-kpi-value">${cieSet.size || '—'}</div>
        <div class="rapport-kpi-label">compagnies inspectées</div>
        <div class="rapport-kpi-sublabel">${cieSet.size ? [...cieSet].sort().join(' · ') : 'aucune compagnie'}</div>
      </div>
      <div class="rapport-kpi-card">
        <div class="rapport-kpi-icon"><i class="fas fa-bullseye"></i></div>
        <div class="rapport-kpi-value">${canonicalZones.size}</div>
        <div class="rapport-kpi-label">points de contrôle</div>
        <div class="rapport-kpi-sublabel">zones principales de l'appareil</div>
      </div>
      <div class="rapport-kpi-card">
        <div class="rapport-kpi-icon"><i class="fas fa-user-check"></i></div>
        <div class="rapport-kpi-value">${agentSet.size || '—'}</div>
        <div class="rapport-kpi-label">contrôleurs</div>
        <div class="rapport-kpi-sublabel">agents ayant effectué des contrôles ${type}</div>
      </div>
    `;

    // ---- Section 03 : Performance globale ----
    renderPerformanceGlobale(type, vols, controles);

    // ---- Section 04 : Conformité par zone ----
    renderZoneConformite(type, controles);

    // ---- Section 05 : Top points NC ----
    renderTopPoints(type, controles);

    // ---- Section 06 : Typologie des défauts ----
    renderTypologieDefauts(type, controles);

    // ---- Section 07 : Évolution mensuelle ----
    renderEvolutionMensuelle(type, vols, controles);

    // ---- Section 08 : Activité des contrôleurs ----
    renderActiviteControleurs(type, vols, controles, profiles);

    // ---- Section 09 : Partie Client ----
    renderPartieClient(type, vols, controles);

    // ---- Timestamp actualisation ----
    if (refreshIcon) refreshIcon.classList.remove('spin');
    if (lastUpdatedEl) {
      const now = new Date();
      lastUpdatedEl.textContent = `Mis à jour à ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    }

  } catch (err) {
    if (refreshIcon) refreshIcon.classList.remove('spin');
    kpiGrid.innerHTML = '<div class="empty-state error">Erreur de chargement.</div>';
    console.error(err);
  }
}

function renderPerformanceGlobale(type, vols, controles) {
  const isMP = type === 'MP';
  const perfGrid   = document.getElementById(isMP ? 'mpPerfGrid'    : 'gpPerfGrid');
  const lectureDiv = document.getElementById(isMP ? 'mpLectureCard' : 'gpLectureCard');
  if (!perfGrid || !lectureDiv) return;

  if (!controles.length) {
    perfGrid.innerHTML   = '<div class="empty-state">Aucune donnée de contrôle disponible.</div>';
    lectureDiv.innerHTML = '';
    return;
  }

  // ---- Calculs ----
  const C  = controles.filter(c => c.conformite === 'C').length;
  const NC = controles.filter(c => c.conformite === 'NC').length;
  const total = C + NC;
  const taux = total > 0 ? (C / total * 100) : 0;
  const tauxStr = taux.toFixed(2);

  // NC par vol (pour inspections avec/sans écart)
  const ncPerVol = {};
  controles.forEach(c => {
    if (c.conformite === 'NC') ncPerVol[c.vol_id] = (ncPerVol[c.vol_id] || 0) + 1;
  });
  const totalVols   = vols.length;
  const volsAvec    = Object.keys(ncPerVol).length;
  const volsSans    = totalVols - volsAvec;
  const pctSans     = totalVols > 0 ? (volsSans / totalVols * 100).toFixed(1) : '0';
  const pctAvec     = totalVols > 0 ? (volsAvec / totalVols * 100).toFixed(1) : '0';

  // ---- Cartes colorées ----
  perfGrid.innerHTML = `
    <div class="rapport-perf-card perf-red">
      <i class="fas fa-circle-check perf-icon"></i>
      <div class="perf-value">${tauxStr} %</div>
      <div class="perf-label">Taux de conformité global</div>
      <div class="perf-sub">${C.toLocaleString('fr-FR')} points C / ${total.toLocaleString('fr-FR')} évalués</div>
    </div>
    <div class="rapport-perf-card perf-green">
      <i class="fas fa-star perf-icon"></i>
      <div class="perf-value">${pctSans} %</div>
      <div class="perf-label">Inspections 100&nbsp;% conformes</div>
      <div class="perf-sub">${volsSans.toLocaleString('fr-FR')} vols sans aucun écart</div>
    </div>
    <div class="rapport-perf-card perf-amber">
      <i class="fas fa-triangle-exclamation perf-icon"></i>
      <div class="perf-value">${volsAvec.toLocaleString('fr-FR')}</div>
      <div class="perf-label">Inspections avec &ge; 1 écart</div>
      <div class="perf-sub">soit ${pctAvec} % des contrôles</div>
    </div>
    <div class="rapport-perf-card perf-dark">
      <i class="fas fa-circle-xmark perf-icon"></i>
      <div class="perf-value">${NC.toLocaleString('fr-FR')}</div>
      <div class="perf-label">Non-conformités relevées</div>
      <div class="perf-sub">tous points et zones confondus</div>
    </div>
  `;

  // ---- Lecture auto ----
  const t = parseFloat(tauxStr);
  let titre, texte;
  if (t >= 98) {
    titre = `Un niveau de propreté excellent et maîtrisé.`;
    texte  = `Avec ${tauxStr} % de conformité et ${pctSans} % des vols sans aucun écart, la qualité de préparation cabine ${type} est très haute. Les ${NC.toLocaleString('fr-FR')} écarts relevés restent marginaux et localisés. L’enjeu porte désormais sur la constance des équipes et l’élimination des derniers points récurrents.`;
  } else if (t >= 90) {
    titre = `Un niveau de propreté élevé et maîtrisé.`;
    texte  = `Avec ${tauxStr} % de conformité et ${pctSans} % des vols sans aucun écart, la qualité de préparation cabine est globalement très bonne. Les ${NC.toLocaleString('fr-FR')} écarts détectés restent localisés sur un nombre limité de points et n’affectent pas l’impression générale à l’embarquement. L’enjeu se situe désormais sur la régularité des zones les plus fréquemment non-conformes.`;
  } else if (t >= 80) {
    titre = `Un niveau de propreté satisfaisant avec des marges d’amélioration.`;
    texte  = `Avec ${tauxStr} % de conformité, des actions ciblées sont nécessaires sur les zones à fort taux de NC. Les ${NC.toLocaleString('fr-FR')} écarts relevés indiquent des points récurrents à traiter en priorité. ${pctAvec} % des vols présentent au moins un écart, ce qui nécessite un suivi renforcé des équipes.`;
  } else {
    titre = `Un niveau de propreté à améliorer significativement.`;
    texte  = `Avec ${tauxStr} % de conformité, un plan d’action correctif est requis. Les ${NC.toLocaleString('fr-FR')} non-conformités relevées sur ${pctAvec} % des contrôles nécessitent une attention urgente sur plusieurs zones de l’appareil.`;
  }

  lectureDiv.innerHTML = `
    <div class="rapport-lecture-card">
      <div class="rapport-lecture-title">Lecture de la performance</div>
      <p><strong>${titre}</strong></p>
      <p>${texte}</p>
    </div>
  `;
}

// ---- Typologie des défauts (section 06) ----

const TYPO_CATEGORIES = [
  { key: 'nettoyage',  label: 'Nettoyage mal réalisé',    icon: 'fa-screwdriver-wrench', color: '#c8102e' },
  { key: 'miettes',    label: 'Miettes / résidus sièges', icon: 'fa-chair',              color: '#e57282' },
  { key: 'aspiration', label: 'Aspiration moquette',      icon: 'fa-broom',              color: '#f4a5ad' },
  { key: 'odeurs',     label: 'Mauvaises odeurs',         icon: 'fa-wind',               color: '#9ca3af' },
  { key: 'dechets',    label: 'Déchets visibles',         icon: 'fa-trash',              color: '#cbd5e1' },
  { key: 'taches',     label: 'Taches / traces',          icon: 'fa-droplet',            color: '#e2e8f0' },
  { key: 'autres',     label: 'Autres',                   icon: 'fa-ellipsis',           color: '#c8960c' },
];

function classifyRemarque(remarque) {
  if (!remarque) return 'autres';
  const r = remarque.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/mal fait|mal nettoye|a refaire|refaire|mal realise|bacle|insuffisant|non fait|pas nettoye|nettoyage|non realise|a redo/.test(r)) return 'nettoyage';
  if (/miette|residu|siege sale|dossier sale|accoudoir/.test(r)) return 'miettes';
  if (/moquette|aspir|tapis/.test(r)) return 'aspiration';
  if (/odeur|senteur|puanteur/.test(r)) return 'odeurs';
  if (/dechet|ordure|papier|gobelet|bouteille|debris/.test(r)) return 'dechets';
  if (/tache|trace|salissure/.test(r)) return 'taches';
  return 'autres';
}

function buildDonutSVG(segments) {
  const cx = 110, cy = 110, R = 95, ri = 55;
  const total = segments.reduce((s, g) => s + g.count, 0);
  if (total === 0) return `<svg viewBox="0 0 220 220" width="220" height="220"><circle cx="${cx}" cy="${cy}" r="${R}" fill="#e2e8f0"/><circle cx="${cx}" cy="${cy}" r="${ri}" fill="#f8fafc"/></svg>`;

  const gap = 0.025;
  let angle = -Math.PI / 2;

  const paths = segments
    .filter(s => s.count > 0)
    .map(s => {
      const sweep = (s.count / total) * 2 * Math.PI - gap;
      if (sweep <= 0) return '';
      const x1  = cx + R  * Math.cos(angle),         y1  = cy + R  * Math.sin(angle);
      const x2  = cx + R  * Math.cos(angle + sweep),  y2  = cy + R  * Math.sin(angle + sweep);
      const xi1 = cx + ri * Math.cos(angle + sweep),  yi1 = cy + ri * Math.sin(angle + sweep);
      const xi2 = cx + ri * Math.cos(angle),          yi2 = cy + ri * Math.sin(angle);
      const lg  = sweep > Math.PI ? 1 : 0;
      const d   = `M${x1},${y1} A${R},${R},0,${lg},1,${x2},${y2} L${xi1},${yi1} A${ri},${ri},0,${lg},0,${xi2},${yi2} Z`;
      angle += sweep + gap;
      return `<path d="${d}" fill="${s.color}"/>`;
    });

  return `<svg viewBox="0 0 220 220" width="220" height="220">${paths.join('')}</svg>`;
}

function renderTypologieDefauts(type, controles) {
  const isMP = type === 'MP';
  const container = document.getElementById(isMP ? 'mpTypologie' : 'gpTypologie');
  if (!container) return;

  const ncRows = controles.filter(c => c.conformite === 'NC');
  if (!ncRows.length) {
    container.innerHTML = '<div class="empty-state">Aucune non-conformité relevée.</div>';
    return;
  }

  // Count by category
  const counts = {};
  TYPO_CATEGORIES.forEach(cat => { counts[cat.key] = 0; });
  ncRows.forEach(c => {
    const key = classifyRemarque(c.observation);
    counts[key]++;
  });

  const total = ncRows.length;

  const segments = TYPO_CATEGORIES
    .map(cat => ({ ...cat, count: counts[cat.key] || 0 }))
    .sort((a, b) => b.count - a.count);

  const top4 = segments.filter(s => s.count > 0).slice(0, 4);

  const legendHtml = segments.filter(s => s.count > 0).map(s => `
    <span class="typo-legend-item">
      <span class="typo-legend-dot" style="background:${s.color}"></span>${s.label}
    </span>`).join('');

  const cardsHtml = top4.map(s => `
    <div class="typo-card">
      <div class="typo-card-top">
        <i class="fas ${s.icon} typo-card-icon"></i>
        <span class="typo-card-count">${s.count.toLocaleString('fr-FR')}</span>
        <span class="typo-card-pct">${Math.round(s.count / total * 100)}%</span>
      </div>
      <div class="typo-card-label">${s.label}</div>
    </div>`).join('');

  container.innerHTML = `
    <div class="typo-wrap">
      <div class="typo-left">
        <div class="typo-donut-label"><em>Répartition des ${total.toLocaleString('fr-FR')} remarques</em></div>
        <div class="typo-donut">${buildDonutSVG(segments)}</div>
        <div class="typo-legend">${legendHtml}</div>
      </div>
      <div class="typo-right">
        <div class="typo-cards-grid">${cardsHtml}</div>
        <div class="typo-note">
          <p><strong>« Nettoyage mal réalisé »</strong> : remarques génériques (« mal fait », « mal nettoyé », « à refaire ») signalant un point bâclé, sans défaut physique précis.</p>
          <p style="margin-top:.5rem;"><strong>Lecture :</strong> les écarts portent surtout sur la finition (aspiration, miettes, sièges) — corrigeables par un contrôle final renforcé.</p>
        </div>
      </div>
    </div>
  `;
}

// ---- Évolution mensuelle (section 07) ----

const MONTH_LABELS = ['Janv.','Févr.','Mars','Avril','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'];

function buildEvolBarSVG(data) {
  const W = 620, H = 230, padL = 50, padR = 20, padT = 30, padB = 45;
  const cW = W - padL - padR, cH = H - padT - padB;
  const maxVal = Math.max(...data.map(d => d.insp), 1);
  const yMax = Math.ceil(maxVal * 1.2 / 100) * 100 || 100;
  const rawStep = yMax / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const yStep = Math.ceil(rawStep / mag) * mag;
  const ticks = [];
  for (let v = 0; v <= yMax + 0.01; v += yStep) ticks.push(Math.round(v));

  const yTickHtml = ticks.map(v => {
    const y = padT + cH - (v / yMax * cH);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>
            <text x="${padL - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#94a3b8">${v}</text>`;
  }).join('');

  const n = data.length;
  const slotW = cW / Math.max(n, 1);
  const barW = slotW * 0.55;

  const bars = data.map((d, i) => {
    const x = padL + i * slotW + (slotW - barW) / 2;
    const bH = Math.max((d.insp / yMax) * cH, 1);
    const y = padT + cH - bH;
    const lbl = d.label;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" fill="#e57282" rx="3"/>
            <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" fill="#475569" font-weight="600">${d.insp.toLocaleString('fr-FR')}</text>
            <text x="${(x + barW / 2).toFixed(1)}" y="${(padT + cH + 22).toFixed(1)}" text-anchor="middle" font-size="11" fill="#334155" font-weight="${d.partial ? '700' : '400'}">${lbl}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
    ${yTickHtml}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + cH}" stroke="#cbd5e1"/>
    <line x1="${padL}" y1="${padT + cH}" x2="${W - padR}" y2="${padT + cH}" stroke="#cbd5e1"/>
    ${bars}
  </svg>`;
}

function buildEvolLineSVG(data) {
  const W = 620, H = 200, padL = 55, padR = 20, padT = 25, padB = 45;
  const cW = W - padL - padR, cH = H - padT - padB;
  const valid = data.filter(d => d.taux !== null);
  if (!valid.length) return '';

  const minT = Math.min(...valid.map(d => d.taux));
  const yMin = Math.max(0, Math.floor((minT - 0.3) * 10) / 10);
  const yMax = 100, yRange = yMax - yMin;

  const rawStep = yRange / 5;
  const yStep = rawStep <= 0.2 ? 0.2 : rawStep <= 0.5 ? 0.5 : rawStep <= 1 ? 0.5 : 1;
  const ticks = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 0.001; v += yStep) {
    ticks.push(parseFloat(v.toFixed(1)));
  }

  const getX = i => padL + i * (cW / Math.max(data.length - 1, 1));
  const getY = v => v === null ? null : padT + cH - ((v - yMin) / yRange * cH);

  const yTickHtml = ticks.map(v => {
    const y = getY(v);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>
            <text x="${padL - 5}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#94a3b8">${v}</text>`;
  }).join('');

  const pts = data.map((d, i) => {
    const y = getY(d.taux);
    return y !== null ? `${getX(i).toFixed(1)},${y.toFixed(1)}` : null;
  }).filter(Boolean).join(' ');

  const dots = data.map((d, i) => {
    const y = getY(d.taux);
    if (y === null) return '';
    const x = getX(i);
    const above = y < 18;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#c8102e" stroke="#fff" stroke-width="2"/>
            <text x="${x.toFixed(1)}" y="${(above ? y + 16 : y - 9).toFixed(1)}" text-anchor="middle" font-size="10" fill="#c8102e" font-weight="700">${d.taux.toFixed(2)}%</text>
            <text x="${x.toFixed(1)}" y="${(padT + cH + 22).toFixed(1)}" text-anchor="middle" font-size="11" fill="#334155">${d.label}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
    ${yTickHtml}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + cH}" stroke="#cbd5e1"/>
    <line x1="${padL}" y1="${padT + cH}" x2="${W - padR}" y2="${padT + cH}" stroke="#cbd5e1"/>
    ${pts ? `<polyline points="${pts}" fill="none" stroke="#c8102e" stroke-width="2.5" stroke-linejoin="round"/>` : ''}
    ${dots}
  </svg>`;
}

function renderEvolutionMensuelle(type, vols, controles) {
  const isMP = type === 'MP';
  const container = document.getElementById(isMP ? 'mpEvolution' : 'gpEvolution');
  if (!container) return;

  if (!vols.length || !controles.length) {
    container.innerHTML = '<div class="empty-state">Aucune donnée disponible.</div>';
    return;
  }

  // Map vol_id → YYYY-MM
  const volToMonth = {};
  vols.forEach(v => { if (v.date_vol) volToMonth[v.id] = v.date_vol.slice(0, 7); });

  // Aggregate by month
  const byMonth = {};
  controles.forEach(c => {
    const m = volToMonth[c.vol_id];
    if (!m) return;
    if (!byMonth[m]) byMonth[m] = { vols: new Set(), C: 0, NC: 0 };
    byMonth[m].vols.add(c.vol_id);
    if (c.conformite === 'C') byMonth[m].C++;
    else if (c.conformite === 'NC') byMonth[m].NC++;
  });

  const todayM = new Date().toISOString().slice(0, 7);
  const data = Object.keys(byMonth).sort().map(m => {
    const d = byMonth[m];
    const total = d.C + d.NC;
    const mon = parseInt(m.split('-')[1]) - 1;
    const year = m.split('-')[0];
    const partial = m === todayM;
    return {
      month: m, year,
      label: MONTH_LABELS[mon] + (partial ? '*' : ''),
      insp: d.vols.size,
      taux: total > 0 ? d.C / total * 100 : null,
      partial
    };
  });

  if (!data.length) {
    container.innerHTML = '<div class="empty-state">Aucune donnée mensuelle.</div>';
    return;
  }

  // Trend cards
  const firstT = data.find(d => d.taux !== null)?.taux;
  const lastT  = [...data].reverse().find(d => d.taux !== null)?.taux;
  const maxInsp = Math.max(...data.map(d => d.insp));
  const peakM   = data.find(d => d.insp === maxInsp);

  const inspUp  = data.length > 1 && data[data.length - 1].insp >= data[0].insp;
  const tauxDown = firstT !== null && lastT !== null && lastT < firstT;

  const actCard = `<div class="evol-card evol-card-trend">
    <div class="evol-card-header">
      <i class="fas ${inspUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} evol-card-icon"></i>
      <strong>Activité ${inspUp ? 'en hausse' : 'en baisse'}</strong>
    </div>
    <p class="evol-card-text">Le volume de contrôles ${inspUp
      ? `a progressé jusqu'à ${peakM?.label?.replace('*','')} (pic à ${maxInsp.toLocaleString('fr-FR')}), traduisant une montée en charge du dispositif.`
      : `a diminué sur la période. À ${data[data.length-1].label?.replace('*','')} : ${data[data.length-1].insp.toLocaleString('fr-FR')} inspections.`}</p>
  </div>`;

  const vigilCard = firstT !== null && lastT !== null ? `<div class="evol-card ${tauxDown ? 'evol-card-vigil' : 'evol-card-ok'}">
    <div class="evol-card-header">
      <i class="fas ${tauxDown ? 'fa-triangle-exclamation' : 'fa-circle-check'} evol-card-icon"></i>
      <strong>${tauxDown ? 'Vigilance' : 'Conformité stable'}</strong>
    </div>
    <p class="evol-card-text">${tauxDown
      ? `Léger recul du taux de conformité (${firstT.toFixed(2)} % → ${lastT.toFixed(2)} %) à mesure que les volumes augmentent : à surveiller.`
      : `Le taux de conformité est resté stable ou en progression (${firstT.toFixed(2)} % → ${lastT.toFixed(2)} %).`}</p>
  </div>` : '';

  const partial = data.find(d => d.partial);
  const partialNote = partial ? `<div class="evol-note">
    <strong style="color:#c8102e;">* ${MONTH_LABELS[parseInt(partial.month.split('-')[1])-1]} ${partial.year}</strong><br>
    Mois partiel — données arrêtées au ${new Date().getDate()} ${MONTH_LABELS[parseInt(partial.month.split('-')[1])-1].replace('.','').toLowerCase()} (${partial.insp.toLocaleString('fr-FR')} inspections). À interpréter avec prudence.
  </div>` : '';

  container.innerHTML = `
    <div class="evol-wrap">
      <div class="evol-left">
        <div class="evol-chart-label"><em>Inspections réalisées par mois</em></div>
        ${buildEvolBarSVG(data)}
        <div class="evol-chart-label" style="margin-top:1.25rem;"><em>Taux de conformité par mois (%)</em></div>
        ${buildEvolLineSVG(data)}
      </div>
      <div class="evol-right">
        ${actCard}
        ${vigilCard}
        ${partialNote}
      </div>
    </div>`;
}

// ---- Activité des contrôleurs (section 08) ----

function renderActiviteControleurs(type, vols, controles, profiles) {
  const isMP = type === 'MP';
  const container = document.getElementById(isMP ? 'mpControleurs' : 'gpControleurs');
  if (!container) return;

  if (!vols.length) {
    container.innerHTML = '<div class="empty-state">Aucune donnée disponible.</div>';
    return;
  }

  // Map
  const agentName = {};
  profiles.forEach(p => { agentName[p.id] = p.nom; });
  const volAgent = {};
  vols.forEach(v => { volAgent[v.id] = v.agent_id; });

  // Aggregate per agent
  const stats = {};
  let unidentified = 0;
  controles.forEach(c => {
    const aid = volAgent[c.vol_id];
    if (!aid) { unidentified++; return; }
    if (!stats[aid]) stats[aid] = { nom: agentName[aid] || aid, vols: new Set(), C: 0, NC: 0 };
    stats[aid].vols.add(c.vol_id);
    if (c.conformite === 'C') stats[aid].C++;
    else if (c.conformite === 'NC') stats[aid].NC++;
  });

  const rows = Object.values(stats)
    .map(s => {
      const total = s.C + s.NC;
      const taux = total > 0 ? s.C / total * 100 : null;
      return { nom: s.nom, insp: s.vols.size, NC: s.NC, taux };
    })
    .sort((a, b) => b.insp - a.insp);

  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">Aucun contrôleur identifié.</div>';
    return;
  }

  const tauxColor = t => t === null ? '#94a3b8' : t >= 99.5 ? '#16a34a' : t >= 99 ? '#b45309' : '#c8102e';

  const tableRows = rows.map(r => `
    <tr>
      <td><strong>${r.nom}</strong></td>
      <td>${r.insp.toLocaleString('fr-FR')}</td>
      <td>${r.NC.toLocaleString('fr-FR')}</td>
      <td style="color:${tauxColor(r.taux)};font-weight:700;">${r.taux !== null ? r.taux.toFixed(2) + ' %' : '—'}</td>
    </tr>`).join('');

  const top = rows[0];
  const footnote = `${rows.length} contrôleur${rows.length > 1 ? 's' : ''} actif${rows.length > 1 ? 's' : ''}${unidentified > 0 ? ` · ${unidentified} saisies non identifiées exclues` : ' · toutes les saisies identifiées'}`;

  container.innerHTML = `
    <div class="ctrl-wrap">
      <div class="ctrl-left">
        <table class="ctrl-table">
          <thead>
            <tr>
              <th>Contrôleur</th>
              <th>Inspections</th>
              <th>NC détectées</th>
              <th>Taux de conformité</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="ctrl-footnote">${footnote}</div>
      </div>
      <div class="ctrl-right">
        <div class="ctrl-lecture-card">
          <div class="ctrl-lecture-header">
            <i class="fas fa-user-check ctrl-lecture-icon"></i>
            <strong>Lecture</strong>
          </div>
          <p class="ctrl-lecture-highlight">Le volume de NC reflète à la fois la qualité du nettoyage et la rigueur du contrôle.</p>
          <p class="ctrl-lecture-text">Un nombre élevé de NC détectées (ex.&nbsp;${top.nom}, ${top.insp.toLocaleString('fr-FR')} inspections) traduit surtout une activité et une exigence de contrôle importantes, pas nécessairement une cabine plus sale.</p>
          <p class="ctrl-lecture-text" style="margin-top:.6rem;">Recommandation : harmoniser les critères d'évaluation entre contrôleurs pour fiabiliser la comparaison.</p>
        </div>
      </div>
    </div>`;
}

function buildAbsXTicks(maxVal) {
  if (maxVal === 0) return '';
  const rawStep = maxVal / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  const maxTick = Math.ceil(maxVal / step) * step;
  const ticks = [];
  for (let v = 0; v <= maxTick + 0.001; v += step) ticks.push(Math.round(v));
  return ticks.map(v => {
    const pos = (v / maxTick * 100).toFixed(2);
    return `<span class="zone-xtick" style="left:${pos}%">${v}</span>`;
  }).join('');
}

function renderTopPoints(type, controles) {
  const isMP = type === 'MP';
  const container = document.getElementById(isMP ? 'mpTopPoints' : 'gpTopPoints');
  if (!container) return;

  const ncControles = controles.filter(c => c.point_controle);
  if (!ncControles.length) {
    container.innerHTML = '<div class="empty-state">Aucune donnée de point de contrôle disponible.</div>';
    return;
  }

  // Stats per point
  const pointStats = {};
  ncControles.forEach(c => {
    if (!pointStats[c.point_controle]) pointStats[c.point_controle] = { C: 0, NC: 0 };
    if (c.conformite === 'C') pointStats[c.point_controle].C++;
    else if (c.conformite === 'NC') pointStats[c.point_controle].NC++;
  });

  const sorted = Object.entries(pointStats)
    .map(([point, s]) => {
      const total = s.C + s.NC;
      return { point, C: s.C, NC: s.NC, total, taux: total > 0 ? s.NC / total * 100 : 0 };
    })
    .filter(d => d.NC > 0)
    .sort((a, b) => b.NC - a.NC);

  if (!sorted.length) {
    container.innerHTML = '<div class="empty-state">Aucune non-conformité relevée.</div>';
    return;
  }

  const top8 = sorted.slice(0, 8);
  const maxNC = top8[0].NC;
  const totalNC = sorted.reduce((s, d) => s + d.NC, 0);

  // Hero card: top 2 combined
  const top2NC  = (sorted[0]?.NC || 0) + (sorted[1]?.NC || 0);
  const top2Pct = totalNC > 0 ? Math.round(top2NC / totalNC * 100) : 0;
  const top2Desc = sorted[1]
    ? `écarts sur « ${sorted[0].point} » + « ${sorted[1].point} »`
    : `écarts sur « ${sorted[0].point} »`;

  const barsHtml = top8.map(d => {
    const pct = (d.NC / maxNC * 100).toFixed(2);
    return `
      <div class="zone-bar-row">
        <div class="zone-bar-label">${d.point}</div>
        <div class="zone-bar-track">
          <div class="zone-bar-fill" style="width:${pct}%"></div>
          <span class="zone-bar-value">${d.NC.toLocaleString('fr-FR')}</span>
        </div>
      </div>`;
  }).join('');

  const tauxRows = sorted.slice(0, 5).map(d => `
    <div class="top-nc-taux-row">
      <span class="top-nc-taux-point">${d.point}</span>
      <span class="top-nc-taux-val">${d.taux.toFixed(2)} %</span>
    </div>`).join('');

  container.innerHTML = `
    <div class="zone-chart-wrap">
      <div class="zone-chart-left">
        <div class="zone-chart-axis-label"><em>Nombre de non-conformités par point de contrôle</em></div>
        <div class="zone-bars">${barsHtml}</div>
        <div class="zone-chart-xaxis">
          <div class="zone-chart-xaxis-inner">${buildAbsXTicks(maxNC)}</div>
        </div>
      </div>
      <div class="zone-chart-right">
        <div class="top-nc-hero-card">
          <i class="fas fa-broom top-nc-hero-icon"></i>
          <div class="top-nc-hero-value">${top2NC.toLocaleString('fr-FR')}</div>
          <div class="top-nc-hero-label">${top2Desc}</div>
          <div class="top-nc-hero-sub">soit ${top2Pct}&nbsp;% de toutes les NC</div>
        </div>
        <div class="top-nc-taux-card">
          <div class="top-nc-taux-title">Taux de NC par point</div>
          ${tauxRows}
        </div>
      </div>
    </div>
  `;
}

function buildZoneXTicks(xMin) {
  const range = 100 - xMin;
  const step = range <= 5 ? 0.5 : range <= 10 ? 1 : 2;
  const ticks = [];
  for (let v = xMin; v <= 100.001; v += step) {
    ticks.push(parseFloat(v.toFixed(1)));
  }
  return ticks.map(v => {
    const pos = ((v - xMin) / (100 - xMin) * 100).toFixed(2);
    return `<span class="zone-xtick" style="left:${pos}%">${v}</span>`;
  }).join('');
}

function renderZoneConformite(type, controles) {
  const isMP = type === 'MP';
  const container = document.getElementById(isMP ? 'mpZoneChart' : 'gpZoneChart');
  if (!container) return;

  if (!controles.length) {
    container.innerHTML = '<div class="empty-state">Aucune donnée disponible.</div>';
    return;
  }

  const zoneOrder = isMP
    ? ['Cockpit', 'Cabine', 'Toilettes', 'Galley', 'Client']
    : ['Cockpit', 'Cabine', 'Cabine ECO', 'Premium Economy', 'CRC', 'Toilettes', 'Galley', 'Client'];

  const zoneLabels = {
    'Cockpit':           'Cockpit',
    'Cabine':            'Cabine / Sièges',
    'Cabine ECO':        'Cabine ECO',
    'Premium Economy':   'Premium Economy',
    'CRC':               'Crew Rest (CRC)',
    'Toilettes':         'Toilettes',
    'Galley':            'Galley / Office',
    'Client':            'Contrôle final',
  };

  const zoneStats = {};
  controles.forEach(c => {
    if (!zoneStats[c.zone]) zoneStats[c.zone] = { C: 0, NC: 0 };
    if (c.conformite === 'C') zoneStats[c.zone].C++;
    else if (c.conformite === 'NC') zoneStats[c.zone].NC++;
  });

  const zoneData = zoneOrder
    .map(z => {
      const s = zoneStats[z] || { C: 0, NC: 0 };
      const total = s.C + s.NC;
      const taux = total > 0 ? s.C / total * 100 : null;
      return { zone: z, label: zoneLabels[z] || z, C: s.C, NC: s.NC, total, taux };
    })
    .filter(d => d.total > 0);

  if (!zoneData.length) {
    container.innerHTML = '<div class="empty-state">Aucune donnée de zone disponible.</div>';
    return;
  }

  const validTaux = zoneData.map(d => d.taux).filter(t => t !== null);
  const minTaux = Math.min(...validTaux);
  const xMin = Math.max(0, Math.floor(minTaux) - 1);

  const totalNC = zoneData.reduce((s, d) => s + d.NC, 0);
  const ncDist  = [...zoneData].sort((a, b) => b.NC - a.NC).filter(d => d.NC > 0);

  // Bar chart rows — sorted worst→best (ascending taux) for visual impact
  const barRows = [...zoneData].sort((a, b) => (a.taux ?? 0) - (b.taux ?? 0));

  const barsHtml = barRows.map(d => {
    if (d.taux === null) return '';
    const pct = ((d.taux - xMin) / (100 - xMin) * 100).toFixed(2);
    return `
      <div class="zone-bar-row">
        <div class="zone-bar-label">${d.label}</div>
        <div class="zone-bar-track">
          <div class="zone-bar-fill" style="width:${pct}%"></div>
          <span class="zone-bar-value">${d.taux.toFixed(2)}%</span>
        </div>
      </div>`;
  }).join('');

  const ncCardsHtml = totalNC > 0
    ? ncDist.map(d => {
        const pct = Math.round(d.NC / totalNC * 100);
        return `
          <div class="zone-nc-card">
            <div class="zone-nc-card-top">
              <strong>${d.label}</strong>
              <span class="zone-nc-pct">${pct}%</span>
            </div>
            <div class="zone-nc-count">${d.NC.toLocaleString('fr-FR')} NC</div>
            <div class="zone-nc-bar-track">
              <div class="zone-nc-bar-fill" style="width:${pct}%"></div>
            </div>
          </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:1rem 0;">Aucune NC relevée</div>`;

  const retenirHtml = totalNC > 0 && ncDist[0]
    ? `<div class="zone-nc-retenir">À retenir : la zone <strong>${ncDist[0].label}</strong> concentre ${Math.round(ncDist[0].NC / totalNC * 100)} % de tous les écarts (${ncDist[0].NC.toLocaleString('fr-FR')} NC) — c'est le levier prioritaire.</div>`
    : '';

  container.innerHTML = `
    <div class="zone-chart-wrap">
      <div class="zone-chart-left">
        <div class="zone-chart-axis-label"><em>Taux de conformité par zone (%)</em></div>
        <div class="zone-bars">${barsHtml}</div>
        <div class="zone-chart-xaxis">
          <div class="zone-chart-xaxis-inner">${buildZoneXTicks(xMin)}</div>
        </div>
        <div class="zone-chart-footnote">
          <i class="fas fa-eye" style="color:#e31837;"></i>
          <em>&laquo;&nbsp;Contrôle final&nbsp;&raquo; = aspect client : vérification d'ensemble côté passager avant embarquement.</em>
        </div>
      </div>
      <div class="zone-chart-right">
        <div class="zone-nc-title">Répartition des non-conformités</div>
        ${ncCardsHtml}
        ${retenirHtml}
      </div>
    </div>
  `;
}

// ---- Section 09 : Partie Client ----

function renderPartieClient(type, vols, controles) {
  const isMP = type === 'MP';
  const container = document.getElementById(isMP ? 'mpPartieClient' : 'gpPartieClient');
  if (!container) return;

  const clientControles = controles.filter(c => c.zone === 'Client');

  if (!clientControles.length) {
    container.innerHTML = '<div class="empty-state">Aucune donnée de la partie Client disponible.</div>';
    return;
  }

  // ---- KPI calculs ----
  const C  = clientControles.filter(c => c.conformite === 'C').length;
  const NC = clientControles.filter(c => c.conformite === 'NC').length;
  const total = C + NC;
  const taux = total > 0 ? C / total * 100 : 0;
  const tauxStr = taux.toFixed(2);

  // Vols avec/sans NC client
  const ncVolSet = new Set(clientControles.filter(c => c.conformite === 'NC').map(c => c.vol_id));
  const volIds = [...new Set(clientControles.map(c => c.vol_id))];
  const volsAvecNC = ncVolSet.size;
  const volsSansNC = volIds.length - volsAvecNC;
  const pctSans = volIds.length > 0 ? (volsSansNC / volIds.length * 100).toFixed(1) : '0';

  // Score badge
  const scoreBadge = taux >= 98 ? { label: 'Excellent', color: '#16a34a', bg: '#dcfce7' }
    : taux >= 90 ? { label: 'Bon', color: '#2563eb', bg: '#dbeafe' }
    : taux >= 80 ? { label: 'Passable', color: '#d97706', bg: '#fef3c7' }
    : { label: 'À améliorer', color: '#dc2626', bg: '#fee2e2' };

  // ---- Stats par point ----
  const pointStats = {};
  clientControles.forEach(c => {
    if (!c.point_controle) return;
    if (!pointStats[c.point_controle]) pointStats[c.point_controle] = { C: 0, NC: 0 };
    if (c.conformite === 'C') pointStats[c.point_controle].C++;
    else if (c.conformite === 'NC') pointStats[c.point_controle].NC++;
  });

  const pointList = Object.entries(pointStats)
    .map(([pt, s]) => {
      const t = s.C + s.NC;
      return { point: pt, C: s.C, NC: s.NC, total: t, tauxNC: t > 0 ? s.NC / t * 100 : 0, tauxC: t > 0 ? s.C / t * 100 : 0 };
    })
    .sort((a, b) => b.tauxNC - a.tauxNC);

  const maxNC = Math.max(...pointList.map(p => p.NC), 1);

  const barsHtml = pointList.map(d => {
    const fillPct = (d.NC / maxNC * 100).toFixed(1);
    const conformPct = d.tauxC.toFixed(1);
    const ncPct = d.tauxNC.toFixed(1);
    const barColor = d.tauxNC === 0 ? '#16a34a' : d.tauxNC < 5 ? '#f59e0b' : '#dc2626';
    return `
      <div class="client-point-row">
        <div class="client-point-label">${d.point}</div>
        <div class="client-point-bars">
          <div class="client-point-track">
            <div class="client-point-fill" style="width:${fillPct}%;background:${barColor};"></div>
          </div>
          <span class="client-point-nc">${d.NC > 0 ? d.NC + ' NC' : '—'}</span>
          <span class="client-point-taux" style="color:${barColor};">${d.NC > 0 ? ncPct + '% NC' : '✓ 100%'}</span>
        </div>
      </div>`;
  }).join('');

  // ---- Lecture auto ----
  const worstPoint = pointList[0];
  let lectureTitre, lectureTexte;
  if (taux >= 98) {
    lectureTitre = 'Expérience client excellente.';
    lectureTexte = `Avec ${tauxStr} % de conformité sur la partie Client, la propreté perçue par les passagers est très satisfaisante. ${pctSans} % des vols présentent une zone Client 100 % conforme.${worstPoint?.NC > 0 ? ` Le point « ${worstPoint.point} » reste le seul à surveiller (${worstPoint.NC} NC).` : ''}`;
  } else if (taux >= 90) {
    lectureTitre = 'Bonne qualité perçue côté passager.';
    lectureTexte = `Le taux de conformité Client est de ${tauxStr} %. Les passagers trouvent généralement la cabine en bon état à l'embarquement. ${volsAvecNC > 0 ? `${volsAvecNC} vol${volsAvecNC > 1 ? 's' : ''} présentent au moins un point client non conforme.` : ''} Le point le plus fréquemment NC est « ${worstPoint?.point} » (${worstPoint?.NC || 0} NC).`;
  } else if (taux >= 80) {
    lectureTitre = 'Qualité perçue passager à renforcer.';
    lectureTexte = `À ${tauxStr} % de conformité Client, des efforts ciblés sont nécessaires. ${volsAvecNC} vol${volsAvecNC > 1 ? 's' : ''} sur ${volIds.length} présentent des écarts côté passager. Les points « ${pointList.slice(0,2).map(p=>p.point).join(' » et « ')} » concentrent l'essentiel des non-conformités.`;
  } else {
    lectureTitre = 'Expérience client insuffisante — action requise.';
    lectureTexte = `Avec seulement ${tauxStr} % de conformité sur la partie Client, l'image perçue par les passagers est dégradée. ${NC} non-conformités relevées sur ${volsAvecNC} vols (${(100 - parseFloat(pctSans)).toFixed(1)} % des contrôles). Un plan d'action ciblé est indispensable sur les points les plus récurrents.`;
  }

  container.innerHTML = `
    <div class="client-kpi-grid">
      <div class="rapport-perf-card perf-red">
        <i class="fas fa-user-check perf-icon"></i>
        <div class="perf-value">${tauxStr} %</div>
        <div class="perf-label">Taux de conformité Client</div>
        <div class="perf-sub">${C.toLocaleString('fr-FR')} points C / ${total.toLocaleString('fr-FR')} évalués</div>
      </div>
      <div class="rapport-perf-card perf-green">
        <i class="fas fa-face-smile perf-icon"></i>
        <div class="perf-value">${pctSans} %</div>
        <div class="perf-label">Vols 100 % conformes côté client</div>
        <div class="perf-sub">${volsSansNC.toLocaleString('fr-FR')} vols sans aucun écart client</div>
      </div>
      <div class="rapport-perf-card perf-amber">
        <i class="fas fa-face-frown perf-icon"></i>
        <div class="perf-value">${volsAvecNC.toLocaleString('fr-FR')}</div>
        <div class="perf-label">Vols avec ≥ 1 écart client</div>
        <div class="perf-sub">sur ${volIds.length.toLocaleString('fr-FR')} vols évalués</div>
      </div>
      <div class="rapport-perf-card perf-dark" style="background:${scoreBadge.bg};border-left:4px solid ${scoreBadge.color};">
        <i class="fas fa-star perf-icon" style="color:${scoreBadge.color};"></i>
        <div class="perf-value" style="color:${scoreBadge.color};">${scoreBadge.label}</div>
        <div class="perf-label">Score expérience client</div>
        <div class="perf-sub">${NC.toLocaleString('fr-FR')} NC client relevée${NC > 1 ? 's' : ''}</div>
      </div>
    </div>

    <div class="client-points-section">
      <div class="client-points-title">Détail par critère client <em>(du plus NC au moins NC)</em></div>
      <div class="client-points-list">${barsHtml}</div>
    </div>

    <div class="rapport-lecture-card" style="margin-top:1.25rem;">
      <div class="rapport-lecture-title">Lecture de l'expérience client</div>
      <p><strong>${lectureTitre}</strong></p>
      <p>${lectureTexte}</p>
    </div>
  `;
}

// ---- COMPAGNIES ----

async function loadCompagniesView() {
  renderCieList();
  fetchLogoOptions().then(files => {
    const sel = document.getElementById('cieLogo');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Aucun —</option>'
      + files.map(f => `<option value="${f}">${f}</option>`).join('');
  });
  document.getElementById('formAddCie')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addCompagnie();
  });
}

async function fetchLogoOptions() {
  const FALLBACK = ['AF.png','EK.png','EY.png','GF.png','QR.png','rj.png','SV.jpeg','TK.png','ku.png','logoRAM.jpg'];
  try {
    const res = await fetch('/cieslogs/', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const json = await res.json();
      const files = (json.files || [])
        .filter(f => f.type === 'file' && /\.(png|jpe?g|svg|webp)$/i.test(f.name))
        .map(f => f.name)
        .sort((a, b) => a.localeCompare(b));
      if (files.length) return files;
    }
  } catch (_) {}
  return FALLBACK;
}

async function renderCieList() {
  const content = document.getElementById('cieListContent');
  const countEl = document.getElementById('cieCount');
  content.innerHTML = '<div class="loading-state">Chargement…</div>';

  let rows = [];
  if (isDemoMode) {
    rows = [
      { id: '1', code: 'AT', nom: 'Royal Air Maroc', actif: true },
      { id: '2', code: 'AF', nom: 'Air France',      actif: true },
    ];
  } else {
    const { data, error } = await supabase.from('compagnies').select('id, code, nom, logo_url, actif').order('code');
    if (error) { content.innerHTML = `<div class="empty-state">Erreur : ${error.message}</div>`; return; }
    rows = data || [];
  }

  if (countEl) countEl.textContent = `${rows.length} compagnie${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    content.innerHTML = '<div class="empty-state">Aucune compagnie enregistrée.</div>';
    return;
  }

  const LOGO_OPTIONS = await fetchLogoOptions();
  content.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Logo</th><th>Code</th><th>Nom complet</th><th style="text-align:center">Statut</th><th style="text-align:center">Actions</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>
              ${r.logo_url
                ? `<img src="cieslogs/${r.logo_url}" alt="${r.code}" class="cie-table-logo">`
                : `<span class="cie-vol-initials cie-initials-sm">${r.code}</span>`}
            </td>
            <td><span class="cie-code-badge">${r.code}</span></td>
            <td>${r.nom}</td>
            <td style="text-align:center">
              <span class="badge ${r.actif ? 'badge-ok' : 'badge-off'}">${r.actif ? 'Actif' : 'Inactif'}</span>
            </td>
            <td style="text-align:center;white-space:nowrap">
              <select class="cie-logo-select" data-id="${r.id}" title="Changer le logo">
                <option value="">— Logo —</option>
                ${LOGO_OPTIONS.map(f => `<option value="${f}" ${r.logo_url === f ? 'selected' : ''}>${f}</option>`).join('')}
              </select>
              <button class="btn btn-outline btn-xs" onclick="toggleCie('${r.id}', ${r.actif})">
                <i class="fas fa-${r.actif ? 'ban' : 'check'}"></i> ${r.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button class="btn btn-danger btn-xs" style="margin-left:.4rem" onclick="deleteCie('${r.id}', '${r.code}')">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  content.querySelectorAll('.cie-logo-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = sel.dataset.id;
      const logo = sel.value;
      if (!isDemoMode) {
        const { error } = await supabase.from('compagnies').update({ logo_url: logo || null }).eq('id', id);
        if (error) { showToast(error.message, 'error'); return; }
      }
      showToast('Logo mis à jour.', 'success');
      renderCieList();
    });
  });
}

async function addCompagnie() {
  const code  = document.getElementById('cieCode').value.trim().toUpperCase();
  const nom   = document.getElementById('cieNom').value.trim();
  const logo  = document.getElementById('cieLogo')?.value || null;
  const btn   = document.getElementById('btnAddCie');
  if (!code || !nom) return;

  btn.disabled = true;
  if (!isDemoMode) {
    const { error } = await supabase.from('compagnies').insert({ code, nom, logo_url: logo || null, actif: true });
    if (error) {
      showToast(error.message.includes('unique') ? `Le code "${code}" existe déjà.` : error.message, 'error');
      btn.disabled = false; return;
    }
  }
  document.getElementById('cieCode').value  = '';
  document.getElementById('cieNom').value   = '';
  if (document.getElementById('cieLogo')) document.getElementById('cieLogo').value = '';
  btn.disabled = false;
  showToast(`Compagnie "${code}" ajoutée.`, 'success');
  renderCieList();
}

async function toggleCie(id, currentActif) {
  if (!isDemoMode) {
    const { error } = await supabase.from('compagnies').update({ actif: !currentActif }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
  }
  renderCieList();
}

async function deleteCie(id, code) {
  if (!confirm(`Supprimer la compagnie "${code}" ?`)) return;
  if (!isDemoMode) {
    const { error } = await supabase.from('compagnies').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
  }
  showToast(`Compagnie "${code}" supprimée.`, 'success');
  renderCieList();
}

// ---- SUPPRESSION VOL (admin/chef) ----

let adminDeleteVolId = null;

window.adminConfirmDeleteVol = function(volId, numeroVol) {
  if (!['admin','chef'].includes(currentUser?.role)) return;
  adminDeleteVolId = volId;
  document.getElementById('adminDeleteVolNumero').textContent = numeroVol;
  document.getElementById('modalAdminDeleteVol').style.display = 'flex';
};

document.getElementById('btnAnnulerAdminDeleteVol')?.addEventListener('click', () => {
  document.getElementById('modalAdminDeleteVol').style.display = 'none';
  adminDeleteVolId = null;
});

document.getElementById('btnConfirmerAdminDeleteVol')?.addEventListener('click', async () => {
  if (!adminDeleteVolId) return;
  const btn = document.getElementById('btnConfirmerAdminDeleteVol');
  btn.disabled = true;
  btn.textContent = 'Suppression…';

  try {
    const { error } = await supabase
      .from('vols')
      .delete()
      .eq('id', adminDeleteVolId);

    if (error) throw error;

    document.getElementById('modalAdminDeleteVol').style.display = 'none';
    adminDeleteVolId = null;
    showToast('Vol supprimé.', 'success');
    loadTousControles();
  } catch (err) {
    showToast('Erreur lors de la suppression.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Supprimer définitivement';
  }
});

// ---- ÉDITION VOL (admin/chef) ----

let _editVolId = null;
let _editVolFilters = {};

window.adminEditVol = function(volId, numero, date, immat, typeVol, heureDebut, heureFin) {
  if (!['admin','chef'].includes(currentUser?.role)) return;
  _editVolId = volId;
  document.getElementById('editVolNumeroTitle').textContent = numero;
  document.getElementById('editVolNumero').value = numero;
  document.getElementById('editVolDate').value = date;
  document.getElementById('editVolImmat').value = immat;
  document.getElementById('editVolType').value = typeVol;
  document.getElementById('editVolHeureDebut').value = heureDebut;
  document.getElementById('editVolHeureFin').value = heureFin;
  document.getElementById('editVolError').style.display = 'none';
  document.getElementById('modalEditVol').style.display = 'flex';
};

document.getElementById('btnAnnulerEditVol')?.addEventListener('click', () => {
  document.getElementById('modalEditVol').style.display = 'none';
  _editVolId = null;
});

document.getElementById('btnConfirmerEditVol')?.addEventListener('click', async () => {
  if (!_editVolId) return;
  const numero = document.getElementById('editVolNumero').value.trim().toUpperCase();
  const date   = document.getElementById('editVolDate').value.trim();
  const immat  = document.getElementById('editVolImmat').value.trim().toUpperCase();
  const type   = document.getElementById('editVolType').value;
  const debut  = document.getElementById('editVolHeureDebut').value || null;
  const fin    = document.getElementById('editVolHeureFin').value || null;
  const errEl  = document.getElementById('editVolError');

  if (!numero || !date || !type) {
    errEl.textContent = 'N° vol, date et type sont obligatoires.';
    errEl.style.display = 'block';
    return;
  }

  const btn     = document.getElementById('btnConfirmerEditVol');
  const btnText = document.getElementById('btnEditVolText');
  const spinner = document.getElementById('btnEditVolSpinner');
  btn.disabled = true;
  btnText.style.display = 'none';
  spinner.style.display = 'inline';

  try {
    const { error } = await supabase
      .from('vols')
      .update({ numero_vol: numero, date_vol: date, immatriculation: immat, type_vol: type, heure_debut: debut, heure_fin: fin })
      .eq('id', _editVolId);
    if (error) throw error;
    document.getElementById('modalEditVol').style.display = 'none';
    _editVolId = null;
    showToast('Vol modifié avec succès.', 'success');
    loadTousControles();
  } catch (err) {
    errEl.textContent = 'Erreur lors de la modification.';
    errEl.style.display = 'block';
    console.error(err);
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline';
    spinner.style.display = 'none';
  }
});

// ---- SLA & NETTOYAGE ----

// Référentiel OACI par catégorie — TRANSIT
const SLA_CATEGORIES_TRANSIT = [
  { key: 'transit_cat2', label: 'Catégorie II',  seats: '≤ 41 sièges',      avions: ['M81','M87','AR1','CRJ'],            slaMin: 10, slaMax: 12, agents: { cabine: 2,  galley: 1, sanitaire: 1, aspirateur: 0 } },
  { key: 'transit_cat3', label: 'Catégorie III', seats: '42 – 90 sièges',   avions: ['AT7'],                              slaMin: 10, slaMax: 12, agents: { cabine: 2,  galley: 1, sanitaire: 1, aspirateur: 0 } },
  { key: 'transit_cat4', label: 'Catégorie IV',  seats: '91 – 120 sièges',  avions: ['B73G','E190','CRJ1000'],            slaMin: 15, slaMax: 17, agents: { cabine: 5,  galley: 1, sanitaire: 1, aspirateur: 1 } },
  { key: 'transit_cat5', label: 'Catégorie V',   seats: '121 – 200 sièges', avions: ['B738','A321','A320','A319'],        slaMin: 15, slaMax: 17, agents: { cabine: 5,  galley: 1, sanitaire: 1, aspirateur: 1 } },
  { key: 'transit_cat6', label: 'Catégorie VI',  seats: '201 – 350 sièges', avions: ['B787','B767','B777','A330','A340'], slaMin: 30, slaMax: 35, agents: { cabine: 10, galley: 2, sanitaire: 2, aspirateur: 2 } },
  { key: 'transit_cat7', label: 'Catégorie VII', seats: '> 351 sièges',     avions: ['A380','B744'],                     slaMin: 30, slaMax: 35, agents: { cabine: 15, galley: 4, sanitaire: 4, aspirateur: 4 } },
];

// Référentiel OACI par catégorie — STOP CMN (mêmes agents, SLA plus longs)
const SLA_CATEGORIES_STOP = [
  { key: 'stop_cat2', label: 'Catégorie II',  seats: '≤ 41 sièges',      avions: ['M81','M87','AR1','CRJ'],            slaMin: 15, slaMax: 18, agents: { cabine: 2,  galley: 1, sanitaire: 1, aspirateur: 0 } },
  { key: 'stop_cat3', label: 'Catégorie III', seats: '42 – 90 sièges',   avions: ['AT7'],                              slaMin: 15, slaMax: 18, agents: { cabine: 2,  galley: 1, sanitaire: 1, aspirateur: 0 } },
  { key: 'stop_cat4', label: 'Catégorie IV',  seats: '91 – 120 sièges',  avions: ['B73G','E190','CRJ1000'],            slaMin: 25, slaMax: 28, agents: { cabine: 5,  galley: 1, sanitaire: 1, aspirateur: 1 } },
  { key: 'stop_cat5', label: 'Catégorie V',   seats: '121 – 200 sièges', avions: ['B738','A321','A320','A319'],        slaMin: 25, slaMax: 28, agents: { cabine: 5,  galley: 1, sanitaire: 1, aspirateur: 1 } },
  { key: 'stop_cat6', label: 'Catégorie VI',  seats: '201 – 350 sièges', avions: ['B787','B767','B777','A330','A340'], slaMin: 45, slaMax: 50, agents: { cabine: 10, galley: 2, sanitaire: 2, aspirateur: 2 } },
  { key: 'stop_cat7', label: 'Catégorie VII', seats: '> 351 sièges',     avions: ['A380','B744'],                     slaMin: 45, slaMax: 50, agents: { cabine: 15, galley: 4, sanitaire: 4, aspirateur: 4 } },
];

// Mapping type_vol DB → référentiel stats
const SLA_STATS_TYPES = [
  { key: 'Moyen Porteur Transit',  label: 'MP Transit',  filterType: 'transit', defaultSla: 17 },
  { key: 'Gros Porteur Transit',   label: 'GP Transit',  filterType: 'transit', defaultSla: 35 },
  { key: 'Moyen Porteur Stop Cmn', label: 'MP Stop CMN', filterType: 'stop',    defaultSla: 28 },
  { key: 'Gros Porteur Stop Cmn',  label: 'GP Stop CMN', filterType: 'stop',    defaultSla: 50 },
];

let slaConfigCache = {};
let _pendingSlaAnchor = null;

async function loadSlaConfigView() {
  if (!isDemoMode) {
    const { data } = await supabase.from('sla_config').select('*');
    (data || []).forEach(r => { slaConfigCache[r.type_vol] = r; });
  }
  renderSlaConfigGrid(SLA_CATEGORIES_TRANSIT, 'sla_detail_transit', 'Transit');
  renderSlaConfigGrid(SLA_CATEGORIES_STOP,    'sla_detail_stop',    'Stop');
  const btnT = document.getElementById('btnSaveSlaTransit');
  const btnS = document.getElementById('btnSaveSlaStop');
  if (btnT) btnT.onclick = () => saveSlaConfig(SLA_CATEGORIES_TRANSIT, 'sla_detail_transit', 'Transit');
  if (btnS) btnS.onclick = () => saveSlaConfig(SLA_CATEGORIES_STOP,    'sla_detail_stop',    'Stop');
}

const _slaCritere = { Transit: 'temps', Stop: 'temps' };

function loadSlaConformiteView() {
  const anchor = _pendingSlaAnchor;
  _pendingSlaAnchor = null;

  ['Transit', 'Stop'].forEach(S => {
    const type = S === 'Transit' ? 'transit' : 'stop';
    const sel = document.getElementById(`slaStatsMois${S}`);
    if (sel && sel.options.length <= 1) {
      getMonthsList().forEach(({ value, label }) => {
        const o = document.createElement('option'); o.value = value; o.textContent = label; sel.appendChild(o);
      });
    }
    const btn = document.getElementById(`btnSlaStatsRefresh${S}`);
    if (btn) btn.onclick = () => loadSlaStats(type, S, _slaCritere[S]);

    // Wiring pills critère (onclick remplace à chaque visite, pas d'accumulation)
    const pillsBox = document.getElementById(`slaCritere${S}`);
    if (pillsBox) {
      // Synchroniser l'état visuel avec l'état interne
      pillsBox.querySelectorAll('.db-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.critere === _slaCritere[S]);
        p.onclick = () => {
          pillsBox.querySelectorAll('.db-pill').forEach(x => x.classList.remove('active'));
          p.classList.add('active');
          _slaCritere[S] = p.dataset.critere;
          loadSlaStats(type, S, _slaCritere[S]);
        };
      });
    }

    loadSlaStats(type, S, _slaCritere[S]);
  });

  // Bouton récap PDF global (onclick remplacé à chaque visite, pas d'accumulation)
  const recapBtn = document.getElementById('btnSlaRecapPdf');
  if (recapBtn) recapBtn.onclick = () => exportSlaRecapPdf(recapBtn);

  if (anchor) {
    const sectionId = anchor === 'transit' ? 'slaConformiteTransitSection' : 'slaConformiteStopSection';
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
}

// ---- EXPORT PDF — VOLS NON CONFORMES SLA ----

// Export du tableau actuellement affiché (après clic sur l'œil ou sur "Vols non conformes")
async function exportDisplayedHorsSlaPdf(suffix, btn) {
  if (!window.jspdf) { showToast('Bibliothèque PDF non chargée. Rechargez la page.', 'error'); return; }
  const panel = document.getElementById(`slaHorsList_${suffix}`);
  const table = panel?.querySelector('table.data-table');
  const title = panel?.querySelector('h3')?.textContent?.trim() || 'Vols non conformes';
  if (!table) { showToast('Aucun tableau à exporter.', 'error'); return; }

  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const startY = await _drawDashboardPdfHeader(doc, title, '');
    doc.autoTable({
      html: table,
      startY,
      styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: [190, 30, 45], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });
    doc.save('SLA_non_conformes_' + suffix + '_' + new Date().toISOString().split('T')[0] + '.pdf');
    showToast('PDF généré.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erreur génération PDF : ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

// Aplatit les vols hors SLA (toutes catégories d'un type) triés par date
function _mergeHorsSla(...statsObjs) {
  const out = [];
  statsObjs.forEach(o => Object.values(o).forEach(s => s.volsHorsSla.forEach(v => out.push({ v, s }))));
  out.sort((a, b) => a.v.date_vol.localeCompare(b.v.date_vol));
  return out;
}

// Ajoute une section (titre + tableau) au PDF récap, gère le saut de page
function _addSlaRecapSection(doc, startY, title, head, rows) {
  const pageH = doc.internal.pageSize.getHeight();
  if (startY > pageH - 35) { doc.addPage(); startY = 20; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(190, 30, 45);
  doc.text(_pdfSafe(`${title} (${rows.length})`), 14, startY);
  startY += 2;

  if (rows.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 130, 145);
    doc.text('Aucun vol non conforme.', 14, startY + 6);
    return startY + 12;
  }

  doc.autoTable({
    head: [head],
    body: rows,
    startY: startY + 1,
    styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: [190, 30, 45], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY + 10;
}

// Récap général : tous les vols non conformes, Temps + Agents, Transit + Stop CMN
async function exportSlaRecapPdf(btn) {
  if (!window.jspdf) { showToast('Bibliothèque PDF non chargée. Rechargez la page.', 'error'); return; }
  const moisT = document.getElementById('slaStatsMoisTransit')?.value || '';
  const moisS = document.getElementById('slaStatsMoisStop')?.value || '';

  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération…'; }
  try {
    const [tTemps, sTemps, tAg, sAg] = await Promise.all([
      fetchSlaStatsData('transit', 'temps', moisT),
      fetchSlaStatsData('stop', 'temps', moisS),
      fetchSlaStatsData('transit', 'agents', moisT),
      fetchSlaStatsData('stop', 'agents', moisS),
    ]);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const sub = `Transit : ${tTemps.periodeLabel}    |    Stop CMN : ${sTemps.periodeLabel}`;
    let y = await _drawDashboardPdfHeader(doc, 'Recap SLA - Vols non conformes', sub);

    // Section TEMPS (Transit + Stop CMN)
    const tempsRows = _mergeHorsSla(tTemps.stats, sTemps.stats).map(({ v, s }) => [
      formatDate(v.date_vol), v.numero_vol || '-', v.immatriculation || '-', s.label,
      v.profiles?.nom || '-',
      `${v.heure_debut?.slice(0, 5) ?? '-'} - ${v.heure_fin?.slice(0, 5) ?? '-'}`,
      `${v.duree} min`, `${s.sla} min`, `+${v.duree - s.sla} min`,
    ]);
    y = _addSlaRecapSection(doc, y,
      'Non-conformite - TEMPS de traitement',
      ['Date', 'N° vol', 'Immat.', 'Type', 'Agent', 'Horaires', 'Duree', 'SLA max', 'Depassement'],
      tempsRows);

    // Section AGENTS (Transit + Stop CMN)
    const agRows = _mergeHorsSla(tAg.stats, sAg.stats).map(({ v, s }) => [
      formatDate(v.date_vol), v.numero_vol || '-', v.immatriculation || '-', s.label,
      v.profiles?.nom || '-',
      `${v.nbReel} agents`, `${s.agentsReq} requis`, `-${s.agentsReq - v.nbReel}`,
    ]);
    _addSlaRecapSection(doc, y,
      'Non-conformite - NOMBRE d\'agents',
      ['Date', 'N° vol', 'Immat.', 'Type', 'Agent', 'Agents reels', 'Requis', 'Manquant'],
      agRows);

    doc.save('Recap_SLA_non_conformes_' + new Date().toISOString().split('T')[0] + '.pdf');
    showToast('Récapitulatif PDF généré.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erreur génération PDF : ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

function renderSlaConfigGrid(cats, storageKey, suffix) {
  const grid = document.getElementById(`slaConfigGrid${suffix}`);
  const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');

  grid.innerHTML = cats.map(t => {
    const cached     = slaConfigCache[t.key] || {};
    const detail     = stored[t.key] || {};
    const slaMax     = cached.sla_minutes ?? t.slaMax;
    const slaMin     = detail.slaMin      ?? t.slaMin;
    const cabine     = detail.cabine      ?? t.agents.cabine;
    const galley     = detail.galley      ?? t.agents.galley;
    const sanitaire  = detail.sanitaire   ?? t.agents.sanitaire;
    const aspirateur = detail.aspirateur  ?? t.agents.aspirateur;
    const total      = cabine + galley + sanitaire + aspirateur;

    const avionTags = t.avions.map(a => `<span class="sla-avion-tag">${a}</span>`).join('');

    return `
      <div class="sla-cat-card">
        <div class="sla-cat-header">
          <div class="sla-cat-title-row">
            <span class="sla-cat-label">${t.label}</span>
            <span class="sla-cat-type-badge">${suffix === 'Transit' ? 'TRANSIT' : 'STOP CMN'}</span>
          </div>
          <div class="sla-cat-seats"><i class="fas fa-chair"></i> ${t.seats}</div>
        </div>
        <div class="sla-cat-body">

          <div class="sla-cat-avions">${avionTags}</div>

          <div class="sla-cat-section">
            <div class="sla-cat-section-label"><i class="fas fa-clock"></i> SLA ${suffix === 'Transit' ? 'Transit' : 'Stop CMN'}</div>
            <div class="sla-sla-range">
              <input type="number" class="sla-input sla-input-sm" id="sla_min_${t.key}" value="${slaMin}" min="1" max="999" />
              <span class="sla-range-sep">→</span>
              <input type="number" class="sla-input sla-input-sm" id="sla_max_${t.key}" value="${slaMax}" min="1" max="999" />
              <span class="sla-unit">min</span>
            </div>
          </div>

          <div class="sla-cat-section">
            <div class="sla-cat-section-label"><i class="fas fa-users"></i> Agents de nettoyage</div>
            <div class="sla-agents-breakdown">
              <div class="sla-agent-row">
                <span class="sla-agent-label">Cabine</span>
                <input type="number" class="sla-input sla-input-xs" id="ag_cabine_${t.key}" value="${cabine}" min="0" max="99" oninput="updateCatTotal('${t.key}')" />
                <span class="sla-unit">ag.</span>
              </div>
              <div class="sla-agent-row">
                <span class="sla-agent-label">Galley</span>
                <input type="number" class="sla-input sla-input-xs" id="ag_galley_${t.key}" value="${galley}" min="0" max="99" oninput="updateCatTotal('${t.key}')" />
                <span class="sla-unit">ag.</span>
              </div>
              <div class="sla-agent-row">
                <span class="sla-agent-label">Sanitaire</span>
                <input type="number" class="sla-input sla-input-xs" id="ag_sanitaire_${t.key}" value="${sanitaire}" min="0" max="99" oninput="updateCatTotal('${t.key}')" />
                <span class="sla-unit">ag.</span>
              </div>
              <div class="sla-agent-row">
                <span class="sla-agent-label">Aspirateur + J</span>
                <input type="number" class="sla-input sla-input-xs" id="ag_asp_${t.key}" value="${aspirateur}" min="0" max="99" oninput="updateCatTotal('${t.key}')" />
                <span class="sla-unit">ag.</span>
              </div>
              <div class="sla-agents-total-row">
                <span>Total</span>
                <span class="sla-total-value" id="total_${t.key}">${total}</span>
                <span class="sla-unit">agents</span>
              </div>
            </div>
          </div>

        </div>
      </div>`;
  }).join('');
}

function updateCatTotal(key) {
  const posts = ['cabine', 'galley', 'sanitaire', 'asp'];
  const total = posts.reduce((sum, p) => sum + (parseInt(document.getElementById(`ag_${p}_${key}`)?.value) || 0), 0);
  const el = document.getElementById(`total_${key}`);
  if (el) el.textContent = total;
}

async function saveSlaConfig(cats, storageKey, suffix) {
  const btn    = document.getElementById(`btnSaveSla${suffix}`);
  const status = document.getElementById(`slaSaveStatus${suffix}`);
  btn.disabled = true;
  status.textContent = '';

  const detailData = {};
  const rows = cats.map(t => {
    const slaMax     = parseInt(document.getElementById(`sla_max_${t.key}`)?.value)      || t.slaMax;
    const slaMin     = parseInt(document.getElementById(`sla_min_${t.key}`)?.value)      || t.slaMin;
    const cabine     = parseInt(document.getElementById(`ag_cabine_${t.key}`)?.value)    || 0;
    const galley     = parseInt(document.getElementById(`ag_galley_${t.key}`)?.value)    || 0;
    const sanitaire  = parseInt(document.getElementById(`ag_sanitaire_${t.key}`)?.value) || 0;
    const aspirateur = parseInt(document.getElementById(`ag_asp_${t.key}`)?.value)       || 0;
    detailData[t.key] = { slaMin, cabine, galley, sanitaire, aspirateur };
    return { type_vol: t.key, sla_minutes: slaMax, nb_agents_nettoyage: cabine + galley + sanitaire + aspirateur };
  });

  localStorage.setItem(storageKey, JSON.stringify(detailData));

  if (isDemoMode) {
    rows.forEach(r => { slaConfigCache[r.type_vol] = r; });
    status.innerHTML = '<span style="color:#22c55e"><i class="fas fa-check"></i> Enregistré (démo)</span>';
    btn.disabled = false;
    return;
  }

  const { error } = await supabase.from('sla_config').upsert(rows, { onConflict: 'type_vol' });
  if (error) {
    status.innerHTML = `<span style="color:#ef4444"><i class="fas fa-xmark"></i> Erreur : ${error.message}</span>`;
  } else {
    rows.forEach(r => { slaConfigCache[r.type_vol] = r; });
    status.innerHTML = '<span style="color:#22c55e"><i class="fas fa-check"></i> Configuration enregistrée</span>';
    setTimeout(() => { status.textContent = ''; }, 3000);
  }
  btn.disabled = false;
}

function getSlaForBroadType(typeVolKey) {
  // Derive effective SLA for a broad type_vol from the stored category config
  const mp = typeVolKey.includes('Moyen');
  const isTransit = typeVolKey.includes('Transit');
  const prefix = isTransit ? 'transit' : 'stop';
  const [catA, catB] = mp ? [`${prefix}_cat4`, `${prefix}_cat5`] : [`${prefix}_cat6`, `${prefix}_cat7`];
  const def = isTransit ? (mp ? 17 : 35) : (mp ? 28 : 50);
  const a = slaConfigCache[catA]?.sla_minutes ?? def;
  const b = slaConfigCache[catB]?.sla_minutes ?? def;
  return Math.max(a, b);
}

// Récupère et calcule les stats SLA (réutilisé par l'affichage et l'export PDF)
async function fetchSlaStatsData(typeFilter, critere, mois) {
  const range = mois ? monthToRange(mois) : null;

  let vols = [];
  if (isDemoMode) {
    vols = demoGetVols();
    if (range) vols = vols.filter(v => v.date_vol >= range.first && v.date_vol <= range.last);
  } else {
    const selectCols = critere === 'agents'
      ? 'id, numero_vol, immatriculation, type_vol, date_vol, heure_debut, heure_fin, profiles(nom), materiels_utilises(categorie, quantite)'
      : 'id, numero_vol, immatriculation, type_vol, date_vol, heure_debut, heure_fin, profiles(nom)';
    let q = supabase.from('vols').select(selectCols).order('date_vol');
    if (range) q = q.gte('date_vol', range.first).lte('date_vol', range.last);
    const all = [];
    let off = 0;
    while (true) {
      const { data: pg, error } = await q.range(off, off + 999);
      if (error) throw error;
      if (!pg || pg.length === 0) break;
      all.push(...pg); if (pg.length < 1000) break; off += 1000;
    }
    vols = all;
  }

  // Filtrer sur le type demandé (transit ou stop)
  vols = vols.filter(v => typeFilter === 'transit'
    ? (v.type_vol === 'Moyen Porteur Transit' || v.type_vol === 'Gros Porteur Transit')
    : (v.type_vol === 'Moyen Porteur Stop Cmn' || v.type_vol === 'Gros Porteur Stop Cmn')
  );

  // Calcul conformité par type
  const activeTypes = SLA_STATS_TYPES.filter(t => t.filterType === typeFilter);
  const stats = {};
  activeTypes.forEach(t => {
    stats[t.key] = {
      key:         t.key,
      label:       t.label,
      sla:         getSlaForBroadType(t.key),
      agentsReq:   slaConfigCache[t.key]?.nb_agents_nettoyage ?? 0,
      total: 0, avecInfo: 0, dansSla: 0, horsSla: 0,
      volsHorsSla: [],
    };
  });

  if (critere === 'temps') {
    vols.forEach(v => {
      const s = stats[v.type_vol];
      if (!s) return;
      s.total++;
      if (!v.heure_debut || !v.heure_fin) return;
      const [hd, md] = v.heure_debut.split(':').map(Number);
      const [hf, mf] = v.heure_fin.split(':').map(Number);
      let duree = (hf * 60 + mf) - (hd * 60 + md);
      if (duree < 0) duree += 1440;
      s.avecInfo++;
      if (duree <= s.sla) { s.dansSla++; }
      else { s.horsSla++; s.volsHorsSla.push({ ...v, duree }); }
    });
  } else {
    // critere === 'agents'
    vols.forEach(v => {
      const s = stats[v.type_vol];
      if (!s) return;
      s.total++;
      const matEntry = (v.materiels_utilises || []).find(m => m.categorie === 'Nombre agents');
      if (matEntry === undefined) return; // pas de saisie
      const nbReel = matEntry.quantite ?? 0;
      s.avecInfo++;
      if (nbReel >= s.agentsReq) { s.dansSla++; }
      else { s.horsSla++; s.volsHorsSla.push({ ...v, nbReel }); }
    });
  }

  const periodeLabel = range
    ? `${MONTH_NAMES_FULL[parseInt(mois.split('-')[1]) - 1]} ${mois.split('-')[0]}`
    : 'toute la période';

  return { stats, periodeLabel };
}

async function loadSlaStats(typeFilter, suffix, critere = 'temps') {
  const content = document.getElementById(`slaStatsContent${suffix}`);
  content.innerHTML = '<div class="loading-state">Chargement…</div>';

  const mois = document.getElementById(`slaStatsMois${suffix}`)?.value || '';

  let stats, periodeLabel;
  try {
    ({ stats, periodeLabel } = await fetchSlaStatsData(typeFilter, critere, mois));
  } catch (e) {
    content.innerHTML = `<div class="empty-state">Erreur : ${e.message}</div>`;
    return;
  }

  const totalHorsSla = Object.values(stats).reduce((acc, s) => acc + s.horsSla, 0);
  const isTemps = critere === 'temps';

  // KPI cards
  const kpiHtml = Object.values(stats).map(s => {
    const taux = s.avecInfo > 0 ? (s.dansSla / s.avecInfo * 100).toFixed(1) : null;
    const color = taux === null ? '#94a3b8' : taux >= 90 ? '#22c55e' : taux >= 70 ? '#f59e0b' : '#ef4444';
    const sub = isTemps ? `conformité temps (≤ ${s.sla} min)` : `effectif ≥ ${s.agentsReq} agents requis`;
    return `
      <div class="sla-kpi-card">
        <div class="sla-kpi-label">${s.label}</div>
        <div class="sla-kpi-value" style="color:${color}">${taux !== null ? taux + '%' : '—'}</div>
        <div class="sla-kpi-sub">${sub}</div>
        <div class="sla-kpi-detail">${s.dansSla} / ${s.avecInfo} vols analysés</div>
      </div>`;
  }).join('');

  // Table récap
  const tableRows = Object.values(stats).map(s => {
    const taux = s.avecInfo > 0 ? (s.dansSla / s.avecInfo * 100).toFixed(1) + '%' : '—';
    const color = s.avecInfo === 0 ? '' : parseFloat(taux) >= 90 ? 'color:#22c55e' : parseFloat(taux) >= 70 ? 'color:#f59e0b' : 'color:#ef4444';
    const sansInfo = s.total - s.avecInfo;
    const btnHors = s.horsSla > 0
      ? `<button class="btn btn-outline btn-xs sla-voir-hors" data-type="${s.key}">
           <i class="fas fa-eye"></i> Voir (${s.horsSla})
         </button>`
      : `<span style="color:#94a3b8">—</span>`;
    const critereCol = isTemps
      ? `<td style="text-align:center">${s.sla} min</td>`
      : `<td style="text-align:center">${s.agentsReq} agents</td>`;
    return `
      <tr>
        <td>${s.label}</td>
        ${critereCol}
        <td style="text-align:center">${s.total}</td>
        <td style="text-align:center;color:#22c55e">${s.dansSla}</td>
        <td style="text-align:center">${btnHors}</td>
        <td style="text-align:center;color:#94a3b8">${sansInfo}</td>
        <td style="text-align:center;font-weight:600;${color}">${taux}</td>
      </tr>`;
  }).join('');

  const thCritere = isTemps
    ? `<th style="text-align:center">SLA max</th>`
    : `<th style="text-align:center">Agents requis</th>`;
  const sansLabel = isTemps ? 'Sans horaire' : 'Sans saisie agents';

  // Table vols hors SLA
  const allHorsRows = Object.values(stats)
    .flatMap(s => s.volsHorsSla.map(v => ({ ...v, sla: s.sla, agentsReq: s.agentsReq, typeLabel: s.label })))
    .sort((a, b) => a.date_vol.localeCompare(b.date_vol));

  const horsTableRows = allHorsRows.map(v => {
    const detailCol = isTemps
      ? `<td style="text-align:center;font-weight:600;color:#ef4444">${v.duree} min</td>
         <td style="text-align:center">${v.sla} min</td>
         <td style="text-align:center;color:#ef4444;font-weight:600">+${v.duree - v.sla} min</td>`
      : `<td style="text-align:center;font-weight:600;color:#ef4444">${v.nbReel} agents</td>
         <td style="text-align:center">${v.agentsReq} agents requis</td>
         <td style="text-align:center;color:#ef4444;font-weight:600">-${v.agentsReq - v.nbReel}</td>`;
    return `
      <tr>
        <td>${formatDate(v.date_vol)}</td>
        <td><strong>${v.numero_vol || '—'}</strong></td>
        <td>${v.immatriculation || '—'}</td>
        <td>${v.typeLabel}</td>
        <td>${v.profiles?.nom || '—'}</td>
        <td style="text-align:center">${v.heure_debut?.slice(0,5) ?? '—'} → ${v.heure_fin?.slice(0,5) ?? '—'}</td>
        ${detailCol}
      </tr>`;
  }).join('');

  const horsThCols = isTemps
    ? `<th style="text-align:center">Durée réelle</th><th style="text-align:center">SLA max</th><th style="text-align:center">Dépassement</th>`
    : `<th style="text-align:center">Agents réels</th><th style="text-align:center">Requis</th><th style="text-align:center">Manquant</th>`;

  content.innerHTML = `
    <div class="sla-kpi-grid">${kpiHtml}</div>

    <div class="card" style="margin-top:1.5rem;">
      <div class="card-header">
        <h3>Récapitulatif — ${periodeLabel}</h3>
        ${totalHorsSla > 0 ? `
        <button class="btn btn-danger btn-sm" id="btnToggleHorsSla_${suffix}">
          <i class="fas fa-triangle-exclamation"></i> Vols non conformes (${totalHorsSla})
        </button>` : ''}
      </div>
      <div class="card-body" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>
            <th>Type de vol</th>
            ${thCritere}
            <th style="text-align:center">Total vols</th>
            <th style="text-align:center">Conformes</th>
            <th style="text-align:center">Non conformes</th>
            <th style="text-align:center">${sansLabel}</th>
            <th style="text-align:center">Conformité</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>

    <div id="slaHorsList_${suffix}" style="display:none;margin-top:1rem;">
      <div class="card sla-hors-card">
        <div class="card-header" style="background:rgba(239,68,68,.08);border-bottom:1px solid rgba(239,68,68,.2);">
          <h3 style="color:#ef4444"><i class="fas fa-triangle-exclamation"></i> Vols non conformes — ${periodeLabel}</h3>
          <div style="display:flex;gap:.5rem;">
            <button class="btn btn-outline btn-sm" id="btnPdfHorsSla_${suffix}"><i class="fas fa-file-pdf"></i> PDF</button>
            <button class="btn btn-outline btn-sm" id="btnFermerHorsSla_${suffix}"><i class="fas fa-xmark"></i> Fermer</button>
          </div>
        </div>
        <div class="card-body" style="overflow-x:auto;">
          ${allHorsRows.length === 0 ? '<div class="empty-state">Aucun vol non conforme</div>' : `
          <table class="data-table">
            <thead><tr>
              <th>Date</th><th>N° vol</th><th>Immat.</th><th>Type</th><th>Agent contrôle</th>
              <th style="text-align:center">Horaires</th>
              ${horsThCols}
            </tr></thead>
            <tbody>${horsTableRows}</tbody>
          </table>`}
        </div>
      </div>
    </div>

    <p class="sla-note"><i class="fas fa-circle-info"></i>
      ${isTemps
        ? '<em>Sans horaire</em> = vols sans heure de début ou de fin enregistrée.'
        : '<em>Sans saisie agents</em> = vols où l\'agent n\'a pas renseigné le nombre d\'agents de nettoyage.'
      }</p>`;

  document.getElementById(`btnToggleHorsSla_${suffix}`)?.addEventListener('click', () => {
    const panel = document.getElementById(`slaHorsList_${suffix}`);
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById(`btnFermerHorsSla_${suffix}`)?.addEventListener('click', () => {
    document.getElementById(`slaHorsList_${suffix}`).style.display = 'none';
  });

  document.getElementById(`btnPdfHorsSla_${suffix}`)?.addEventListener('click', (e) => {
    exportDisplayedHorsSlaPdf(suffix, e.currentTarget);
  });

  document.querySelectorAll('.sla-voir-hors').forEach(btn => {
    btn.addEventListener('click', () => {
      const typeKey = btn.dataset.type;
      const s = stats[typeKey];
      if (!s) return;

      const filteredRows = s.volsHorsSla
        .sort((a, b) => a.date_vol.localeCompare(b.date_vol))
        .map(v => {
          const detailCol = isTemps
            ? `<td style="text-align:center;font-weight:600;color:#ef4444">${v.duree} min</td>
               <td style="text-align:center">${s.sla} min</td>
               <td style="text-align:center;color:#ef4444;font-weight:600">+${v.duree - s.sla} min</td>`
            : `<td style="text-align:center;font-weight:600;color:#ef4444">${v.nbReel} agents</td>
               <td style="text-align:center">${s.agentsReq} agents requis</td>
               <td style="text-align:center;color:#ef4444;font-weight:600">-${s.agentsReq - v.nbReel}</td>`;
          return `
            <tr>
              <td>${formatDate(v.date_vol)}</td>
              <td><strong>${v.numero_vol || '—'}</strong></td>
              <td>${v.immatriculation || '—'}</td>
              <td>${s.label}</td>
              <td>${v.profiles?.nom || '—'}</td>
              <td style="text-align:center">${v.heure_debut?.slice(0,5) ?? '—'} → ${v.heure_fin?.slice(0,5) ?? '—'}</td>
              ${detailCol}
            </tr>`;
        }).join('');

      const panel = document.getElementById(`slaHorsList_${suffix}`);
      panel.querySelector('tbody').innerHTML = filteredRows;
      panel.querySelector('h3').innerHTML =
        `<i class="fas fa-triangle-exclamation"></i> Vols non conformes — ${s.label} — ${periodeLabel}`;
      panel.style.display = 'block';
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ---- WIDGET SLA GLOBAL (Dashboard) ----

const SLA_TYPES = [
  { key: 'Moyen Porteur Transit',  label: 'MP Transit',  anchor: 'transit' },
  { key: 'Gros Porteur Transit',   label: 'GP Transit',  anchor: 'transit' },
  { key: 'Moyen Porteur Stop Cmn', label: 'MP Stop CMN', anchor: 'stop'    },
  { key: 'Gros Porteur Stop Cmn',  label: 'GP Stop CMN', anchor: 'stop'    },
];

function _computeSlaStats(vols) {
  const TYPES = SLA_TYPES;

  // Initialiser les stats pour les deux critères
  const sT = {}, sA = {};
  TYPES.forEach(t => {
    sT[t.key] = { total: 0, avecInfo: 0, dans: 0 };
    sA[t.key] = { total: 0, avecInfo: 0, dans: 0 };
  });

  vols.forEach(v => {
    const type = TYPES.find(t => t.key === v.type_vol);
    if (!type) return;

    // Critère temps
    sT[v.type_vol].total++;
    if (v.heure_debut && v.heure_fin) {
      const [hd, md] = v.heure_debut.split(':').map(Number);
      const [hf, mf] = v.heure_fin.split(':').map(Number);
      let duree = (hf * 60 + mf) - (hd * 60 + md);
      if (duree < 0) duree += 1440;
      sT[v.type_vol].avecInfo++;
      if (duree <= getSlaForBroadType(v.type_vol)) sT[v.type_vol].dans++;
    }

    // Critère agents
    sA[v.type_vol].total++;
    const matEntry = (v.materiels_utilises || []).find(m => m.categorie === 'Nombre agents');
    if (matEntry !== undefined) {
      const agentsReq = slaConfigCache[v.type_vol]?.nb_agents_nettoyage ?? 0;
      sA[v.type_vol].avecInfo++;
      if ((matEntry.quantite ?? 0) >= agentsReq) sA[v.type_vol].dans++;
    }
  });

  // ---- Cartes résumé (Transit / Stop CMN / Global) ----
  const grp = {
    transit: { label: 'Transit',  icon: 'fa-gauge-high', mp: TYPES[0], gp: TYPES[1], total: 0, dans: 0, mpD: 0, mpT: 0, gpD: 0, gpT: 0 },
    stop:    { label: 'Stop CMN', icon: 'fa-circle-stop', mp: TYPES[2], gp: TYPES[3], total: 0, dans: 0, mpD: 0, mpT: 0, gpD: 0, gpT: 0 },
  };
  Object.values(grp).forEach(g => {
    [g.mp, g.gp].forEach(t => {
      const s = sT[t.key];
      g.total += s.avecInfo; g.dans += s.dans;
      if (t === g.mp) { g.mpD += s.dans; g.mpT += s.avecInfo; }
      else            { g.gpD += s.dans; g.gpT += s.avecInfo; }
    });
  });
  const totalAll = grp.transit.total + grp.stop.total;
  const dansAll  = grp.transit.dans  + grp.stop.dans;
  const tauxAll  = totalAll > 0 ? (dansAll / totalAll * 100).toFixed(1) : null;

  return { sT, sA, grp, totalAll, dansAll, tauxAll };
}

function _slaColor(taux) {
  return taux === null ? '#94a3b8' : parseFloat(taux) >= 90 ? '#22c55e' : parseFloat(taux) >= 70 ? '#f59e0b' : '#ef4444';
}

// Mini-résumé compact (vue globale toutes périodes) — placé entre les filtres et le widget filtré
function _renderSlaGlobalMini(vols, containerId) {
  const content = document.getElementById(containerId);
  if (!content) return;
  const { grp, totalAll, dansAll, tauxAll } = _computeSlaStats(vols);
  const colorAll = _slaColor(tauxAll);

  const chip = (label, icon, g) => {
    const taux = g.total > 0 ? (g.dans / g.total * 100).toFixed(1) : null;
    return `
      <div class="sla-mini-chip">
        <span class="sla-mini-chip-label"><i class="fas ${icon}"></i> ${label}</span>
        <span class="sla-mini-chip-value" style="color:${_slaColor(taux)}">${taux !== null ? taux + '%' : '—'}</span>
      </div>`;
  };

  content.innerHTML = `
    <span class="sla-mini-note">Toutes périodes confondues —</span>
    <div class="sla-mini-chip sla-mini-chip-global">
      <span class="sla-mini-chip-label"><i class="fas fa-chart-pie"></i> Global</span>
      <span class="sla-mini-chip-value" style="color:${colorAll}">${tauxAll !== null ? tauxAll + '%' : '—'}</span>
      <span class="sla-mini-chip-sub">${dansAll}/${totalAll} vols</span>
    </div>
    ${chip('Transit', 'fa-gauge-high', grp.transit)}
    ${chip('Stop CMN', 'fa-circle-stop', grp.stop)}
  `;
}

function _renderSlaWidget(vols, containerId) {
  const content = document.getElementById(containerId);
  if (!content) return;

  const TYPES = SLA_TYPES;
  const { sT, sA, grp, totalAll, dansAll, tauxAll } = _computeSlaStats(vols);
  const colorAll = _slaColor(tauxAll);

  const summaryCards = Object.entries(grp).map(([type, g]) => {
    const taux  = g.total > 0 ? (g.dans / g.total * 100).toFixed(1) : null;
    const color = taux === null ? '#94a3b8' : parseFloat(taux) >= 90 ? '#22c55e' : parseFloat(taux) >= 70 ? '#f59e0b' : '#ef4444';
    return `
      <div class="sla-db-kpi">
        <div class="sla-db-kpi-label"><i class="fas ${g.icon}"></i> ${g.label}</div>
        <div class="sla-db-kpi-value" style="color:${color}">${taux !== null ? taux + '%' : '—'}</div>
        <div class="sla-db-kpi-sub">${g.dans} / ${g.total} vols</div>
        <div class="sla-db-kpi-breakdown">
          <span class="badge-mp"><i class="fas fa-plane-departure"></i> MP&nbsp;${g.mpD}/${g.mpT}</span>
          <span class="badge-gp"><i class="fas fa-plane"></i> GP&nbsp;${g.gpD}/${g.gpT}</span>
        </div>
        <a href="#" class="sla-db-link" data-anchor="${type}">Voir détail →</a>
      </div>`;
  }).join('');

  const globalCard = `
    <div class="sla-db-kpi sla-db-kpi-global">
      <div class="sla-db-kpi-label"><i class="fas fa-chart-pie"></i> Global</div>
      <div class="sla-db-kpi-value" style="color:${colorAll}">${tauxAll !== null ? tauxAll + '%' : '—'}</div>
      <div class="sla-db-kpi-sub">${dansAll} / ${totalAll} vols</div>
      <a href="#" class="sla-db-link" data-anchor="">Voir tout →</a>
    </div>`;

  // ---- Cartes détaillées (8 cartes : 4 types × 2 critères) ----
  const renderDetailCard = (t, stats, anchor) => {
    const s = stats[t.key];
    const taux  = s.avecInfo > 0 ? (s.dans / s.avecInfo * 100).toFixed(1) : null;
    const color = taux === null ? '#94a3b8' : parseFloat(taux) >= 90 ? '#22c55e' : parseFloat(taux) >= 70 ? '#f59e0b' : '#ef4444';
    return `
      <div class="sla-db-kpi">
        <div class="sla-db-kpi-label">${t.label}</div>
        <div class="sla-db-kpi-value" style="color:${color}">${taux !== null ? taux + '%' : '—'}</div>
        <div class="sla-db-kpi-sub">${s.dans} / ${s.avecInfo} vols analysés</div>
        <a href="#" class="sla-db-link" data-anchor="${anchor}">Détail →</a>
      </div>`;
  };

  content.innerHTML = `
    <div class="sla-db-grid">
      ${summaryCards}
      ${globalCard}
    </div>
    <div class="sla-db-separator"></div>
    <div class="sla-db-global-grid">
      <div class="sla-db-critere-section">
        <div class="sla-db-critere-title"><i class="fas fa-clock"></i> Temps de traitement</div>
        <div class="sla-db-row">
          ${TYPES.map(t => renderDetailCard(t, sT, t.anchor)).join('')}
        </div>
      </div>
      <div class="sla-db-critere-section">
        <div class="sla-db-critere-title"><i class="fas fa-users"></i> Effectif agents</div>
        <div class="sla-db-row">
          ${TYPES.map(t => renderDetailCard(t, sA, t.anchor)).join('')}
        </div>
      </div>
    </div>
    <div class="sla-db-footer">
      <a href="#" class="sla-db-link" data-anchor="">Voir Conformité SLA →</a>
    </div>`;

  content.querySelectorAll('.sla-db-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      _pendingSlaAnchor = a.dataset.anchor || null;
      document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
      document.getElementById('viewSlaconformite').style.display = 'block';
      document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
      document.querySelector('.sidebar-link[data-view="sla-conformite"]')?.classList.add('active');
      document.getElementById('sidebar')?.classList.remove('sidebar-open');
      loadSlaConformiteView();
    });
  });
}

async function loadDashboardSla() {
  const content = document.getElementById('slaGlobalMini');
  if (!content) return;

  let vols = [];
  if (isDemoMode) {
    vols = demoGetVols();
  } else {
    const all = [];
    let off = 0;
    while (true) {
      const { data: pg } = await supabase
        .from('vols')
        .select('type_vol, heure_debut, heure_fin, materiels_utilises(categorie, quantite)')
        .in('statut', ['soumis', 'validé', 'rejeté'])
        .order('date_vol')
        .range(off, off + 999);
      if (!pg || pg.length === 0) break;
      all.push(...pg);
      if (pg.length < 1000) break;
      off += 1000;
    }
    vols = all;
    if (Object.keys(slaConfigCache).length === 0) {
      const { data } = await supabase.from('sla_config').select('*');
      (data || []).forEach(r => { slaConfigCache[r.type_vol] = r; });
    }
  }
  _renderSlaGlobalMini(vols, 'slaGlobalMini');
}

async function loadDashboardSlaFiltered(volIds) {
  const content = document.getElementById('slaFilteredContent');
  if (!content) return;
  content.innerHTML = '<div class="loading-state">Chargement…</div>';

  if (!volIds || !volIds.length) {
    content.innerHTML = '<div class="empty-state">Aucun vol dans la sélection.</div>';
    return;
  }

  let vols = [];
  if (isDemoMode) {
    const idSet = new Set(volIds);
    vols = demoGetVols().filter(v => idSet.has(v.id));
  } else {
    const CHUNK = 200;
    const chunks = [];
    for (let i = 0; i < volIds.length; i += CHUNK) chunks.push(volIds.slice(i, i + CHUNK));
    const results = await Promise.all(chunks.map(c =>
      supabase.from('vols')
        .select('type_vol, heure_debut, heure_fin, materiels_utilises(categorie, quantite)')
        .in('id', c)
    ));
    vols = results.flatMap(r => r.data || []);
    if (Object.keys(slaConfigCache).length === 0) {
      const { data } = await supabase.from('sla_config').select('*');
      (data || []).forEach(r => { slaConfigCache[r.type_vol] = r; });
    }
  }
  _renderSlaWidget(vols, 'slaFilteredContent');
}

// ---- ARCHIVAGE ----

// ---- IMMATRICULATIONS AT ----

let immatCurrentType = 'ATR';
const IMMAT_TYPES = ['ATR', '737', '787', 'E190', '767'];

async function refreshImmatTabCounts() {
  if (isDemoMode) return;
  try {
    const { data } = await supabase.from('immatriculations').select('type_avion');
    if (!data) return;
    const counts = Object.fromEntries(IMMAT_TYPES.map(t => [t, 0]));
    data.forEach(r => { if (r.type_avion in counts) counts[r.type_avion]++; });
    document.querySelectorAll('.immat-tab').forEach(btn => {
      const type = btn.dataset.type;
      const n = counts[type] || 0;
      btn.textContent = n > 0 ? `${type} (${n})` : type;
    });
  } catch {}
}

function setupImmatInput() {
  const inp = document.getElementById('immatValue');
  if (!inp || inp._immatSetup) return;
  inp._immatSetup = true;

  const PREFIX = 'CN-';
  const enforce = () => {
    let v = inp.value.toUpperCase();
    if (!v.startsWith(PREFIX)) v = PREFIX + v.replace(/^C?N?-?/i, '');
    inp.value = v;
  };
  inp.addEventListener('input', enforce);
  inp.addEventListener('keydown', (e) => {
    const pos = inp.selectionStart;
    const selEnd = inp.selectionEnd;
    if ((e.key === 'Backspace' || e.key === 'Delete') && pos <= PREFIX.length && selEnd <= PREFIX.length) {
      e.preventDefault();
    }
  });
  inp.addEventListener('focus', () => {
    const l = inp.value.length;
    inp.setSelectionRange(l, l);
  });
}

function loadImmatriculationsView() {
  // Onglets
  document.querySelectorAll('.immat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.immat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      immatCurrentType = btn.dataset.type;
      document.getElementById('immatTypeAvion').value = immatCurrentType;
      document.getElementById('immatTabLabel').textContent = immatCurrentType;
      renderImmatList();
    });
  });

  // Formulaire ajout
  document.getElementById('formAddImmat')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addImmatriculation();
  });

  setupImmatInput();
  refreshImmatTabCounts();
  renderImmatList();
}

async function renderImmatList() {
  const content  = document.getElementById('immatListContent');
  const countEl  = document.getElementById('immatCount');
  content.innerHTML = '<div class="loading-state">Chargement…</div>';

  let rows = [];
  if (!isDemoMode) {
    try {
      const { data, error } = await supabase
        .from('immatriculations')
        .select('*')
        .eq('type_avion', immatCurrentType)
        .order('immatriculation');
      if (error) {
        content.innerHTML = `<div class="empty-state">Erreur : ${error.message}</div>`;
        return;
      }
      rows = data || [];
    } catch (err) {
      content.innerHTML = `<div class="empty-state">Erreur réseau : ${err.message}</div>`;
      return;
    }
  }

  if (countEl) countEl.textContent = `${rows.length} immatriculation${rows.length !== 1 ? 's' : ''}`;
  refreshImmatTabCounts();

  if (!rows.length) {
    content.innerHTML = '<div class="empty-state">Aucune immatriculation enregistrée pour ce type.</div>';
    return;
  }

  content.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Immatriculation</th>
        <th style="text-align:center">Statut</th>
        <th style="text-align:center">Actions</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td><span class="cie-code-badge">${r.immatriculation}</span></td>
            <td style="text-align:center">
              <span class="badge ${r.actif ? 'badge-ok' : 'badge-off'}">${r.actif ? 'Actif' : 'Inactif'}</span>
            </td>
            <td style="text-align:center">
              <button class="btn btn-outline btn-xs" onclick="toggleImmat('${r.id}', ${r.actif})">
                <i class="fas fa-${r.actif ? 'ban' : 'check'}"></i> ${r.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button class="btn btn-danger btn-xs" style="margin-left:.4rem" onclick="deleteImmat('${r.id}', '${r.immatriculation}')">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function addImmatriculation() {
  const val  = document.getElementById('immatValue').value.trim().toUpperCase();
  const type = document.getElementById('immatTypeAvion').value;
  const btn  = document.getElementById('btnAddImmat');

  if (!type || val.length <= 3) {
    showToast('Saisissez une immatriculation valide (ex: CN-RGT).', 'error');
    return;
  }

  btn.disabled = true;

  if (!isDemoMode) {
    // Vérification doublon avant insert
    try {
      const { data: existing } = await supabase
        .from('immatriculations')
        .select('id')
        .eq('type_avion', type)
        .eq('immatriculation', val)
        .maybeSingle();
      if (existing) {
        showToast(`"${val}" est déjà enregistrée pour le type ${type}.`, 'error');
        btn.disabled = false;
        return;
      }
    } catch {}

    const { error } = await supabase.from('immatriculations').insert({
      type_avion: type,
      immatriculation: val,
      actif: true
    });
    if (error) {
      showToast(
        error.message.includes('unique')
          ? `"${val}" est déjà enregistrée pour le type ${type}.`
          : error.message,
        'error'
      );
      btn.disabled = false;
      return;
    }
  }

  document.getElementById('immatValue').value = 'CN-';
  btn.disabled = false;
  showToast(`Immatriculation "${val}" ajoutée (${type}).`, 'success');
  renderImmatList();
}

async function toggleImmat(id, currentActif) {
  if (!isDemoMode) {
    const { error } = await supabase.from('immatriculations').update({ actif: !currentActif }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
  }
  renderImmatList();
}

async function deleteImmat(id, immat) {
  if (!confirm(`Supprimer l'immatriculation "${immat}" ?`)) return;
  if (!isDemoMode) {
    const { error } = await supabase.from('immatriculations').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
  }
  showToast(`Immatriculation "${immat}" supprimée.`, 'success');
  renderImmatList();
}

// Exposées globalement pour les onclick inline dans le HTML généré dynamiquement
window.toggleImmat = toggleImmat;
window.deleteImmat = deleteImmat;

// ---- ARCHIVAGE ----

let archiveCurrentMonth = null;
let archivePreviewData = null;

async function loadArchiveView() {
  const container = document.getElementById('viewArchive');
  if (!container) return;

  container.innerHTML = `
    <div class="page-title"><h2><i class="fas fa-box-archive"></i> Archivage des données</h2></div>

    <div class="archive-info-banner">
      <i class="fas fa-circle-info"></i>
      <div>
        <strong>Comment fonctionne l'archivage ?</strong>
        <ol style="margin:.4rem 0 0 1.1rem;padding:0;line-height:1.7;">
          <li>Sélectionnez une période passée et cliquez sur <strong>Prévisualiser</strong>.</li>
          <li>Cliquez sur <strong>Générer le PDF</strong> pour télécharger un rapport complet avec les fiches et les photos.</li>
          <li>Une fois le PDF vérifié et sauvegardé, cliquez sur <strong>Purger les photos</strong> pour libérer le stockage cloud.</li>
        </ol>
        Les statistiques et taux de conformité restent disponibles dans l'application indéfiniment.
      </div>
    </div>

    <div id="archiveMigrationBanner" style="display:none;" class="archive-migration-banner">
      <div class="archive-migration-inner">
        <i class="fas fa-database"></i>
        <div>
          <strong>Migration requise — colonne manquante</strong><br>
          Exécutez ces deux commandes SQL dans <a href="https://supabase.com/dashboard" target="_blank" style="color:#fcd34d;">Supabase SQL Editor</a> pour activer le suivi des archives :
          <div class="archive-sql-block"><code>ALTER TABLE public.vols ADD COLUMN IF NOT EXISTS photos_archivees BOOLEAN DEFAULT FALSE;</code></div>
          <div class="archive-sql-block" style="margin-top:.4rem;"><code>CREATE POLICY "Admin supprime photos storage" ON storage.objects FOR DELETE USING (bucket_id = 'photos-controle' AND public.get_my_role() IN ('admin','chef','superviseur'));</code></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3><i class="fas fa-calendar-alt"></i> Sélectionner la période à archiver</h3></div>
      <div class="card-body">
        <div class="archive-quick-btns">
          <span style="font-size:.8rem;color:#94a3b8;">Raccourcis :</span>
          <button class="btn btn-sm btn-outline" onclick="setArchivePeriod(7)">7 derniers jours</button>
          <button class="btn btn-sm btn-outline" onclick="setArchivePeriod(15)">15 jours</button>
          <button class="btn btn-sm btn-outline" onclick="setArchivePeriod(30)">30 jours</button>
          <button class="btn btn-sm btn-outline" onclick="setArchivePeriodMonth()">Mois complet</button>
        </div>
        <div class="archive-select-row" style="margin-top:.75rem;">
          <div style="display:flex;align-items:center;gap:.5rem;">
            <label style="font-size:.8rem;color:#94a3b8;white-space:nowrap;">Du</label>
            <input type="date" id="archiveDateFrom" class="form-control" style="max-width:160px;" />
          </div>
          <div style="display:flex;align-items:center;gap:.5rem;">
            <label style="font-size:.8rem;color:#94a3b8;white-space:nowrap;">Au</label>
            <input type="date" id="archiveDateTo" class="form-control" style="max-width:160px;" />
          </div>
          <button class="btn btn-outline" onclick="previewArchiveMonth()">
            <i class="fas fa-magnifying-glass"></i> Prévisualiser
          </button>
        </div>
      </div>
    </div>

    <div id="archivePreviewSection" style="display:none;">
      <div class="card">
        <div class="card-header"><h3><i class="fas fa-eye"></i> Aperçu de l'archivage</h3></div>
        <div class="card-body" id="archivePreviewBody">
          <div class="loading-state">Analyse en cours…</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3><i class="fas fa-clock-rotate-left"></i> Historique des archives</h3></div>
      <div class="card-body" id="archiveHistorique">
        <div class="loading-state">Chargement…</div>
      </div>
    </div>
  `;

  // Initialise les dates sur les 7 derniers jours par défaut
  setArchivePeriod(7);

  await checkArchiveColumn();
  await loadArchiveHistory();
}

async function checkArchiveColumn() {
  if (isDemoMode) return;
  const { error } = await supabase.from('vols').select('photos_archivees').limit(1);
  if (error) {
    const banner = document.getElementById('archiveMigrationBanner');
    if (banner) banner.style.display = 'block';
  }
}

async function loadArchiveHistory() {
  const el = document.getElementById('archiveHistorique');
  if (!el) return;

  if (isDemoMode) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;">Historique non disponible en mode démo.</p>';
    return;
  }

  try {
    const { data: vols, error } = await supabase
      .from('vols')
      .select('date_vol, numero_vol, photos_archivees')
      .eq('photos_archivees', true)
      .order('date_vol', { ascending: false });

    if (error) { el.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;">Migration requise pour afficher l\'historique.</p>'; return; }
    if (!vols?.length) { el.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;">Aucune archive enregistrée.</p>'; return; }

    const byMonth = {};
    vols.forEach(v => {
      const key = v.date_vol.substring(0, 7);
      byMonth[key] = (byMonth[key] || 0) + 1;
    });

    let html = '<table class="table"><thead><tr><th>Mois archivé</th><th>Vols</th><th>État</th></tr></thead><tbody>';
    Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).forEach(([key, count]) => {
      const [y, m] = key.split('-');
      const label = MONTH_NAMES_FULL[parseInt(m) - 1] + ' ' + y;
      html += `<tr>
        <td><strong>${label}</strong></td>
        <td>${count} vol(s)</td>
        <td><span class="badge badge-success"><i class="fas fa-check-circle"></i> Photos purgées</span></td>
      </tr>`;
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;">Erreur de chargement.</p>';
  }
}

window.setArchivePeriod = function(days) {
  const to = new Date();
  to.setDate(to.getDate() - 1); // hier max
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  const fmt = d => d.toISOString().split('T')[0];
  const el1 = document.getElementById('archiveDateFrom');
  const el2 = document.getElementById('archiveDateTo');
  if (el1) el1.value = fmt(from);
  if (el2) el2.value = fmt(to);
};

window.setArchivePeriodMonth = function() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = d => d.toISOString().split('T')[0];
  const el1 = document.getElementById('archiveDateFrom');
  const el2 = document.getElementById('archiveDateTo');
  if (el1) el1.value = fmt(from);
  if (el2) el2.value = fmt(to);
};

window.previewArchiveMonth = async function() {
  const first = document.getElementById('archiveDateFrom')?.value;
  const last = document.getElementById('archiveDateTo')?.value;
  if (!first || !last) { showToast('Sélectionnez une plage de dates.', 'error'); return; }
  if (first > last) { showToast('La date de début doit être avant la date de fin.', 'error'); return; }

  archiveCurrentMonth = first + '_' + last;
  const section = document.getElementById('archivePreviewSection');
  section.style.display = 'block';
  const body = document.getElementById('archivePreviewBody');
  body.innerHTML = '<div class="loading-state">Analyse en cours…</div>';

  try {
    // Récupérer TOUS les vols de la période (pagination par 1000)
    let vols = [];
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data: page, error: volsErr } = await supabase
        .from('vols')
        .select('id, numero_vol, date_vol, type_vol, statut, agent_id, immatriculation, heure_debut, heure_fin, photos_archivees, source')
        .gte('date_vol', first)
        .lte('date_vol', last)
        .order('date_vol')
        .range(offset, offset + PAGE - 1);
      if (volsErr) throw volsErr;
      if (page?.length) vols = vols.concat(page);
      if (!page || page.length < PAGE) break;
      offset += PAGE;
    }

    if (!vols?.length) {
      body.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;">Aucun vol sur cette période.</p>';
      return;
    }

    const volIds = vols.map(v => v.id);

    const { data: photos } = await supabase.from('photos').select('id, vol_id, storage_path, url_publique').in('vol_id', volIds);

    const photoCount = photos?.length || 0;
    const alreadyArchived = vols.filter(v => v.photos_archivees).length;
    const toArchive = vols.filter(v => !v.photos_archivees).length;

    const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    const periodLabel = `${fmtDate(first)} → ${fmtDate(last)}`;

    archivePreviewData = { vols, volIds, photos: photos || [], month: archiveCurrentMonth, periodLabel };

    const allDone = toArchive === 0 && photoCount === 0;
    const estMinutes = Math.ceil(vols.length * 0.3 + photoCount * 0.15);

    body.innerHTML = `
      <p style="font-size:.8rem;color:#94a3b8;margin-bottom:.75rem;"><i class="fas fa-calendar-range"></i> Période : <strong style="color:#cbd5e1;">${periodLabel}</strong></p>
      <div class="archive-stats-row">
        <div class="archive-stat">
          <span class="archive-stat-value">${vols.length}</span>
          <span class="archive-stat-label">Vols</span>
        </div>
        <div class="archive-stat">
          <span class="archive-stat-value">${toArchive}</span>
          <span class="archive-stat-label">Non archivés</span>
        </div>
        <div class="archive-stat">
          <span class="archive-stat-value">${photoCount}</span>
          <span class="archive-stat-label">Photos stockage</span>
        </div>
        ${alreadyArchived > 0 ? `<div class="archive-stat archive-stat-done">
          <span class="archive-stat-value">${alreadyArchived}</span>
          <span class="archive-stat-label">Déjà archivés</span>
        </div>` : ''}
      </div>
      ${allDone ? `
        <div class="archive-already-done">
          <i class="fas fa-check-circle"></i> Période déjà entièrement archivée — aucune photo dans le stockage.
        </div>
      ` : `
        <div class="archive-action-row">
          <button class="btn btn-primary" id="btnGenPDF" onclick="doGenerateArchivePDF()">
            <i class="fas fa-file-pdf"></i> Générer le PDF (${vols.length} vols)
          </button>
          ${photoCount > 0 ? `
            <button class="btn btn-danger" onclick="confirmPurgePhotos()">
              <i class="fas fa-trash-can"></i> Purger ${photoCount} photo(s)
            </button>
          ` : ''}
        </div>
        <p class="archive-warning">
          <i class="fas fa-circle-info"></i>
          ${estMinutes > 2 ? `Durée estimée de génération du PDF : ~${estMinutes} min. ` : ''}
          <strong>Les deux boutons sont indépendants</strong> — la purge ne se déclenche jamais automatiquement après le PDF.
          ${photoCount === 0 ? ' Aucune photo à purger sur cette période.' : ''}
        </p>
      `}
      <div id="archivePdfProgress" style="display:none;" class="archive-progress-bar">
        <div id="archivePdfProgressInner"></div>
      </div>
    `;
  } catch (e) {
    body.innerHTML = `<p style="color:#f87171;">Erreur : ${e.message}</p>`;
  }
};

window.doGenerateArchivePDF = async function() {
  if (!archivePreviewData) return;
  if (!window.jspdf) { showToast('Bibliothèque PDF non chargée. Rechargez la page.', 'error'); return; }

  const btn = document.getElementById('btnGenPDF');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération…'; }

  const progress = document.getElementById('archivePdfProgress');
  const progressInner = document.getElementById('archivePdfProgressInner');
  if (progress) progress.style.display = 'block';

  try {
    const { vols, volIds, month, periodLabel } = archivePreviewData;
    const [first, last] = month.split('_');

    const updateProgress = (pct, msg) => {
      if (progressInner) progressInner.style.width = pct + '%';
      if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${msg}`;
    };

    updateProgress(10, 'Récupération des points de contrôle…');
    const controles = await fetchControlesForVols(volIds, 'id, zone, sous_zone, point_controle, conformite, observation, vol_id');

    updateProgress(25, 'Récupération des photos…');
    const { data: photos } = await supabase.from('photos').select('id, vol_id, controle_id, url_publique, storage_path').in('vol_id', volIds);

    updateProgress(35, 'Récupération des agents et matériels…');
    const { data: profiles } = await supabase.from('profiles').select('id, nom');
    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p.nom; });

    const MCHUNK = 50;
    const allMats = [];
    for (let i = 0; i < volIds.length; i += MCHUNK) {
      const { data } = await supabase.from('materiels_utilises').select('vol_id, categorie, nom_materiel, quantite, utilise').in('vol_id', volIds.slice(i, i + MCHUNK));
      if (data) allMats.push(...data);
    }
    const materielsParVol = {};
    allMats.forEach(m => { if (!materielsParVol[m.vol_id]) materielsParVol[m.vol_id] = []; materielsParVol[m.vol_id].push(m); });

    const controlesByVol = {};
    const photosByVol = {};
    controles.forEach(c => { if (!controlesByVol[c.vol_id]) controlesByVol[c.vol_id] = []; controlesByVol[c.vol_id].push(c); });
    (photos || []).forEach(p => { if (!photosByVol[p.vol_id]) photosByVol[p.vol_id] = []; photosByVol[p.vol_id].push(p); });

    updateProgress(45, `Génération du PDF (0/${vols.length} vols)…`);

    await buildArchivePDF(vols, controlesByVol, photosByVol, materielsParVol, profileMap, periodLabel, first, last, (i) => {
      const pct = 45 + Math.round((i / vols.length) * 50);
      updateProgress(pct, `Génération du PDF (${i}/${vols.length} vols)…`);
    });

    updateProgress(100, 'PDF téléchargé !');
    showToast('PDF généré et téléchargé avec succès.', 'success');
    setTimeout(() => { if (progress) progress.style.display = 'none'; }, 2000);

  } catch (e) {
    showToast('Erreur génération PDF : ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-pdf"></i> Générer le PDF'; }
  }
};

window.confirmPurgePhotos = function() {
  if (!archivePreviewData) return;
  const { photos, periodLabel } = archivePreviewData;
  const el = document.getElementById('purgeModalText');
  if (el) el.textContent = `Supprimer définitivement ${photos.length} photo(s) de la période ${periodLabel} du stockage cloud ?`;
  document.getElementById('modalConfirmPurge').style.display = 'flex';
};

window.doPurgePhotos = async function() {
  document.getElementById('modalConfirmPurge').style.display = 'none';
  if (!archivePreviewData) return;
  const { photos, volIds } = archivePreviewData;

  showToast(`Suppression de ${photos.length} photo(s)…`, 'info');

  try {
    // Delete from Storage
    const storagePaths = photos.map(p => p.storage_path).filter(Boolean);
    if (storagePaths.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < storagePaths.length; i += CHUNK) {
        await supabase.storage.from('photos-controle').remove(storagePaths.slice(i, i + CHUNK));
      }
    }

    // Delete rows from photos table
    const CHUNK = 20;
    for (let i = 0; i < volIds.length; i += CHUNK) {
      await supabase.from('photos').delete().in('vol_id', volIds.slice(i, i + CHUNK));
    }

    // Mark vols as archived
    for (let i = 0; i < volIds.length; i += CHUNK) {
      const { error } = await supabase.from('vols').update({ photos_archivees: true }).in('id', volIds.slice(i, i + CHUNK));
      if (error && !error.message?.includes('photos_archivees')) throw error;
    }

    showToast(`${photos.length} photos supprimées du stockage.`, 'success');
    archivePreviewData = null;
    archiveCurrentMonth = null;
    document.getElementById('archivePreviewSection').style.display = 'none';
    await loadArchiveHistory();

  } catch (e) {
    showToast('Erreur lors de la purge : ' + e.message, 'error');
  }
};

const MATERIEL_MASTER_ARCHIVE = {
  'Seaux toilettes': ['Torchon rouge','Chamoisine','Brosse de toilette','Serpillière','Eau javel','Netal 20/50'],
  'Seaux galley':    ['Torchon vert','Serpillière','Brosse galley','Decap four','Netal 20/50','Palette courte avec brosse'],
  'Seaux cabine':    ['Torchon bleu','Decap four','Brosse bay bay','Brosse tapis','Naga gumm','Nettoyant écran']
};

function loadImageBase64Archive(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 1200;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve({ b64: canvas.toDataURL('image/jpeg', 0.8), w, h });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function loadLogoBase64Archive() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = 'images/logo.png';
  });
}

async function fetchImageAsBase64(url) {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildArchivePDF(vols, controlesByVol, photosByVol, materielsParVol, profileMap, periodLabel, dateFrom, dateTo, onProgress) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, margin = 14;
  const pdfSafe = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/→/g, 'au').replace(/[—–]/g, '-');

  const fileName = `Controles_${dateFrom}_au_${dateTo}.pdf`;

  // === PAGE DE COUVERTURE ===
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 297, 'F');
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 118, W, 3, 'F');

  // Logo
  try {
    const logoB64 = await fetchImageAsBase64('images/logo.png');
    doc.addImage(logoB64, 'PNG', W / 2 - 15, 22, 30, 30);
  } catch (_) {
    // Logo non disponible — on affiche juste le texte
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(59, 130, 246);
    doc.text('RAM HANDLING', W / 2, 38, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(pdfSafe('RAM HANDLING - CONTROLE CABINES AVIONS'), W / 2, 60, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(248, 250, 252);
  doc.text("RAPPORT D'ARCHIVAGE", W / 2, 88, { align: 'center' });

  // Période encadrée
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(margin + 10, 96, W - (margin + 10) * 2, 18, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(59, 130, 246);
  doc.text('PÉRIODE', W / 2, 104, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(pdfSafe(periodLabel), W / 2, 110, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(pdfSafe(`Genere le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`), W / 2, 130, { align: 'center' });
  doc.text(pdfSafe(`${vols.length} vols controles`), W / 2, 138, { align: 'center' });

  // Blocs stats couverture
  const totalCtrl = Object.values(controlesByVol).reduce((s, a) => s + a.length, 0);
  const totalNC = Object.values(controlesByVol).reduce((s, a) => s + a.filter(c => c.conformite === 'NC').length, 0);
  const totalPhotos = Object.values(photosByVol).reduce((s, a) => s + a.length, 0);
  const tauxGlobal = totalCtrl > 0 ? Math.round(((totalCtrl - totalNC) / totalCtrl) * 100) : 0;

  const statsBlocks = [
    { val: vols.length, lbl: 'Vols' },
    { val: totalCtrl, lbl: 'Points vérifiés' },
    { val: totalNC, lbl: 'NC total' },
    { val: tauxGlobal + '%', lbl: 'Taux conformité' },
    { val: totalPhotos, lbl: 'Photos archivées' },
  ];
  const bW = 32, bH = 26, bGap = 3;
  const totalBW = statsBlocks.length * (bW + bGap) - bGap;
  const startX = (W - totalBW) / 2;
  const bY = 162;

  statsBlocks.forEach((b, i) => {
    const bx = startX + i * (bW + bGap);
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(bx, bY, bW, bH, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(59, 130, 246);
    doc.text(String(b.val), bx + bW / 2, bY + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(b.lbl, bx + bW / 2, bY + 20, { align: 'center' });
  });

  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text('Document confidentiel — Usage interne uniquement', W / 2, 285, { align: 'center' });

  // === LOGO (chargé une seule fois) ===
  const logoB64 = await loadLogoBase64Archive();

  const RED   = [190, 30, 45];
  const DKRED = [140, 20, 30];
  const GREY  = [245, 245, 245];
  const DGREY = [220, 220, 220];
  const BLACK = [30, 30, 30];
  const GREEN = [16, 185, 129];

  function isChecklistVol(vol) {
    return vol.source === 'app';
  }

  // === PAGES PAR VOL ===
  for (let vi = 0; vi < vols.length; vi++) {
    const vol = vols[vi];
    doc.addPage();

    const M = 10;
    const colW = W - 2 * M;
    const ctrl = controlesByVol[vol.id] || [];
    const volPhotos = photosByVol[vol.id] || [];
    const mats = materielsParVol[vol.id] || [];
    const agentNom = profileMap[vol.agent_id] || '—';
    const checklist = isChecklistVol(vol);

    // ── BANDEAU TITRE (même style que fiche agent) ──
    const headerH = 16;
    doc.setFillColor(...RED);
    doc.rect(M, M, colW, headerH, 'F');

    if (logoB64) {
      doc.addImage(logoB64, 'PNG', M + 3, M + 1.5, 38, 13);
    } else {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('RAM HANDLING', M + 4, M + 9);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(vol.type_vol || '—', W - M - 2, M + 7, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Fiche de Controle Cabine', W - M - 2, M + 13, { align: 'right' });

    let y = M + headerH + 3;

    // ── INFO VOL ──
    const fields = [
      { label: 'Date',            value: vol.date_vol || '—' },
      { label: 'N° Vol',          value: vol.numero_vol || '—' },
      { label: 'Immatriculation', value: vol.immatriculation || '—' },
      { label: 'Début',           value: (vol.heure_debut || '—') },
      { label: 'Fin',             value: (vol.heure_fin || '—') },
      { label: 'Agent',           value: agentNom }
    ];
    const fw = colW / fields.length;
    fields.forEach((f, i) => {
      const x = M + i * fw;
      doc.setFillColor(...DGREY);
      doc.rect(x, y, fw, 5, 'F');
      doc.setTextColor(...BLACK);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.text(f.label, x + fw / 2, y + 3.5, { align: 'center' });
      doc.setFillColor(255, 255, 255);
      doc.rect(x, y + 5, fw, 6, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(String(f.value), x + fw / 2, y + 9, { align: 'center' });
    });
    doc.setDrawColor(200, 200, 200);
    doc.rect(M, y, colW, 11, 'S');
    for (let i = 1; i < fields.length; i++) doc.line(M + i * fw, y, M + i * fw, y + 11);
    y += 14;

    const PAGE_H = 297, FOOTER_MARGIN = 15;
    function checkPageBreak(needed) {
      if (y + needed > PAGE_H - FOOTER_MARGIN) { doc.addPage(); y = M; }
    }

    if (checklist) {
      // ══ FORMAT CHECKLIST (vols saisis via l'app) ══
      const ctrlMap = {};
      ctrl.forEach(c => { ctrlMap[`${c.zone}|${c.sous_zone || ''}|${c.point_controle}`] = c; });

      // Photos par controle_id
      const photosMap = {};
      volPhotos.forEach(p => {
        if (p.controle_id) {
          if (!photosMap[p.controle_id]) photosMap[p.controle_id] = [];
          photosMap[p.controle_id].push(p);
        }
      });

      // Pré-charger images NC
      const ncPhotoImgs = {};
      for (const c of ctrl) {
        if (c.conformite === 'NC') {
          const ps = photosMap[c.id] || [];
          if (ps.length > 0) {
            const loaded = await Promise.all(ps.map(p => loadImageBase64Archive(p.url_publique)));
            ncPhotoImgs[c.id] = loaded.filter(Boolean);
          }
        }
      }

      const structure = getFicheStructure(vol.type_vol);
      const parties = [];
      let lastPartie = null;
      structure.forEach(sec => {
        const partieLabel = sec.partie === 'Client'
          ? 'PARTIE CLIENT'
          : sec.partie === 'Équipage'
            ? `PARTIE ÉQUIPAGE – ${sec.zone}${sec.sous_zone ? ' ' + sec.sous_zone : ''}`
            : sec.zone;
        if (partieLabel !== lastPartie) { parties.push({ label: partieLabel, sections: [] }); lastPartie = partieLabel; }
        parties[parties.length - 1].sections.push(sec);
      });

      const colZone  = 25, colPoint = 72, colConf = 22, colNbr = 22;
      const colObs   = colW - colZone - colPoint - colConf - colNbr;

      function drawSectionHeader(label) {
        checkPageBreak(7);
        doc.setFillColor(...DKRED);
        doc.rect(M, y, colW, 6, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(label, M + colW / 2, y + 4, { align: 'center' });
        y += 6;
      }

      function drawTableHeader() {
        checkPageBreak(6);
        doc.setFillColor(...GREY);
        doc.rect(M, y, colW, 5.5, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.setTextColor(...BLACK);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        let x = M;
        doc.text('Zone',              x + colZone / 2,  y + 3.8, { align: 'center' }); x += colZone;
        doc.text('Point de controle', x + colPoint / 2, y + 3.8, { align: 'center' }); x += colPoint;
        doc.text('Conforme',          x + colConf / 2,  y + 3.8, { align: 'center' }); x += colConf;
        doc.text('Non Conforme',      x + colNbr / 2,   y + 3.8, { align: 'center' }); x += colNbr;
        doc.text('Observations',      x + colObs / 2,   y + 3.8, { align: 'center' });
        y += 5.5;
      }

      function drawRow(zoneName, point, conf, obs, isShaded) {
        const rowH = 6;
        checkPageBreak(rowH);
        if (isShaded) { doc.setFillColor(...GREY); doc.rect(M, y, colW, rowH, 'F'); }
        doc.setDrawColor(220, 220, 220);
        doc.rect(M, y, colW, rowH, 'S');
        doc.setTextColor(...BLACK);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        let x = M;
        doc.text(zoneName, x + 2, y + 4);
        doc.line(x + colZone, y, x + colZone, y + rowH); x += colZone;
        doc.text(doc.splitTextToSize(point, colPoint - 3)[0], x + 2, y + 4);
        doc.line(x + colPoint, y, x + colPoint, y + rowH); x += colPoint;
        if (conf === 'C') {
          doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold');
          doc.text('C', x + colConf / 2, y + 4, { align: 'center' });
        } else {
          doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
          doc.text('—', x + colConf / 2, y + 4, { align: 'center' });
        }
        doc.setTextColor(...BLACK); doc.setFont('helvetica', 'normal');
        doc.line(x + colConf, y, x + colConf, y + rowH); x += colConf;
        if (conf === 'NC') {
          doc.setTextColor(239, 68, 68); doc.setFont('helvetica', 'bold');
          doc.text('NC', x + colNbr / 2, y + 4, { align: 'center' });
        } else {
          doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
          doc.text('—', x + colNbr / 2, y + 4, { align: 'center' });
        }
        doc.setTextColor(...BLACK); doc.setFont('helvetica', 'normal');
        doc.line(x + colNbr, y, x + colNbr, y + rowH); x += colNbr;
        if (obs) { doc.setFontSize(6.5); doc.text(doc.splitTextToSize(obs, colObs - 3)[0], x + 2, y + 4); }
        y += rowH;
      }

      parties.forEach(partie => {
        drawSectionHeader(partie.label);
        drawTableHeader();
        partie.sections.forEach(sec => {
          sec.points.forEach((point, idx) => {
            const c = ctrlMap[`${sec.zone}|${sec.sous_zone || ''}|${point}`];
            drawRow(
              idx === 0 ? (sec.sous_zone ? `${sec.zone} (${sec.sous_zone})` : sec.zone) : '',
              point, c?.conformite || '', c?.observation || '', idx % 2 === 1
            );
          });
        });
        y += 2;
      });

      // ── MATÉRIEL UTILISÉ ──
      if (mats.length > 0) {
        checkPageBreak(8);
        doc.setFillColor(...DKRED);
        doc.rect(M, y, colW, 6, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Materiel utilise', M + colW / 2, y + 4, { align: 'center' });
        y += 7;

        const aspRow    = mats.find(m => m.categorie === 'Nombre aspirateurs');
        const agentsRow = mats.find(m => m.categorie === 'Nombre agents');
        checkPageBreak(6);
        doc.setFillColor(...GREY);
        doc.rect(M, y, colW, 5.5, 'F');
        doc.setTextColor(...BLACK);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text(`Nombre aspirateurs : ${aspRow ? aspRow.quantite : 0}`, M + 4, y + 3.8);
        doc.text(`Nombre agents : ${agentsRow ? agentsRow.quantite : 0}`, M + colW / 2 + 4, y + 3.8);
        y += 7;

        const matsChecked = new Set(mats.filter(m => m.utilise).map(m => `${m.categorie}|${m.nom_materiel}`));
        const categories = Object.keys(MATERIEL_MASTER_ARCHIVE);
        const catCols = Math.floor(colW / categories.length);
        const startMatY = y;
        let maxRowY = startMatY;

        categories.forEach((cat, ci) => {
          const allItems = MATERIEL_MASTER_ARCHIVE[cat];
          const x = M + ci * catCols;
          checkPageBreak(6 + allItems.length * 5);
          doc.setFillColor(...DGREY);
          doc.rect(x, startMatY, catCols, 5.5, 'F');
          doc.setTextColor(...BLACK);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.text(cat, x + catCols / 2, startMatY + 3.8, { align: 'center' });
          let rowY = startMatY + 5.5;
          allItems.forEach((nom, mi) => {
            const checked = matsChecked.has(`${cat}|${nom}`);
            if (mi % 2 === 0) doc.setFillColor(252, 252, 252); else doc.setFillColor(...GREY);
            doc.rect(x, rowY, catCols, 5, 'F');
            if (checked) {
              doc.setFillColor(...GREEN);
              doc.circle(x + 4.5, rowY + 2.5, 1.8, 'F');
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(6);
              doc.setFont('helvetica', 'bold');
              doc.text('✓', x + 4.5, rowY + 3.1, { align: 'center' });
              doc.setTextColor(...BLACK);
              doc.setFontSize(6.5);
              doc.setFont('helvetica', 'bold');
              doc.text(nom, x + 8, rowY + 3.4);
            } else {
              doc.setDrawColor(200, 200, 200);
              doc.circle(x + 4.5, rowY + 2.5, 1.8, 'S');
              doc.setTextColor(180, 180, 180);
              doc.setFontSize(6.5);
              doc.setFont('helvetica', 'normal');
              doc.text(nom, x + 8, rowY + 3.4);
            }
            rowY += 5;
            if (rowY > maxRowY) maxRowY = rowY;
          });
        });
        y = maxRowY + 3;
      }

      // ── ANNEXE PHOTOS NC ──
      const ncWithPhotos = ctrl.filter(c => c.conformite === 'NC' && (ncPhotoImgs[c.id] || []).length > 0);
      if (ncWithPhotos.length > 0) {
        checkPageBreak(10);
        doc.setFillColor(...RED);
        doc.rect(M, y, colW, 6, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Annexe – Photos des anomalies', M + colW / 2, y + 4, { align: 'center' });
        y += 8;

        const structure2 = getFicheStructure(vol.type_vol);
        structure2.forEach(sec => {
          sec.points.forEach(point => {
            const c = ctrlMap[`${sec.zone}|${sec.sous_zone || ''}|${point}`];
            if (!c || c.conformite !== 'NC') return;
            const imgs = ncPhotoImgs[c.id] || [];
            if (!imgs.length) return;
            const sectionLabel = sec.sous_zone ? `${sec.zone} – ${sec.sous_zone}` : sec.zone;
            checkPageBreak(12);
            doc.setFillColor(255, 240, 240);
            doc.rect(M, y, colW, 7, 'F');
            doc.setDrawColor(...RED);
            doc.rect(M, y, colW, 7, 'S');
            doc.setTextColor(...RED);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.text(`${sectionLabel}  —  ${point}`, M + 3, y + 4.5);
            y += 7;
            if (c.observation) {
              checkPageBreak(6);
              doc.setFillColor(255, 248, 248);
              doc.rect(M, y, colW, 5, 'F');
              doc.setTextColor(100, 100, 100);
              doc.setFontSize(6.5);
              doc.setFont('helvetica', 'italic');
              doc.text(`Obs : ${doc.splitTextToSize(c.observation, colW - 6)[0]}`, M + 3, y + 3.5);
              y += 5;
            }
            const photoW = (colW - 4) / 2;
            const photoMaxH = 65;
            for (let i = 0; i < imgs.length; i += 2) {
              const rowImgs = [imgs[i], imgs[i + 1]].filter(Boolean);
              let rowH = 0;
              rowImgs.forEach(imgData => {
                const iH = Math.min(photoW / (imgData.w / imgData.h), photoMaxH);
                if (iH > rowH) rowH = iH;
              });
              checkPageBreak(rowH + 6);
              rowImgs.forEach((imgData, col) => {
                const x = M + col * (photoW + 4);
                const aspect = imgData.w / imgData.h;
                let iW = photoW, iH = photoW / aspect;
                if (iH > photoMaxH) { iH = photoMaxH; iW = photoMaxH * aspect; }
                doc.addImage(imgData.b64, 'JPEG', x, y, iW, iH);
                doc.setDrawColor(200, 200, 200);
                doc.rect(x, y, iW, iH, 'S');
                doc.setFontSize(6);
                doc.setTextColor(150, 150, 150);
                doc.setFont('helvetica', 'normal');
                doc.text(`Photo ${i + col + 1}`, x + 1, y + iH - 1);
              });
              y += rowH + 4;
            }
            y += 4;
          });
        });
      }

    } else {
      // ══ FORMAT TABLEAU PLAT (anciens vols / migration) ══
      if (ctrl.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Aucun point de controle enregistre pour ce vol.', M, y + 6);
      } else {
        doc.autoTable({
          startY: y,
          head: [['Zone', 'Point de contrôle', 'C/NC', 'Observation']],
          body: ctrl.map(c => [c.zone || '', c.point_controle || '', c.conformite || '—', (c.observation || '').substring(0, 120)]),
          styles: { fontSize: 6.5, cellPadding: 1.8, overflow: 'linebreak' },
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 7 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 68 },
            2: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
            3: { cellWidth: 71 }
          },
          didParseCell(data) {
            if (data.section === 'body' && data.column.index === 2) {
              if (data.cell.raw === 'NC') data.cell.styles.textColor = [220, 38, 38];
              else if (data.cell.raw === 'C') data.cell.styles.textColor = [22, 163, 74];
            }
          },
          margin: { left: M, right: M }
        });
        y = doc.lastAutoTable.finalY + 5;
      }

      // Photos brutes pour anciens vols
      if (volPhotos.length > 0) {
        checkPageBreak(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...BLACK);
        doc.text(`Photos (${volPhotos.length})`, M, y);
        y += 5;
        let x = M;
        const pW = 56, pH = 38, pGap = 3;
        const maxP = Math.min(volPhotos.length, 6);
        for (let pi = 0; pi < maxP; pi++) {
          try {
            const imgData = await loadImageBase64Archive(volPhotos[pi].url_publique);
            if (!imgData) continue;
            if (x + pW > W - M) { x = M; y += pH + pGap; }
            if (y + pH > PAGE_H - FOOTER_MARGIN) { doc.addPage(); y = M; x = M; }
            doc.addImage(imgData.b64, 'JPEG', x, y, pW, pH);
            x += pW + pGap;
          } catch (_) {}
        }
        if (volPhotos.length > maxP) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text(`+ ${volPhotos.length - maxP} photo(s) supplementaire(s)`, M, y + pH + 4);
        }
      }
    }

    if (onProgress) onProgress(vi + 1);
  }

  // ── PIED DE PAGE sur toutes les pages (sauf couverture) ──
  const pageCount = doc.getNumberOfPages();
  for (let p = 2; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...DGREY);
    doc.line(10, 285, W - 10, 285);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.setFont('helvetica', 'normal');
    doc.text('RAM HANDLING - Controle Cabine', 10, 290);
    doc.text(pdfSafe(`Genere le ${new Date().toLocaleDateString('fr-FR')}`), W - 10, 290, { align: 'right' });
    doc.text(`Page ${p - 1}/${pageCount - 1}`, W / 2, 290, { align: 'center' });
  }

  doc.save(fileName);
}

// ---- DÉMARRAGE ----

init();
