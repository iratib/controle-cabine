// ============================================================
// admin.js – Logique interface administrateur
// ============================================================

import { supabase, isDemoMode } from './supabase-client.js';
import { requireRole, logout } from './auth.js';
import { showToast, formatDate, getStatutBadge } from './utils.js';
import {
  demoGetVols, demoGetVol, demoGetControles, demoUpdateVol,
  demoGetAllControles, demoGetAgents, demoToggleAgent, demoCreateAgent
} from './demo-db.js';

const MONTH_NAMES_FULL = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

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
  loadDashboard();
  if (!isDemoMode) setupRealtime();
  setupModals();
  setupExport();

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
      else if (view === 'controles') loadTousControles();
      else if (view === 'par-agent') setupParAgent();
      else if (view === 'nc') loadNC();
      else if (view === 'agents') loadAgentsTable();
      else if (view === 'export') setupExportView();
      else if (view === 'analyse-mp') loadAnalyseType('MP');
      else if (view === 'analyse-gp') loadAnalyseType('GP');
      else if (view === 'sla-config')     loadSlaConfigView();
      else if (view === 'sla-conformite') loadSlaConformiteView();
      else if (view === 'compagnies') loadCompagniesView();
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
    'compagnies': 'Compagnies'
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
    const { data } = await supabase.from('compagnies').select('code, nom').eq('actif', true).order('code');
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
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  ['mp', 'gp'].forEach(prefix => {
    const fromEl = document.getElementById(`${prefix}FilterFrom`);
    const toEl   = document.getElementById(`${prefix}FilterTo`);
    const type   = prefix.toUpperCase();
    if (fromEl) { fromEl.value = lastMonth; }
    if (toEl)   { toEl.value   = lastMonth; }
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
  const loadingHtml = '<div class="loading-state">Chargement…</div>';
  ['chartVolsParAgent','chartConformiteZone','chartEvolution','chartDonutConformite',
   'chartStatuts','chartTypeVol','chartCompagnies','topNcList','activiteRecente'].forEach(id => {
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

    renderChartVolsParAgent(vols);
    renderChartZones(allControles);
    renderChartEvolution(period, fromDate, toDate, month, vols, allControles);
    renderChartDonutConformite(C, NC);
    renderChartStatuts(vols);
    renderChartTypeVol(vols, allControles);
    renderChartCompagnies(vols);
    renderTopNC(allControles);
    loadActiviteRecente();
    loadDashboardSla();
  } catch (err) {
    console.error('Dashboard error:', err);
  }
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
  const max = Math.max(...entries.map(([, c]) => c), 1);
  let html = '<div class="bar-chart-h">';
  entries.forEach(([nom, count]) => {
    const pct = Math.round((count / max) * 100);
    html += `<div class="bar-h-row">
      <div class="bar-h-label">${nom}</div>
      <div class="bar-h-track"><div class="bar-h-fill" style="width:${pct}%"></div></div>
      <div class="bar-h-value">${count}</div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderChartZones(controles) {
  const container = document.getElementById('chartConformiteZone');
  const zones = ['Cockpit', 'Cabine', 'Cabine ECO', 'Toilettes', 'Galley', 'Client', 'Premium Economy', 'CRC'];
  const zoneData = {};
  zones.forEach(z => { zoneData[z] = { C: 0, NC: 0 }; });
  controles.forEach(c => {
    if (zoneData[c.zone]) {
      zoneData[c.zone][c.conformite] = (zoneData[c.zone][c.conformite] || 0) + 1;
    }
  });

  let html = '<div class="bar-chart-h">';
  zones.forEach(zone => {
    const d = zoneData[zone];
    const total = d.C + d.NC;
    const taux = total > 0 ? Math.round((d.C / total) * 100) : 0;
    const color = taux >= 80 ? '#10b981' : taux >= 50 ? '#f59e0b' : '#ef4444';
    html += `
      <div class="bar-h-row">
        <div class="bar-h-label">${zone}</div>
        <div class="bar-h-track"><div class="bar-h-fill" style="width:${taux}%;background:${color}"></div></div>
        <div class="bar-h-value">${taux}%</div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderChartEvolution(period, fromDate, toDate, month, vols, controles) {
  const container = document.getElementById('chartEvolution');
  if (!vols || !vols.length) {
    container.innerHTML = '<div class="empty-state">Aucune donnée</div>';
    return;
  }

  // Choisir le regroupement selon la période
  const useMonth = period === 'all' || (!month && !fromDate);
  const useWeek  = period === '30' || (fromDate && !month);
  // Pour un mois sélectionné ou 7 jours → par jour

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

  container.innerHTML = `
    <div class="evol-db-wrap">
      <div class="evol-db-legend">
        <span><span class="evol-dot evol-dot-bar"></span> Inspections</span>
        <span><span class="evol-dot evol-dot-line"></span> Taux conformité (%)</span>
      </div>
      <div class="evol-db-label">Inspections réalisées</div>
      ${buildEvolBarSVG(data)}
      <div class="evol-db-label" style="margin-top:1rem;">Taux de conformité (%)</div>
      ${buildEvolLineSVG(data)}
    </div>`;
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
  const tauxC  = Math.round(C  / total * 100);
  const tauxNC = Math.round(NC / total * 100);
  container.innerHTML = `
    <div class="donut-wrap">
      <div class="donut-svg">${buildDonutSVG([{ count: C, color: '#10b981' }, { count: NC, color: '#ef4444' }])}</div>
      <div class="donut-legend">
        <div class="donut-legend-item"><span class="donut-dot" style="background:#10b981"></span>Conforme <strong>${C.toLocaleString('fr-FR')}</strong> <em>${tauxC}%</em></div>
        <div class="donut-legend-item"><span class="donut-dot" style="background:#ef4444"></span>Non conforme <strong>${NC.toLocaleString('fr-FR')}</strong> <em>${tauxNC}%</em></div>
      </div>
    </div>`;
}

function renderChartStatuts(vols) {
  const container = document.getElementById('chartStatuts');
  if (!container) return;
  if (!vols.length) { container.innerHTML = '<div class="empty-state">Aucune donnée</div>'; return; }
  const labels  = { en_cours: 'En cours', soumis: 'Soumis' };
  const colors  = { en_cours: '#f59e0b', soumis: '#3b82f6' };
  const counts  = { en_cours: 0, soumis: 0 };
  vols.forEach(v => { if (v.statut in counts) counts[v.statut]++; });
  const segments  = Object.entries(counts).map(([k, c]) => ({ count: c, color: colors[k] }));
  const legendHtml = Object.entries(counts).map(([k, c]) => `
    <div class="donut-legend-item">
      <span class="donut-dot" style="background:${colors[k]}"></span>${labels[k]} <strong>${c}</strong>
    </div>`).join('');
  container.innerHTML = `
    <div class="donut-wrap">
      <div class="donut-svg">${buildDonutSVG(segments)}</div>
      <div class="donut-legend">${legendHtml}</div>
    </div>`;
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
  let html = '<div class="bar-chart-h">';
  Object.entries(data).forEach(([group, d]) => {
    const total = d.C + d.NC;
    const taux  = total > 0 ? Math.round(d.C / total * 100) : 0;
    html += `<div class="bar-h-row">
      <div class="bar-h-label">${group}<br><small>${d.vols} vol${d.vols > 1 ? 's' : ''}</small></div>
      <div class="bar-h-track"><div class="bar-h-fill" style="width:${taux}%;background:${colorMap[group]}"></div></div>
      <div class="bar-h-value">${taux}%</div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderChartCompagnies(vols) {
  const container = document.getElementById('chartCompagnies');
  if (!container) return;
  const validCodes = new Set(allCompagnies.map(c => c.code));
  const counts = {};
  vols.forEach(v => {
    const cie = v.numero_vol?.match(/^[A-Z]+/)?.[0];
    if (cie && validCodes.has(cie)) counts[cie] = (counts[cie] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { container.innerHTML = '<div class="empty-state">Aucune donnée</div>'; return; }
  const max = Math.max(...entries.map(([, c]) => c), 1);
  let html = '<div class="bar-chart-h">';
  entries.forEach(([cie, count]) => {
    const pct = Math.round((count / max) * 100);
    html += `<div class="bar-h-row">
      <div class="bar-h-label">${cie}</div>
      <div class="bar-h-track"><div class="bar-h-fill" style="width:${pct}%;background:#6366f1"></div></div>
      <div class="bar-h-value">${count}</div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
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
    })
    .subscribe();
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
        const CHUNK = 50;
        const allCtrl = [];
        for (let i = 0; i < volIds.length; i += CHUNK) {
          const chunk = volIds.slice(i, i + CHUNK);
          const { data: ctrlData, error: ctrlError } = await supabase
            .from('controles')
            .select('vol_id, conformite')
            .in('vol_id', chunk);
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
          <td>${total}</td>
          <td>${C}</td>
          <td><span class="badge-nc-count">${NC}</span></td>
          <td>${taux !== '—' ? taux + '%' : '—'}</td>
          <td>${badge}</td>
          <td class="actions-cell">
            <button class="btn btn-outline btn-xs" onclick="adminViewFiche('${vol.id}', '${vol.numero_vol}', '${vol.date_vol}')">Voir</button>
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
  ['filterDateDe', 'filterDateA'].forEach(id => document.getElementById(id).value = '');
  loadTousControles();
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
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      'https://htkdryptzdvztcgjgfax.supabase.co/functions/v1/reset-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: agentId })
      }
    );
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erreur serveur');
    showToast(`Mot de passe de ${nom} réinitialisé à "CABINE".`, 'success', 4000);
  } catch (err) {
    showToast(err.message || 'Erreur réinitialisation', 'error');
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
  const now      = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2,'0')}`;
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
    const canonicalZones = new Set(structs.map(s => ZONE_CANON[s.zone] || s.zone));
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

// ---- COMPAGNIES ----

async function loadCompagniesView() {
  renderCieList();
  document.getElementById('formAddCie')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addCompagnie();
  });
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
    const { data, error } = await supabase.from('compagnies').select('*').order('code');
    if (error) { content.innerHTML = `<div class="empty-state">Erreur : ${error.message}</div>`; return; }
    rows = data || [];
  }

  if (countEl) countEl.textContent = `${rows.length} compagnie${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    content.innerHTML = '<div class="empty-state">Aucune compagnie enregistrée.</div>';
    return;
  }

  content.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Code</th><th>Nom complet</th><th style="text-align:center">Statut</th><th style="text-align:center">Actions</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td><span class="cie-code-badge">${r.code}</span></td>
            <td>${r.nom}</td>
            <td style="text-align:center">
              <span class="badge ${r.actif ? 'badge-ok' : 'badge-off'}">${r.actif ? 'Actif' : 'Inactif'}</span>
            </td>
            <td style="text-align:center">
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
}

async function addCompagnie() {
  const code = document.getElementById('cieCode').value.trim().toUpperCase();
  const nom  = document.getElementById('cieNom').value.trim();
  const btn  = document.getElementById('btnAddCie');
  if (!code || !nom) return;

  btn.disabled = true;
  if (!isDemoMode) {
    const { error } = await supabase.from('compagnies').insert({ code, nom, actif: true });
    if (error) {
      showToast(error.message.includes('unique') ? `Le code "${code}" existe déjà.` : error.message, 'error');
      btn.disabled = false; return;
    }
  }
  document.getElementById('cieCode').value = '';
  document.getElementById('cieNom').value  = '';
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
    if (btn) btn.onclick = () => loadSlaStats(type, S);
    loadSlaStats(type, S);
  });

  if (anchor) {
    const sectionId = anchor === 'transit' ? 'slaConformiteTransitSection' : 'slaConformiteStopSection';
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
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

async function loadSlaStats(typeFilter, suffix) {
  const content = document.getElementById(`slaStatsContent${suffix}`);
  content.innerHTML = '<div class="loading-state">Chargement…</div>';

  const mois = document.getElementById(`slaStatsMois${suffix}`)?.value || '';
  const range = mois ? monthToRange(mois) : null;

  let vols = [];
  if (isDemoMode) {
    vols = demoGetVols();
    if (range) vols = vols.filter(v => v.date_vol >= range.first && v.date_vol <= range.last);
  } else {
    let q = supabase
      .from('vols')
      .select('id, numero_vol, immatriculation, type_vol, date_vol, heure_debut, heure_fin, profiles(nom)')
      .order('date_vol');
    if (range) q = q.gte('date_vol', range.first).lte('date_vol', range.last);
    const all = [];
    let off = 0;
    while (true) {
      const { data: pg, error } = await q.range(off, off + 999);
      if (error) { content.innerHTML = `<div class="empty-state">Erreur : ${error.message}</div>`; return; }
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

  // Calcul conformité par type + collecte des vols hors SLA
  const activeTypes = SLA_STATS_TYPES.filter(t => t.filterType === typeFilter);
  const stats = {};
  activeTypes.forEach(t => {
    stats[t.key] = {
      key:     t.key,
      label:   t.label,
      sla:     getSlaForBroadType(t.key),
      agents:  slaConfigCache[t.key]?.nb_agents_nettoyage ?? 0,
      total: 0, avecDuree: 0, dansSla: 0, horsSla: 0,
      volsHorsSla: [],
    };
  });

  vols.forEach(v => {
    const s = stats[v.type_vol];
    if (!s) return;
    s.total++;
    if (!v.heure_debut || !v.heure_fin) return;
    const [hd, md] = v.heure_debut.split(':').map(Number);
    const [hf, mf] = v.heure_fin.split(':').map(Number);
    let duree = (hf * 60 + mf) - (hd * 60 + md);
    if (duree < 0) duree += 1440;
    s.avecDuree++;
    if (duree <= s.sla) {
      s.dansSla++;
    } else {
      s.horsSla++;
      s.volsHorsSla.push({ ...v, duree });
    }
  });

  const periodeLabel = range
    ? `${MONTH_NAMES_FULL[parseInt(mois.split('-')[1]) - 1]} ${mois.split('-')[0]}`
    : 'toute la période';

  const totalHorsSla = Object.values(stats).reduce((acc, s) => acc + s.horsSla, 0);

  // KPI cards
  const kpiHtml = Object.values(stats).map(s => {
    const taux = s.avecDuree > 0 ? (s.dansSla / s.avecDuree * 100).toFixed(1) : null;
    const color = taux === null ? '#94a3b8' : taux >= 90 ? '#22c55e' : taux >= 70 ? '#f59e0b' : '#ef4444';
    return `
      <div class="sla-kpi-card">
        <div class="sla-kpi-label">${s.label}</div>
        <div class="sla-kpi-value" style="color:${color}">${taux !== null ? taux + '%' : '—'}</div>
        <div class="sla-kpi-sub">conformité SLA (≤ ${s.sla} min)</div>
        <div class="sla-kpi-detail">${s.dansSla} / ${s.avecDuree} vols analysés</div>
      </div>`;
  }).join('');

  // Table récap
  const tableRows = Object.values(stats).map(s => {
    const taux = s.avecDuree > 0 ? (s.dansSla / s.avecDuree * 100).toFixed(1) + '%' : '—';
    const color = s.avecDuree === 0 ? '' : parseFloat(taux) >= 90 ? 'color:#22c55e' : parseFloat(taux) >= 70 ? 'color:#f59e0b' : 'color:#ef4444';
    const sansInfo = s.total - s.avecDuree;
    const btnHors = s.horsSla > 0
      ? `<button class="btn btn-outline btn-xs sla-voir-hors" data-type="${s.key}">
           <i class="fas fa-eye"></i> Voir (${s.horsSla})
         </button>`
      : `<span style="color:#94a3b8">—</span>`;
    return `
      <tr>
        <td>${s.label}</td>
        <td style="text-align:center">${s.sla} min</td>
        <td style="text-align:center">${s.agents}</td>
        <td style="text-align:center">${s.total}</td>
        <td style="text-align:center;color:#22c55e">${s.dansSla}</td>
        <td style="text-align:center">${btnHors}</td>
        <td style="text-align:center;color:#94a3b8">${sansInfo}</td>
        <td style="text-align:center;font-weight:600;${color}">${taux}</td>
      </tr>`;
  }).join('');

  // Table vols hors SLA (tous types confondus, masquée par défaut)
  const allHorsRows = Object.values(stats)
    .flatMap(s => s.volsHorsSla.map(v => ({ ...v, sla: s.sla, typeLabel: s.label })))
    .sort((a, b) => a.date_vol.localeCompare(b.date_vol));

  const horsTableRows = allHorsRows.map(v => {
    const ecart = v.duree - v.sla;
    return `
      <tr>
        <td>${formatDate(v.date_vol)}</td>
        <td><strong>${v.numero_vol || '—'}</strong></td>
        <td>${v.immatriculation || '—'}</td>
        <td>${v.typeLabel}</td>
        <td>${v.profiles?.nom || '—'}</td>
        <td style="text-align:center">${v.heure_debut?.slice(0,5)} → ${v.heure_fin?.slice(0,5)}</td>
        <td style="text-align:center;font-weight:600;color:#ef4444">${v.duree} min</td>
        <td style="text-align:center">${v.sla} min</td>
        <td style="text-align:center;color:#ef4444;font-weight:600">+${ecart} min</td>
      </tr>`;
  }).join('');

  content.innerHTML = `
    <div class="sla-kpi-grid">${kpiHtml}</div>

    <div class="card" style="margin-top:1.5rem;">
      <div class="card-header">
        <h3>Récapitulatif — ${periodeLabel}</h3>
        ${totalHorsSla > 0 ? `
        <button class="btn btn-danger btn-sm" id="btnToggleHorsSla_${suffix}">
          <i class="fas fa-triangle-exclamation"></i> Vols hors SLA (${totalHorsSla})
        </button>` : ''}
      </div>
      <div class="card-body" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>
            <th>Type de vol</th>
            <th style="text-align:center">SLA max</th>
            <th style="text-align:center">Agents requis</th>
            <th style="text-align:center">Total vols</th>
            <th style="text-align:center">Dans SLA</th>
            <th style="text-align:center">Hors SLA</th>
            <th style="text-align:center">Sans horaire</th>
            <th style="text-align:center">Conformité</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>

    <div id="slaHorsList_${suffix}" style="display:none;margin-top:1rem;">
      <div class="card sla-hors-card">
        <div class="card-header" style="background:rgba(239,68,68,.08);border-bottom:1px solid rgba(239,68,68,.2);">
          <h3 style="color:#ef4444"><i class="fas fa-triangle-exclamation"></i> Liste des vols hors SLA — ${periodeLabel}</h3>
          <button class="btn btn-outline btn-sm" id="btnFermerHorsSla_${suffix}"><i class="fas fa-xmark"></i> Fermer</button>
        </div>
        <div class="card-body" style="overflow-x:auto;">
          ${allHorsRows.length === 0 ? '<div class="empty-state">Aucun vol hors SLA</div>' : `
          <table class="data-table">
            <thead><tr>
              <th>Date</th><th>N° vol</th><th>Immat.</th><th>Type</th><th>Agent contrôle</th>
              <th style="text-align:center">Horaires</th>
              <th style="text-align:center">Durée réelle</th>
              <th style="text-align:center">SLA max</th>
              <th style="text-align:center">Dépassement</th>
            </tr></thead>
            <tbody>${horsTableRows}</tbody>
          </table>`}
        </div>
      </div>
    </div>

    <p class="sla-note"><i class="fas fa-circle-info"></i> <em>Sans horaire</em> = vols sans heure de début ou de fin enregistrée par l'agent de contrôle.</p>`;

  document.getElementById(`btnToggleHorsSla_${suffix}`)?.addEventListener('click', () => {
    const panel = document.getElementById(`slaHorsList_${suffix}`);
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById(`btnFermerHorsSla_${suffix}`)?.addEventListener('click', () => {
    document.getElementById(`slaHorsList_${suffix}`).style.display = 'none';
  });

  document.querySelectorAll('.sla-voir-hors').forEach(btn => {
    btn.addEventListener('click', () => {
      const typeKey = btn.dataset.type;
      const s = stats[typeKey];
      if (!s) return;

      const filteredRows = s.volsHorsSla
        .sort((a, b) => a.date_vol.localeCompare(b.date_vol))
        .map(v => {
          const ecart = v.duree - s.sla;
          return `
            <tr>
              <td>${formatDate(v.date_vol)}</td>
              <td><strong>${v.numero_vol || '—'}</strong></td>
              <td>${v.immatriculation || '—'}</td>
              <td>${s.label}</td>
              <td>${v.profiles?.nom || '—'}</td>
              <td style="text-align:center">${v.heure_debut?.slice(0,5)} → ${v.heure_fin?.slice(0,5)}</td>
              <td style="text-align:center;font-weight:600;color:#ef4444">${v.duree} min</td>
              <td style="text-align:center">${s.sla} min</td>
              <td style="text-align:center;color:#ef4444;font-weight:600">+${ecart} min</td>
            </tr>`;
        }).join('');

      const panel = document.getElementById(`slaHorsList_${suffix}`);
      panel.querySelector('tbody').innerHTML = filteredRows;
      panel.querySelector('h3').innerHTML =
        `<i class="fas fa-triangle-exclamation"></i> Vols hors SLA — ${s.label} — ${periodeLabel}`;
      panel.style.display = 'block';
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ---- WIDGET SLA GLOBAL (Dashboard) ----

async function loadDashboardSla() {
  const content = document.getElementById('slaGlobalContent');
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
        .select('type_vol, heure_debut, heure_fin')
        .order('date_vol')
        .range(off, off + 999);
      if (!pg || pg.length === 0) break;
      all.push(...pg);
      if (pg.length < 1000) break;
      off += 1000;
    }
    vols = all;
    // Charger la config SLA si pas encore en cache
    if (Object.keys(slaConfigCache).length === 0) {
      const { data } = await supabase.from('sla_config').select('*');
      (data || []).forEach(r => { slaConfigCache[r.type_vol] = r; });
    }
  }

  const groups = {
    transit: { label: 'Transit',  keys: ['Moyen Porteur Transit', 'Gros Porteur Transit'],   total: 0, dans: 0 },
    stop:    { label: 'Stop CMN', keys: ['Moyen Porteur Stop Cmn', 'Gros Porteur Stop Cmn'], total: 0, dans: 0 },
  };

  vols.forEach(v => {
    if (!v.heure_debut || !v.heure_fin) return;
    const grp = groups.transit.keys.includes(v.type_vol) ? groups.transit
              : groups.stop.keys.includes(v.type_vol)    ? groups.stop
              : null;
    if (!grp) return;
    const [hd, md] = v.heure_debut.split(':').map(Number);
    const [hf, mf] = v.heure_fin.split(':').map(Number);
    let duree = (hf * 60 + mf) - (hd * 60 + md);
    if (duree < 0) duree += 1440;
    const sla = getSlaForBroadType(v.type_vol);
    grp.total++;
    if (duree <= sla) grp.dans++;
  });

  const totalAll = groups.transit.total + groups.stop.total;
  const dansAll  = groups.transit.dans  + groups.stop.dans;
  const tauxAll  = totalAll > 0 ? (dansAll / totalAll * 100).toFixed(1) : null;
  const colorAll = tauxAll === null ? '#94a3b8' : tauxAll >= 90 ? '#22c55e' : tauxAll >= 70 ? '#f59e0b' : '#ef4444';

  const kpiCards = Object.entries(groups).map(([type, g]) => {
    const taux  = g.total > 0 ? (g.dans / g.total * 100).toFixed(1) : null;
    const color = taux === null ? '#94a3b8' : taux >= 90 ? '#22c55e' : taux >= 70 ? '#f59e0b' : '#ef4444';
    const icon  = type === 'transit' ? 'fa-gauge-high' : 'fa-circle-stop';
    return `
      <div class="sla-db-kpi">
        <div class="sla-db-kpi-label"><i class="fas ${icon}"></i> ${g.label}</div>
        <div class="sla-db-kpi-value" style="color:${color}">${taux !== null ? taux + '%' : '—'}</div>
        <div class="sla-db-kpi-sub">${g.dans} / ${g.total} vols</div>
        <a href="#" class="sla-db-link" data-anchor="${type}">Voir détail →</a>
      </div>`;
  }).join('');

  content.innerHTML = `
    <div class="sla-db-grid">
      ${kpiCards}
      <div class="sla-db-kpi sla-db-kpi-global">
        <div class="sla-db-kpi-label"><i class="fas fa-chart-pie"></i> Global</div>
        <div class="sla-db-kpi-value" style="color:${colorAll}">${tauxAll !== null ? tauxAll + '%' : '—'}</div>
        <div class="sla-db-kpi-sub">${dansAll} / ${totalAll} vols avec horaires</div>
        <a href="#" class="sla-db-link" data-anchor="">Voir tout →</a>
      </div>
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

// ---- DÉMARRAGE ----

init();
