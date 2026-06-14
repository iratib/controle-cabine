// ============================================================
// agent.js – Logique interface agent
// ============================================================

import { supabase, isDemoMode } from './supabase-client.js';
import { requireRole, logout } from './auth.js';
import { showToast, formatDate, getStatutBadge } from './utils.js';
import {
  demoCreateVol, demoGetVols, demoGetVol,
  demoGetControles, demoUpsertControle, demoUpdateVol
} from './demo-db.js';

// ---- DONNÉES DE RÉFÉRENCE : FICHES PAR TYPE DE VOL ----

const FICHE_STRUCTURES = {
  'Moyen Porteur Transit': [
    {
      zone: 'Cockpit', partie: 'Équipage', sous_zone: null, icon: '🛩',
      points: [
        'Sol propre (sans résidus, poussières)',
        'Tablettes pilotes propres',
        'Poubelles vidées',
        'Pare-brise intérieur essuyé',
        'Aucun objet oublié (FOD)'
      ]
    },
    {
      zone: 'Cabine', partie: 'Équipage', sous_zone: 'Y/CL', icon: '💺',
      points: [
        'Sièges propres et alignés (Rangée 8-9-10-17-18-19)',
        'Reste Sièges propres et alignés',
        'Ceintures croisées correctement (Rangée 8-9-10-17-18-19)',
        'Reste Ceintures croisées correctement',
        'Tablettes propres et fonctionnelles',
        'Poches sièges vides (Rangée 8-9-10-17-18-19)',
        'Reste Poches sièges vides',
        'Rideaux propres',
        'Coffres à bagages propres',
        'Moquette aspirée'
      ]
    },
    {
      zone: 'Cabine', partie: 'Équipage', sous_zone: 'C/CL', icon: '👑',
      points: [
        'Totalité Sièges et consoles propres',
        'Totalité Écrans sans traces',
        'Totalité Table repas propre',
        'Rideaux propres'
      ]
    },
    {
      zone: 'Toilettes', partie: null, sous_zone: null, icon: '🚽',
      points: [
        'Cuvette nettoyée et désinfectée',
        'Lunette toilette propre',
        'Lavabo propre et désinfecté',
        'Miroir propre',
        'Sol lavé et désinfecté',
        'Poubelle vidée',
        'Odeur neutre'
      ]
    },
    {
      zone: 'Galley', partie: null, sous_zone: null, icon: '🍽',
      points: [
        'Plans de travail nettoyés',
        'Tiroirs propres',
        'Sol nettoyé et sec',
        'Poubelles vidées',
        'Aucun reste alimentaire'
      ]
    },
    {
      zone: 'Client', partie: 'Client', sous_zone: null, icon: '🧑‍✈️',
      points: [
        'Propreté générale cabine satisfaisante',
        "Absence d'odeurs désagréables",
        'Tablettes sans traces',
        'Hublots propres',
        'Toilettes acceptables pour usage immédiat',
        'Aucun déchet visible',
        "Impression générale positive à l'embarquement"
      ]
    }
  ]
};

FICHE_STRUCTURES['Gros Porteur Transit'] = [
  {
    zone: 'Cockpit', partie: 'Équipage', sous_zone: null, icon: '🛩',
    points: [
      'Sol aspiré',
      'Sièges pilotes propres',
      'Tablettes et panneaux essuyés',
      'Poubelles vidées',
      'Aucun objet oublié'
    ]
  },
  {
    zone: 'Cabine', partie: 'Équipage', sous_zone: 'Y/CL', icon: '💺',
    points: [
      'Sièges propres (dossier, accoudoirs Rangee 10-11-12-28-29)',
      'Reste Sièges propres et alignés',
      'Tablettes propres',
      'Écrans nettoyés',
      'Ceintures croisées (Rangee 10-11-12-28-29)',
      'Reste Ceintures croisées correctement',
      'Poches sièges vides (Rangee 10-11-12-28-29)',
      'Reste Poches sièges vides',
      'Moquette aspirée'
    ]
  },
  {
    zone: 'Cabine', partie: 'Équipage', sous_zone: 'C/CL', icon: '👑',
    points: [
      'Totalité Sièges propres',
      'Totalité Écrans sans traces',
      'Totalité Table repas propre',
      'Espaces personnels nettoyés',
      'Rideaux propres'
    ]
  },
  {
    zone: 'Premium Economy', partie: 'Équipage', sous_zone: null, icon: '⭐',
    points: [
      'Siège et repose pieds propres'
    ]
  },
  {
    zone: 'CRC', partie: 'Équipage', sous_zone: null, icon: '🛌',
    points: [
      'Avant (PNT)',
      'Arrière (PNC)'
    ]
  },
  {
    zone: 'Toilettes', partie: null, sous_zone: null, icon: '🚽',
    points: [
      'Nettoyage complet et désinfection',
      'Sol lavé et sec',
      'Lavabo et robinetterie propres',
      'Table à langer propre',
      'Poubelles vidées',
      'Produits consommables en place'
    ]
  },
  {
    zone: 'Galley', partie: null, sous_zone: null, icon: '🍽',
    points: [
      'Plans de travail désinfectés',
      'Compartiments propres',
      'Sol lavé et désinfecté',
      'Poubelles vidées',
      'Aucun reste catering'
    ]
  },
  {
    zone: 'Client', partie: 'Client', sous_zone: null, icon: '🧑‍✈️',
    points: [
      'Cabine visuellement propre',
      "Absence totale d'odeurs",
      'Sièges confortables et propres',
      'Écrans propres et lisibles',
      "Toilettes propres à l'embarquement",
      'Galley discret et propre',
      'Niveau de propreté conforme long-courrier'
    ]
  }
];

FICHE_STRUCTURES['Moyen Porteur Stop Cmn'] = [
  {
    zone: 'Cockpit', partie: 'Équipage', sous_zone: null, icon: '🛩',
    points: [
      'Sol propre (sans résidus, poussières)',
      'Tablettes pilotes propres',
      'Poubelles vidées',
      'Pare-brise intérieur essuyé',
      'Aucun objet oublié (FOD)'
    ]
  },
  {
    zone: 'Cabine', partie: 'Équipage', sous_zone: 'Y/CL', icon: '💺',
    points: [
      'Totalité Sièges propres et alignés',
      'Totalité Ceintures croisées correctement',
      'Totalité Tablettes propres et fonctionnelles',
      'Totalité Poches sièges vides',
      'Rideaux propres',
      'Coffres à bagages propres',
      'Moquette aspirée'
    ]
  },
  {
    zone: 'Cabine', partie: 'Équipage', sous_zone: 'C/CL', icon: '👑',
    points: [
      'Totalité Sièges et consoles propres',
      'Totalité Écrans sans traces',
      'Totalité Table repas propre',
      'Espaces personnels nettoyés',
      'Rideaux propres'
    ]
  },
  {
    zone: 'Toilettes', partie: null, sous_zone: null, icon: '🚽',
    points: [
      'Cuvette nettoyée et désinfectée',
      'Lunette toilette propre',
      'Lavabo propre et désinfecté',
      'Miroir propre',
      'Sol lavé et désinfecté',
      'Poubelle vidée',
      'Odeur neutre'
    ]
  },
  {
    zone: 'Galley', partie: null, sous_zone: null, icon: '🍽',
    points: [
      'Plans de travail nettoyés',
      'Tiroirs propres',
      'Sol nettoyé et sec',
      'Poubelles vidées',
      'Aucun reste alimentaire'
    ]
  },
  {
    zone: 'Client', partie: 'Client', sous_zone: null, icon: '🧑‍✈️',
    points: [
      'Propreté générale cabine satisfaisante',
      "Absence d'odeurs désagréables",
      'Tablettes sans traces',
      'Hublots propres',
      'Toilettes acceptables pour usage immédiat',
      'Aucun déchet visible',
      "Impression générale positive à l'embarquement"
    ]
  }
];

FICHE_STRUCTURES['Gros Porteur Stop Cmn'] = [
  {
    zone: 'Cockpit', partie: 'Équipage', sous_zone: null, icon: '🛩',
    points: [
      'Sol aspiré',
      'Sièges pilotes propres',
      'Tablettes et panneaux essuyés',
      'Poubelles vidées',
      'Aucun objet oublié'
    ]
  },
  {
    zone: 'Cabine ECO', partie: 'Équipage', sous_zone: null, icon: '💺',
    points: [
      'Sièges propres (dossier, accoudoirs)',
      'Totalité Tablettes propres',
      'Totalité Écrans nettoyés',
      'Totalité Ceintures croisées',
      'Totalité Poches sièges vides',
      'Moquette aspirée'
    ]
  },
  {
    zone: 'Premium Economy', partie: 'Équipage', sous_zone: null, icon: '⭐',
    points: [
      'Totalité Siège et repose pieds propres'
    ]
  },
  {
    zone: 'Cabine', partie: 'Équipage', sous_zone: 'C/CL', icon: '👑',
    points: [
      'Totalité Sièges propres',
      'Totalité Écrans sans traces',
      'Totalité Table repas propre',
      'Espaces personnels nettoyés',
      'Rideaux propres'
    ]
  },
  {
    zone: 'CRC', partie: 'Équipage', sous_zone: null, icon: '🛌',
    points: [
      'Avant (PNT)',
      'Arrière (PNC)'
    ]
  },
  {
    zone: 'Toilettes', partie: null, sous_zone: null, icon: '🚽',
    points: [
      'Nettoyage complet et désinfection',
      'Sol lavé et sec',
      'Lavabo et robinetterie propres',
      'Table à langer propre',
      'Poubelles vidées',
      'Produits consommables en place'
    ]
  },
  {
    zone: 'Galley', partie: null, sous_zone: null, icon: '🍽',
    points: [
      'Plans de travail désinfectés',
      'Compartiments propres',
      'Sol lavé et désinfecté',
      'Poubelles vidées',
      'Aucun reste catering'
    ]
  },
  {
    zone: 'Client', partie: 'Client', sous_zone: null, icon: '🧑‍✈️',
    points: [
      'Cabine visuellement propre',
      "Absence totale d'odeurs",
      'Sièges confortables et propres',
      'Écrans propres et lisibles',
      "Toilettes propres à l'embarquement",
      'Galley discret et propre',
      'Niveau de propreté conforme long-courrier'
    ]
  }
];

function getFicheStructure(typeVol) {
  return FICHE_STRUCTURES[typeVol] || FICHE_STRUCTURES['Moyen Porteur Transit'];
}
function getTotalPoints(typeVol) {
  return getFicheStructure(typeVol).reduce((acc, s) => acc + s.points.length, 0);
}

// ---- STATE ----

let currentUser = null;
let currentVolId = null;
let currentTypeVol = null;
let controles = {}; // clé = "zone|sous_zone|point", valeur = { conformite, observation, controle_id }
let autosaveTimeout = null;
let isOffline = false;

// ---- RÉFÉRENTIEL SLA ----
const SLA_CATEGORIES_TRANSIT = [
  { key: 'transit_cat2', label: 'Catégorie II',  seats: '≤ 41 sièges',      avions: ['M81','M87','AR1','CRJ'],            slaMin: 10, slaMax: 12, agents: { cabine: 2,  galley: 1, sanitaire: 1, aspirateur: 0 } },
  { key: 'transit_cat3', label: 'Catégorie III', seats: '42 – 90 sièges',   avions: ['AT7'],                              slaMin: 10, slaMax: 12, agents: { cabine: 2,  galley: 1, sanitaire: 1, aspirateur: 0 } },
  { key: 'transit_cat4', label: 'Catégorie IV',  seats: '91 – 120 sièges',  avions: ['B73G','E190','CRJ1000'],            slaMin: 15, slaMax: 17, agents: { cabine: 5,  galley: 1, sanitaire: 1, aspirateur: 1 } },
  { key: 'transit_cat5', label: 'Catégorie V',   seats: '121 – 200 sièges', avions: ['B738','A321','A320','A319'],        slaMin: 15, slaMax: 17, agents: { cabine: 5,  galley: 1, sanitaire: 1, aspirateur: 1 } },
  { key: 'transit_cat6', label: 'Catégorie VI',  seats: '201 – 350 sièges', avions: ['B787','B767','B777','A330','A340'], slaMin: 30, slaMax: 35, agents: { cabine: 10, galley: 2, sanitaire: 2, aspirateur: 2 } },
  { key: 'transit_cat7', label: 'Catégorie VII', seats: '> 351 sièges',     avions: ['A380','B744'],                     slaMin: 30, slaMax: 35, agents: { cabine: 15, galley: 4, sanitaire: 4, aspirateur: 4 } },
];
const SLA_CATEGORIES_STOP = [
  { key: 'stop_cat2', label: 'Catégorie II',  seats: '≤ 41 sièges',      avions: ['M81','M87','AR1','CRJ'],            slaMin: 15, slaMax: 18, agents: { cabine: 2,  galley: 1, sanitaire: 1, aspirateur: 0 } },
  { key: 'stop_cat3', label: 'Catégorie III', seats: '42 – 90 sièges',   avions: ['AT7'],                              slaMin: 15, slaMax: 18, agents: { cabine: 2,  galley: 1, sanitaire: 1, aspirateur: 0 } },
  { key: 'stop_cat4', label: 'Catégorie IV',  seats: '91 – 120 sièges',  avions: ['B73G','E190','CRJ1000'],            slaMin: 25, slaMax: 28, agents: { cabine: 5,  galley: 1, sanitaire: 1, aspirateur: 1 } },
  { key: 'stop_cat5', label: 'Catégorie V',   seats: '121 – 200 sièges', avions: ['B738','A321','A320','A319'],        slaMin: 25, slaMax: 28, agents: { cabine: 5,  galley: 1, sanitaire: 1, aspirateur: 1 } },
  { key: 'stop_cat6', label: 'Catégorie VI',  seats: '201 – 350 sièges', avions: ['B787','B767','B777','A330','A340'], slaMin: 45, slaMax: 50, agents: { cabine: 10, galley: 2, sanitaire: 2, aspirateur: 2 } },
  { key: 'stop_cat7', label: 'Catégorie VII', seats: '> 351 sièges',     avions: ['A380','B744'],                     slaMin: 45, slaMax: 50, agents: { cabine: 15, galley: 4, sanitaire: 4, aspirateur: 4 } },
];
let agentSlaCache = {};

// ---- INIT ----

async function init() {
  const auth = await requireRole('agent');
  if (!auth) return;
  currentUser = auth.profile;

  // Sidebar
  document.getElementById('agentNom').textContent = currentUser.nom;
  const initials = currentUser.nom.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const sidebarAv = document.getElementById('sidebarAvatar');
  if (sidebarAv) sidebarAv.textContent = initials;
  // Topbar
  const nomTopbar = document.getElementById('agentNomTopbar');
  if (nomTopbar) nomTopbar.textContent = currentUser.nom;
  const topbarAv = document.getElementById('topbarAvatar');
  if (topbarAv) topbarAv.textContent = initials;
  document.getElementById('btnLogout').addEventListener('click', logout);

  // Date par défaut = aujourd'hui
  document.getElementById('dateVol').valueAsDate = new Date();

  setupNavigation();
  setupChangerMdp();
  setupMesControlesTabs();
  await loadCompagniesSelect();
  setupFormEntete();
  setupOfflineDetection();
  loadMesControles();
  updateBadgeEnCours();

  // Sidebar mobile
  document.getElementById('btnMenu').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('sidebar-open');
  });
}

// ---- CHANGER MOT DE PASSE ----

function setupChangerMdp() {
  const modal   = document.getElementById('modalChangerMdp');
  const errEl   = document.getElementById('mdpModalError');
  const btnOpen = document.getElementById('btnMonCompte');
  const btnAnn  = document.getElementById('btnAnnulerMdp');
  const btnConf = document.getElementById('btnConfirmerMdp');

  btnOpen?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('mdpNouveauField').value  = '';
    document.getElementById('mdpConfirmField').value  = '';
    errEl.style.display = 'none';
    modal.style.display = 'flex';
    document.getElementById('sidebar').classList.remove('sidebar-open');
  });

  btnAnn?.addEventListener('click', () => { modal.style.display = 'none'; });

  btnConf?.addEventListener('click', async () => {
    const nouveau  = document.getElementById('mdpNouveauField').value.trim();
    const confirm  = document.getElementById('mdpConfirmField').value.trim();
    errEl.style.display = 'none';

    if (!nouveau || nouveau.length < 6) {
      errEl.textContent = 'Le mot de passe doit contenir au moins 6 caractères.';
      errEl.style.display = 'block'; return;
    }
    if (nouveau !== confirm) {
      errEl.textContent = 'Les deux mots de passe ne correspondent pas.';
      errEl.style.display = 'block'; return;
    }

    const btnText    = document.getElementById('btnConfirmerMdpText');
    const btnSpinner = document.getElementById('btnConfirmerMdpSpinner');
    btnConf.disabled = true;
    btnText.style.display    = 'none';
    btnSpinner.style.display = 'inline';

    try {
      const { error } = await supabase.auth.updateUser({ password: nouveau });
      if (error) throw error;
      modal.style.display = 'none';
      showToast('Mot de passe modifié avec succès.', 'success', 4000);
    } catch (err) {
      errEl.textContent = err.message || 'Erreur lors du changement de mot de passe.';
      errEl.style.display = 'block';
    } finally {
      btnConf.disabled = false;
      btnText.style.display    = 'inline';
      btnSpinner.style.display = 'none';
    }
  });
}

// ---- NAVIGATION ----

function setupNavigation() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      showView(view);
      document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.getElementById('sidebar').classList.remove('sidebar-open');
    });
  });
}

function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  if (viewName === 'nouveau') {
    document.getElementById('viewNouveau').style.display = 'block';
  } else if (viewName === 'mes-controles') {
    document.getElementById('viewMesControles').style.display = 'block';
    mcCurrentPage = 0;
    mcCurrentPeriod = 'today';
    document.querySelectorAll('.mc-tab').forEach(t => t.classList.toggle('active', t.dataset.period === 'today'));
    loadMesControles();
  } else if (viewName === 'sla') {
    document.getElementById('viewSla').style.display = 'block';
    loadAgentSlaView();
  }
}

// ---- PROCÉDURES SLA (lecture seule) ----

async function loadAgentSlaView() {
  if (Object.keys(agentSlaCache).length === 0 && !isDemoMode) {
    const { data } = await supabase.from('sla_config').select('*');
    (data || []).forEach(r => { agentSlaCache[r.type_vol] = r; });
  }
  renderAgentSlaGrid(SLA_CATEGORIES_TRANSIT, 'agentSlaGridTransit', 'Transit');
  renderAgentSlaGrid(SLA_CATEGORIES_STOP,    'agentSlaGridStop',    'Stop');
}

function renderAgentSlaGrid(cats, gridId, suffix) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  grid.innerHTML = cats.map(t => {
    const cached     = agentSlaCache[t.key] || {};
    const slaMax     = cached.sla_minutes     ?? t.slaMax;
    const slaMin     = t.slaMin;
    const cabine     = t.agents.cabine;
    const galley     = t.agents.galley;
    const sanitaire  = t.agents.sanitaire;
    const aspirateur = t.agents.aspirateur;
    const total      = cached.nb_agents_nettoyage ?? (cabine + galley + sanitaire + aspirateur);

    const avionTags = t.avions.map(a => `<span class="sla-avion-tag">${a}</span>`).join('');

    return `
      <div class="sla-cat-card sla-cat-card-readonly">
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
            <div class="sla-cat-section-label"><i class="fas fa-clock"></i> Durée SLA ${suffix === 'Transit' ? 'Transit' : 'Stop CMN'}</div>
            <div class="sla-readonly-range">
              <span class="sla-readonly-val">${slaMin}</span>
              <span class="sla-range-sep">→</span>
              <span class="sla-readonly-val">${slaMax}</span>
              <span class="sla-unit">min</span>
            </div>
          </div>

          <div class="sla-cat-section">
            <div class="sla-cat-section-label"><i class="fas fa-users"></i> Agents requis</div>
            <div class="sla-agents-breakdown">
              <div class="sla-agent-row">
                <span class="sla-agent-label">Cabine</span>
                <span class="sla-readonly-count">${cabine}</span>
                <span class="sla-unit">ag.</span>
              </div>
              <div class="sla-agent-row">
                <span class="sla-agent-label">Galley</span>
                <span class="sla-readonly-count">${galley}</span>
                <span class="sla-unit">ag.</span>
              </div>
              <div class="sla-agent-row">
                <span class="sla-agent-label">Sanitaire</span>
                <span class="sla-readonly-count">${sanitaire}</span>
                <span class="sla-unit">ag.</span>
              </div>
              <div class="sla-agent-row">
                <span class="sla-agent-label">Aspirateur + J</span>
                <span class="sla-readonly-count">${aspirateur}</span>
                <span class="sla-unit">ag.</span>
              </div>
              <div class="sla-agents-total-row">
                <span>Total</span>
                <span class="sla-total-value">${total}</span>
                <span class="sla-unit">agents</span>
              </div>
            </div>
          </div>

        </div>
      </div>`;
  }).join('');
}

// ---- COMPAGNIES ----

async function loadCompagniesSelect() {
  const sel = document.getElementById('codeCompagnie');
  if (!sel) return;

  let codes = [];
  if (isDemoMode) {
    codes = [{ code: 'AT', nom: 'Royal Air Maroc' }, { code: 'AF', nom: 'Air France' }];
  } else {
    const { data } = await supabase
      .from('compagnies')
      .select('code, nom')
      .eq('actif', true)
      .order('code');
    codes = data || [];
  }

  sel.innerHTML = '<option value="">— Sélectionner —</option>';
  codes.forEach(c => {
    const o = document.createElement('option');
    o.value = c.code;
    o.textContent = `${c.code} — ${c.nom}`;
    sel.appendChild(o);
  });

  if (codes.length === 0) {
    const o = document.createElement('option');
    o.value = ''; o.disabled = true;
    o.textContent = 'Aucune compagnie configurée';
    sel.appendChild(o);
  }
}

// ---- TIME PICKER HELPERS ----

function buildTimePicker(containerId, prefix) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  const hSel = document.createElement('select');
  hSel.id = prefix + 'H';
  hSel.className = 'time-sel';
  hSel.innerHTML = '<option value="">HH</option>';
  for (let h = 0; h < 24; h++) {
    const v = String(h).padStart(2, '0');
    hSel.innerHTML += `<option value="${v}">${v}</option>`;
  }

  const colon = document.createElement('span');
  colon.className = 'time-colon';
  colon.textContent = ':';

  const mSel = document.createElement('select');
  mSel.id = prefix + 'M';
  mSel.className = 'time-sel';
  mSel.innerHTML = '<option value="">MM</option>';
  for (let m = 0; m < 60; m += 5) {
    const v = String(m).padStart(2, '0');
    mSel.innerHTML += `<option value="${v}">${v}</option>`;
  }

  wrap.appendChild(hSel);
  wrap.appendChild(colon);
  wrap.appendChild(mSel);
}

function getTimePicker(prefix) {
  const h = document.getElementById(prefix + 'H')?.value;
  const m = document.getElementById(prefix + 'M')?.value;
  return (h && m) ? `${h}:${m}` : null;
}

function setTimePicker(prefix, value) {
  const hEl = document.getElementById(prefix + 'H');
  const mEl = document.getElementById(prefix + 'M');
  if (!hEl || !mEl) return;
  if (!value) { hEl.value = ''; mEl.value = ''; return; }
  const [hh, mm] = value.split(':');
  hEl.value = hh || '';
  const mmNum = parseInt(mm || '0');
  const rounded = String(Math.round(mmNum / 5) * 5 % 60).padStart(2, '0');
  mEl.value = rounded;
}

// ---- FORMULAIRE EN-TÊTE ----

function setupFormEntete() {
  // Construire les time pickers
  buildTimePicker('heureDebutPicker', 'heureDebut');
  buildTimePicker('heureFinPicker', 'heureFin');

  // Verrouiller le reste du formulaire jusqu'à la sélection du type de vol
  const formGrid = document.getElementById('formGrid');
  if (formGrid) formGrid.classList.add('locked');

  // Sélection du type de vol via cartes
  document.querySelectorAll('.type-vol-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.type-vol-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      document.getElementById('typeVol').value = card.dataset.value;
      // Déverrouiller et focus sur le premier champ
      if (formGrid) formGrid.classList.remove('locked');
      document.getElementById('dateVol').focus();
    });
  });

  // Numéro de vol : chiffres seulement, max 4
  document.getElementById('numeroVol').addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '').substring(0, 4);
  });

  // Effacer heureFin si identique à heureDebut (durée nulle)
  ['heureDebutH', 'heureDebutM'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      const debut = getTimePicker('heureDebut');
      const fin = getTimePicker('heureFin');
      if (debut && fin && fin === debut) setTimePicker('heureFin', null);
    });
  });

  // Immatriculation : comportement différencié selon code cie
  const codeCompagnieEl = document.getElementById('codeCompagnie');
  const immatEl         = document.getElementById('immatriculation');
  const immatSelEl      = document.getElementById('immatriculationSelect');
  const typeAvionGroup  = document.getElementById('typeAvionGroup');
  const typeAvionEl     = document.getElementById('typeAvion');

  function isAT() {
    return codeCompagnieEl.value.trim().toUpperCase() === 'AT';
  }

  function showATMode() {
    typeAvionGroup.style.display = '';
    immatEl.style.display        = 'none';
    immatSelEl.style.display     = '';
    immatSelEl.innerHTML = '<option value="">— Choisir un type avion d\'abord —</option>';
    typeAvionEl.value = '';
  }

  function hideATMode() {
    typeAvionGroup.style.display = 'none';
    typeAvionEl.value            = '';
    immatEl.style.display        = '';
    immatSelEl.style.display     = 'none';
    if (immatEl.value === 'CN-') immatEl.value = '';
    immatEl.placeholder = 'ex: CN-RGT';
  }

  codeCompagnieEl.addEventListener('change', function () {
    if (isAT()) {
      showATMode();
      document.getElementById('numeroVol').focus();
    } else {
      hideATMode();
    }
  });

  // Chargement des immatriculations selon le type avion sélectionné
  typeAvionEl.addEventListener('change', async function () {
    const type = this.value;
    if (!type) {
      immatSelEl.innerHTML = '<option value="">— Choisir un type avion d\'abord —</option>';
      return;
    }
    immatSelEl.innerHTML = '<option value="">Chargement…</option>';
    let items = [];
    if (!isDemoMode) {
      const { data } = await supabase.from('immatriculations')
        .select('immatriculation')
        .eq('type_avion', type)
        .eq('actif', true)
        .order('immatriculation');
      items = data || [];
    }
    if (!items.length) {
      immatSelEl.innerHTML = '<option value="">Aucune immatriculation configurée</option>';
    } else {
      immatSelEl.innerHTML = '<option value="">— Sélectionner —</option>';
      items.forEach(r => {
        const o = document.createElement('option');
        o.value = r.immatriculation;
        o.textContent = r.immatriculation;
        immatSelEl.appendChild(o);
      });
    }
  });

  // Formatage immatriculation libre (non-AT)
  immatEl.addEventListener('input', function () {
    const letters = this.value.toUpperCase().replace(/[^A-Z]/g, '');
    if (letters.length <= 2) {
      this.value = letters;
    } else {
      this.value = letters.substring(0, 2) + '-' + letters.substring(2, 5);
    }
  });

  document.getElementById('formEntete').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dateVol = document.getElementById('dateVol').value;
    const codeCompagnie = document.getElementById('codeCompagnie').value.trim().toUpperCase();
    const numeroVolRaw = document.getElementById('numeroVol').value.trim().toUpperCase();
    const numeroVol = codeCompagnie + numeroVolRaw;
    const typeVol = document.getElementById('typeVol').value;
    const heureDebut = getTimePicker('heureDebut');

    // Lecture immatriculation et type_avion selon mode AT ou non
    const modeAT = codeCompagnie === 'AT';
    const typeAvionVal = modeAT ? (document.getElementById('typeAvion').value || null) : null;
    const immatriculation = modeAT
      ? (document.getElementById('immatriculationSelect').value.trim() || null)
      : (document.getElementById('immatriculation').value.trim() || null);

    if (!typeVol) {
      showToast('Veuillez sélectionner le type de vol.', 'error');
      return;
    }
    if (!dateVol || !codeCompagnie || !numeroVolRaw) {
      showToast('Veuillez remplir les champs obligatoires (date, code cie, numéro de vol).', 'error');
      return;
    }
    if (modeAT && !typeAvionVal) {
      showToast('Veuillez sélectionner le type avion.', 'error');
      return;
    }
    if (modeAT && !immatriculation) {
      showToast('Veuillez sélectionner l\'immatriculation.', 'error');
      return;
    }

    // Afficher le rappel heure début dans la zone de soumission
    document.getElementById('rappelHeureDebut').textContent = heureDebut || '—';
    setTimePicker('heureFin', null);

    const btn = document.getElementById('btnCommencer');
    btn.disabled = true;
    btn.textContent = 'Création…';

    try {
      if (isDemoMode) {
        const vol = demoCreateVol({
          numero_vol: numeroVol,
          date_vol: dateVol,
          type_vol: typeVol,
          type_avion: typeAvionVal,
          immatriculation: immatriculation || null,
          heure_debut: heureDebut,
          agent_id: 'demo',
          statut: 'en_cours'
        });
        currentVolId = vol.id;
        controles = {};
        showToast('Vol créé. Fiche de contrôle ouverte.', 'success');
        afficherFiche(vol);
        updateBadgeEnCours();
        return;
      }

      const { data: vol, error } = await supabase.from('vols').insert({
        numero_vol: numeroVol,
        date_vol: dateVol,
        type_vol: typeVol,
        type_avion: typeAvionVal,
        immatriculation: immatriculation || null,
        heure_debut: heureDebut,
        agent_id: currentUser.id,
        statut: 'en_cours',
        source: 'app'
      }).select().single();

      if (error) throw error;

      currentVolId = vol.id;
      controles = {};
      showToast('Vol créé. Fiche de contrôle ouverte.', 'success');
      afficherFiche(vol);
      updateBadgeEnCours();
    } catch (err) {
      showToast('Erreur lors de la création du vol.', 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Commencer le contrôle →';
    }
  });
}

// ---- FICHE DE CONTRÔLE ----

function afficherFiche(vol) {
  document.getElementById('step1').style.display = 'none';
  document.getElementById('step2').style.display = 'block';

  currentTypeVol = vol.type_vol;

  // Infos bar
  document.getElementById('volBadgeNumero').textContent = vol.numero_vol;
  document.getElementById('volBadgeDate').textContent = formatDate(vol.date_vol);
  document.getElementById('volBadgeType').textContent = vol.type_vol;

  document.getElementById('btnAnnulerFiche').addEventListener('click', () => {
    document.getElementById('modalRetour').style.display = 'flex';
  });

  // Réinitialiser la section matériel
  document.getElementById('nbAspirateurs').value = '';
  document.getElementById('nbAgents').value = '';
  document.querySelectorAll('.mat-check').forEach(cb => { cb.checked = false; });

  // Construire l'accordéon
  const accordion = document.getElementById('ficheAccordion');
  accordion.innerHTML = '';
  const ficheStructure = getFicheStructure(vol.type_vol);
  let lastPartie = null;

  ficheStructure.forEach((section, sIdx) => {
    if (section.partie && section.partie !== lastPartie) {
      lastPartie = section.partie;
      const partieHeader = document.createElement('div');
      partieHeader.className = 'partie-header';
      partieHeader.textContent = section.partie === 'Client' ? 'PARTIE CLIENT' : 'PARTIE ÉQUIPAGE';
      accordion.appendChild(partieHeader);
    }
    const isFirst = sIdx === 0;
    const bodyId = `body_${sIdx}`;
    const card = document.createElement('div');
    card.className = 'card accordion-card';
    if (!isFirst) card.classList.add('section-locked');

    const headerLabel = section.sous_zone
      ? `${section.icon} ${section.zone} – ${section.sous_zone}`
      : `${section.icon} ${section.zone}`;

    card.innerHTML = `
      <button class="accordion-header" data-target="${bodyId}" data-sidx="${sIdx}">
        <span>${headerLabel}${!isFirst ? ' <i class="fas fa-lock section-lock-icon"></i>' : ''}</span>
        <div class="accordion-meta">
          <span class="section-progress" id="prog_${sIdx}">0/${section.points.length}</span>
          <span class="accordion-arrow">${isFirst ? '▲' : '▼'}</span>
        </div>
      </button>
      <div class="accordion-body${isFirst ? ' open' : ''}" id="${bodyId}">
        ${section.points.map((point, pIdx) => buildPointHTML(section, point, sIdx, pIdx)).join('')}
      </div>
    `;
    accordion.appendChild(card);
  });

  // Accordéon toggle fiche
  accordion.querySelectorAll('.accordion-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.accordion-card');
      if (card.classList.contains('section-locked')) {
        showToast('Complétez la section précédente avant de continuer.', 'error');
        return;
      }
      const targetId = btn.dataset.target;
      const body = document.getElementById(targetId);
      body.classList.toggle('open');
      btn.querySelector('.accordion-arrow').textContent = body.classList.contains('open') ? '▲' : '▼';
    });
  });

  // Section matériel accordéon
  const materielHeaderBtn = document.querySelector('#sectionMateriel .accordion-header');
  if (materielHeaderBtn) {
    materielHeaderBtn.addEventListener('click', function () {
      const parentCard = this.closest('.accordion-card');
      if (parentCard && parentCard.classList.contains('section-locked')) {
        showToast('Complétez toutes les sections de contrôle avant d\'accéder au matériel.', 'error');
        return;
      }
      const target = document.getElementById(this.dataset.target);
      if (target) {
        target.classList.toggle('open');
        const arrow = this.querySelector('.accordion-arrow');
        if (arrow) arrow.textContent = target.classList.contains('open') ? '▲' : '▼';
      }
    });
  }

  // Radios de conformité
  accordion.querySelectorAll('.conformite-radio').forEach(radio => {
    radio.addEventListener('change', onConformiteChange);
  });

  // Soumettre
  document.getElementById('btnSoumettre').addEventListener('click', confirmSoumission);

  // Verrouiller matériel jusqu'à la fin de toutes les sections
  document.getElementById('sectionMateriel').classList.add('section-locked');

  // Matériel auto-save
  document.getElementById('nbAspirateurs').addEventListener('change', () => autosaveMateriel());
  document.getElementById('nbAgents').addEventListener('change', () => autosaveMateriel());
  document.querySelectorAll('.mat-check').forEach(cb => {
    cb.addEventListener('change', () => autosaveMateriel());
  });

  // Tout cocher
  document.getElementById('btnToutCocher').addEventListener('click', () => {
    document.querySelectorAll('.mat-check').forEach(cb => { cb.checked = true; });
    autosaveMateriel();
    showToast('Tout le matériel coché ✓', 'success');
  });

  updateProgress();
  loadExistingControles();
}

function buildPointHTML(section, point, sIdx, pIdx) {
  const inputName = `conformite_${sIdx}_${pIdx}`;
  return `
    <div class="point-controle" id="point_${sIdx}_${pIdx}" data-zone="${section.zone}" data-sous-zone="${section.sous_zone || ''}" data-point="${escapeAttr(point)}">
      <div class="point-label">${point}</div>
      <div class="conformite-buttons">
        <label class="radio-btn radio-c">
          <input type="radio" class="conformite-radio" name="${inputName}" value="C" />
          <span>✅ C</span>
        </label>
        <label class="radio-btn radio-nc">
          <input type="radio" class="conformite-radio" name="${inputName}" value="NC" />
          <span>❌ NC</span>
        </label>
      </div>
      <div class="nc-details" id="nc_${sIdx}_${pIdx}" style="display:none;">
        <textarea class="nc-observation" id="obs_${sIdx}_${pIdx}" placeholder="Observation / Commentaire…" rows="2"></textarea>
        <div class="photo-upload-zone">
          <input type="file" class="photo-input" id="photo_${sIdx}_${pIdx}" accept="image/*" multiple style="display:none;" />
          <input type="file" class="photo-input-cam" id="photocam_${sIdx}_${pIdx}" accept="image/*" capture="environment" style="display:none;" />
          <div class="photo-btns">
            <button type="button" class="btn btn-outline btn-sm" data-input="photo_${sIdx}_${pIdx}" data-sidx="${sIdx}" data-pidx="${pIdx}">🖼 Galerie</button>
            <button type="button" class="btn btn-outline btn-sm" data-input-cam="photocam_${sIdx}_${pIdx}" data-sidx="${sIdx}" data-pidx="${pIdx}">📷 Caméra</button>
          </div>
          <div class="photo-upload-progress" id="photoProgress_${sIdx}_${pIdx}" style="display:none;">
            <div class="progress-mini"><div class="progress-mini-fill" id="photoProgressFill_${sIdx}_${pIdx}"></div></div>
            <span>Upload…</span>
          </div>
          <div class="photo-preview" id="photoPreview_${sIdx}_${pIdx}"></div>
        </div>
        <div class="nc-action-row">
          <button type="button" class="btn-nc-confirm" id="btnNcConfirm_${sIdx}_${pIdx}" onclick="confirmerJustifNC(${sIdx},${pIdx})" style="display:none;">
            <i class="fas fa-check-circle"></i> Confirmer la justification NC
          </button>
          <button type="button" class="btn-nc-cancel" onclick="annulerNC(${sIdx},${pIdx})">
            <i class="fas fa-times-circle"></i> Annuler — Corriger en C
          </button>
        </div>
      </div>
    </div>
  `;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getKey(zone, sousZone, point) {
  return `${zone}|${sousZone || ''}|${point}`;
}

// ---- ÉVÉNEMENTS CONFORMITÉ ----

function onConformiteChange(e) {
  const radio = e.target;
  const pointEl = radio.closest('.point-controle');
  const zone = pointEl.dataset.zone;
  const sousZone = pointEl.dataset.sousZone || null;
  const point = pointEl.dataset.point;
  const conformite = radio.value;
  const key = getKey(zone, sousZone, point);

  // Afficher/masquer les détails NC
  const nameAttr = radio.name;
  const [, sIdx, pIdx] = nameAttr.split('_');
  const ncDetails = document.getElementById(`nc_${sIdx}_${pIdx}`);
  if (ncDetails) {
    ncDetails.style.display = (conformite === 'NC') ? 'block' : 'none';
  }

  if (!controles[key]) controles[key] = {};
  controles[key].conformite = conformite;
  controles[key].zone = zone;
  controles[key].sous_zone = sousZone;
  controles[key].point = point;
  if (conformite !== 'NC') controles[key].ncConfirmed = false;

  // Style du point
  pointEl.classList.remove('point-c', 'point-nc', 'point-na');
  pointEl.classList.add(`point-${conformite.toLowerCase()}`);

  updateProgress();
  checkAndUnlockNext(parseInt(sIdx));
  scheduleAutosave(sIdx, pIdx, key);

  // Configurer upload photo — galerie (multiple)
  const photoBtnEl = document.querySelector(`[data-input="photo_${sIdx}_${pIdx}"]`);
  if (photoBtnEl) photoBtnEl.onclick = () => document.getElementById(`photo_${sIdx}_${pIdx}`).click();
  const photoInput = document.getElementById(`photo_${sIdx}_${pIdx}`);
  if (photoInput && !photoInput.dataset.bound) {
    photoInput.dataset.bound = '1';
    photoInput.addEventListener('change', (ev) => handlePhotoUpload(ev, sIdx, pIdx, key));
  }
  // Caméra
  const photoCamBtnEl = document.querySelector(`[data-input-cam="photocam_${sIdx}_${pIdx}"]`);
  if (photoCamBtnEl) photoCamBtnEl.onclick = () => document.getElementById(`photocam_${sIdx}_${pIdx}`).click();
  const photoCamInput = document.getElementById(`photocam_${sIdx}_${pIdx}`);
  if (photoCamInput && !photoCamInput.dataset.bound) {
    photoCamInput.dataset.bound = '1';
    photoCamInput.addEventListener('change', (ev) => handlePhotoUpload(ev, sIdx, pIdx, key));
  }

  // Observation auto-save
  const obsEl = document.getElementById(`obs_${sIdx}_${pIdx}`);
  if (obsEl && !obsEl.dataset.bound) {
    obsEl.dataset.bound = '1';
    obsEl.addEventListener('input', () => {
      controles[key].observation = obsEl.value;
      updateNcConfirmBtn(sIdx, pIdx, key);
      scheduleAutosave(sIdx, pIdx, key);
    });
  }
}

function clearNcMissingHint(sIdx, pIdx) {
  const pointEl = document.getElementById(`point_${sIdx}_${pIdx}`);
  if (!pointEl) return;
  pointEl.classList.remove('nc-missing-justif');
  pointEl.querySelector('.nc-required-hint')?.remove();
  checkAndUnlockNext(parseInt(sIdx));
}

function updateNcConfirmBtn(sIdx, pIdx, key) {
  const btn = document.getElementById(`btnNcConfirm_${sIdx}_${pIdx}`);
  if (!btn) return;
  const c = controles[key] || {};
  const hasJustif = !!(c.observation?.trim()) || (c.photoCount > 0);
  btn.style.display = (hasJustif && !c.ncConfirmed) ? 'flex' : 'none';
}

window.annulerNC = function(sIdx, pIdx) {
  // Remettre à C et masquer les détails NC
  const radioC = document.querySelector(`input[name="conformite_${sIdx}_${pIdx}"][value="C"]`);
  if (radioC) {
    radioC.checked = true;
    radioC.dispatchEvent(new Event('change', { bubbles: true }));
  }
};

window.confirmerJustifNC = function(sIdx, pIdx) {
  const ficheStructure = getFicheStructure(currentTypeVol);
  const section = ficheStructure[parseInt(sIdx)];
  if (section) {
    const point = section.points[parseInt(pIdx)];
    if (point) {
      const key = getKey(section.zone, section.sous_zone, point);
      if (controles[key]) controles[key].ncConfirmed = true;
    }
  }
  clearNcMissingHint(sIdx, pIdx);
  const btn = document.getElementById(`btnNcConfirm_${sIdx}_${pIdx}`);
  if (btn) btn.style.display = 'none';
};

// ---- AUTOSAVE ----

function scheduleAutosave(sIdx, pIdx, key) {
  clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(() => saveControle(key), 1000);
  saveToLocalStorage();
}

async function flushSaves() {
  if (isDemoMode || !currentVolId) return;
  clearTimeout(autosaveTimeout);
  const keys = Object.keys(controles).filter(k => controles[k]?.conformite);
  await Promise.all(keys.map(async key => {
    const c = controles[key];
    if (!c.conformite) return;
    const payload = {
      vol_id: currentVolId,
      zone: c.zone,
      sous_zone: c.sous_zone || null,
      point_controle: c.point,
      conformite: c.conformite,
      observation: c.observation || null
    };
    try {
      let result;
      if (c.controle_id) {
        result = await supabase.from('controles').update(payload).eq('id', c.controle_id).select().single();
      } else {
        result = await supabase.from('controles').insert(payload).select().single();
        if (result.data) controles[key].controle_id = result.data.id;
      }
    } catch {}
  }));
}

async function saveControle(key) {
  if (!currentVolId || !controles[key]) return;
  const c = controles[key];
  if (!c.conformite) return;

  if (isDemoMode) {
    const result = demoUpsertControle({
      vol_id: currentVolId,
      zone: c.zone,
      sous_zone: c.sous_zone || null,
      point_controle: c.point,
      conformite: c.conformite,
      observation: c.observation || null
    });
    controles[key].controle_id = result.id;
    showToast('Enregistré ✓', 'success', 1500);
    return;
  }

  try {
    const payload = {
      vol_id: currentVolId,
      zone: c.zone,
      sous_zone: c.sous_zone || null,
      point_controle: c.point,
      conformite: c.conformite,
      observation: c.observation || null
    };

    let result;
    if (c.controle_id) {
      result = await supabase.from('controles')
        .update(payload)
        .eq('id', c.controle_id)
        .select().single();
    } else {
      result = await supabase.from('controles')
        .insert(payload)
        .select().single();
      if (result.data) {
        controles[key].controle_id = result.data.id;
      }
    }
    if (result.error) throw result.error;
    showToast('Enregistré ✓', 'success', 1500);
  } catch (err) {
    console.error('Autosave error:', err);
    if (!isOffline) showToast('Erreur d\'enregistrement', 'error');
  }
}

async function autosaveMateriel() {
  if (!currentVolId || isDemoMode) return;

  await supabase.from('materiels_utilises').delete().eq('vol_id', currentVolId);

  const items = [];

  const nbAsp = parseInt(document.getElementById('nbAspirateurs').value) || 0;
  if (nbAsp > 0) {
    items.push({ vol_id: currentVolId, categorie: 'Nombre aspirateurs', nom_materiel: 'Aspirateur', quantite: nbAsp, utilise: true });
  }

  const nbAgents = parseInt(document.getElementById('nbAgents').value) || 0;
  if (nbAgents > 0) {
    items.push({ vol_id: currentVolId, categorie: 'Nombre agents', nom_materiel: 'Agent', quantite: nbAgents, utilise: true });
  }

  document.querySelectorAll('.mat-check:checked').forEach(cb => {
    items.push({ vol_id: currentVolId, categorie: cb.dataset.cat, nom_materiel: cb.dataset.nom, quantite: 1, utilise: true });
  });

  if (items.length > 0) {
    await supabase.from('materiels_utilises').insert(items);
  }
}

// ---- PROGRESSION ----

function updateProgress() {
  const totalPoints = getTotalPoints(currentTypeVol);
  const filled = Object.values(controles).filter(c => c.conformite).length;
  const pct = totalPoints > 0 ? Math.round((filled / totalPoints) * 100) : 0;

  document.getElementById('progressPercent').textContent = pct + '%';
  document.getElementById('progressCount').textContent = `(${filled} / ${totalPoints})`;

  const fill = document.getElementById('progressFill');
  fill.style.width = pct + '%';
  fill.className = 'progress-bar-fill';
  if (pct < 33) fill.classList.add('progress-red');
  else if (pct < 66) fill.classList.add('progress-orange');
  else fill.classList.add('progress-green');

  // Progression par section
  getFicheStructure(currentTypeVol).forEach((section, sIdx) => {
    const total = section.points.length;
    let done = 0;
    section.points.forEach(point => {
      const key = getKey(section.zone, section.sous_zone, point);
      if (controles[key]?.conformite) done++;
    });
    const progEl = document.getElementById(`prog_${sIdx}`);
    if (progEl) progEl.textContent = `${done}/${total}`;
  });

  updateSubmitInfo();
}

function updateSubmitInfo() {
  const vals = Object.values(controles);
  const C = vals.filter(c => c.conformite === 'C').length;
  const NC = vals.filter(c => c.conformite === 'NC').length;
  const filled = C + NC;
  const taux = filled > 0 ? ((C / filled) * 100).toFixed(1) : '0.0';

  document.getElementById('submitInfo').innerHTML = `
    <span class="badge-stat badge-c">✅ ${C} Conformes</span>
    <span class="badge-stat badge-nc">❌ ${NC} Non conformes</span>
    <span class="badge-stat badge-taux">📊 Taux: ${taux}%</span>
  `;
}

// ---- UPLOAD PHOTO ----

async function handlePhotoUpload(event, sIdx, pIdx, key) {
  const files = Array.from(event.target.files);
  if (!files.length || !currentVolId) return;

  const progressEl = document.getElementById(`photoProgress_${sIdx}_${pIdx}`);
  const progressFill = document.getElementById(`photoProgressFill_${sIdx}_${pIdx}`);
  const previewEl = document.getElementById(`photoPreview_${sIdx}_${pIdx}`);

  progressEl.style.display = 'flex';
  progressFill.style.width = '5%';

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const compressed = await compressImage(file);
      progressFill.style.width = `${Math.round(((i + 0.4) / files.length) * 90) + 5}%`;

      if (isDemoMode) {
        const localUrl = URL.createObjectURL(compressed);
        controles[key].photoCount = (controles[key].photoCount || 0) + 1;
        updateNcConfirmBtn(sIdx, pIdx, key);
        const img = document.createElement('img');
        img.src = localUrl;
        img.className = 'photo-thumb';
        img.addEventListener('click', () => openLightbox(localUrl));
        previewEl.appendChild(img);
        continue;
      }

      const c = controles[key];
      const zone = c.zone.replace(/[^a-z0-9]/gi, '_');
      const timestamp = Date.now() + i;
      const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]/gi, '_');
      const path = `${currentVolId}/${zone}/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('photos-controle')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('photos-controle').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      await supabase.from('photos').insert({
        controle_id: controles[key]?.controle_id || null,
        vol_id: currentVolId,
        storage_path: path,
        url_publique: publicUrl
      });

      controles[key].photoCount = (controles[key].photoCount || 0) + 1;
      updateNcConfirmBtn(sIdx, pIdx, key);
      const img = document.createElement('img');
      img.src = publicUrl;
      img.className = 'photo-thumb';
      img.addEventListener('click', () => openLightbox(publicUrl));
      previewEl.appendChild(img);

      progressFill.style.width = `${Math.round(((i + 1) / files.length) * 100)}%`;
    }

    if (isDemoMode) showToast(`${files.length} photo(s) ajoutée(s) (mode démo)`, 'info');
    else showToast(`${files.length} photo(s) uploadée(s) ✓`, 'success');
  } catch (err) {
    console.error('Photo upload error:', err);
    showToast('Erreur upload photo', 'error');
  } finally {
    event.target.value = '';
    setTimeout(() => { progressEl.style.display = 'none'; }, 1000);
  }
}

async function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 800;
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = (height / width) * maxSize;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width / height) * maxSize;
          height = maxSize;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(resolve, 'image/jpeg', 0.75);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---- SOUMISSION ----

function confirmSoumission() {
  const vals = Object.values(controles);
  const C = vals.filter(c => c.conformite === 'C').length;
  const NC = vals.filter(c => c.conformite === 'NC').length;
  const total = getTotalPoints(currentTypeVol);
  const filled = C + NC;

  if (filled < total) {
    showToast(`Veuillez renseigner tous les points avant de soumettre (${filled}/${total} complétés).`, 'error');
    return;
  }

  // Vérifier que toutes les NC ont été confirmées
  const ficheStructureCheck = getFicheStructure(currentTypeVol);
  const ncNonConfirmes = [];
  ficheStructureCheck.forEach((section, sIdx) => {
    section.points.forEach((point, pIdx) => {
      const key = getKey(section.zone, section.sous_zone, point);
      const c = controles[key];
      if (c?.conformite === 'NC' && !c.ncConfirmed) ncNonConfirmes.push({ sIdx, pIdx });
    });
  });
  if (ncNonConfirmes.length > 0) {
    showToast(`${ncNonConfirmes.length} point(s) NC nécessitent une justification confirmée avant de soumettre.`, 'error');
    const first = ncNonConfirmes[0];
    document.getElementById(`point_${first.sIdx}_${first.pIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const totalMat = document.querySelectorAll('.mat-check').length;
  const checkedMat = document.querySelectorAll('.mat-check:checked').length;
  if (checkedMat < totalMat) {
    showToast(`Veuillez compléter la section Matériel utilisé (${checkedMat}/${totalMat} cochés).`, 'error');
    document.getElementById('sectionMateriel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const nbAgentsVal = parseInt(document.getElementById('nbAgents').value);
  if (!nbAgentsVal || nbAgentsVal < 1) {
    showToast('Veuillez indiquer le nombre d\'agents de nettoyage (minimum 1).', 'error');
    document.getElementById('sectionMateriel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('nbAgents').focus();
    return;
  }
  const nbAspVal = parseInt(document.getElementById('nbAspirateurs').value);
  if (!nbAspVal || nbAspVal < 1) {
    showToast('Veuillez indiquer le nombre d\'aspirateurs (minimum 1).', 'error');
    document.getElementById('sectionMateriel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('nbAspirateurs').focus();
    return;
  }

  const heureFin = getTimePicker('heureFin');
  const heureDebutVal = document.getElementById('rappelHeureDebut').textContent;
  if (!heureFin) {
    showToast('Veuillez renseigner l\'heure de fin de nettoyage avant de soumettre.', 'error');
    document.getElementById('heureFinH')?.focus();
    return;
  }
  if (heureFin === heureDebutVal) {
    showToast('L\'heure de fin ne peut pas être identique à l\'heure de début.', 'error');
    document.getElementById('heureFinH')?.focus();
    return;
  }
  if (heureDebutVal && heureDebutVal !== '—' && heureFin < heureDebutVal) {
    showToast(`L'heure de fin (${heureFin}) doit être après l'heure de début (${heureDebutVal}).`, 'error');
    document.getElementById('heureFinH')?.focus();
    return;
  }

  const taux = filled > 0 ? ((C / filled) * 100).toFixed(1) : '0.0';

  document.getElementById('modalResume').innerHTML = `
    <div class="resume-grid">
      <div class="resume-item"><span class="resume-label">Total points</span><span class="resume-value">${total}</span></div>
      <div class="resume-item"><span class="resume-label">Renseignés</span><span class="resume-value">${filled}</span></div>
      <div class="resume-item badge-c"><span class="resume-label">Conformes</span><span class="resume-value">${C}</span></div>
      <div class="resume-item badge-nc"><span class="resume-label">Non conformes</span><span class="resume-value">${NC}</span></div>
      <div class="resume-item"><span class="resume-label">Taux conformité</span><span class="resume-value">${taux}%</span></div>
    </div>
  `;

  document.getElementById('modalSoumettre').style.display = 'flex';
}


document.getElementById('btnAnnulerRetour')?.addEventListener('click', () => {
  document.getElementById('modalRetour').style.display = 'none';
});

document.getElementById('btnConfirmerRetour')?.addEventListener('click', () => {
  document.getElementById('modalRetour').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
  document.getElementById('step2').style.display = 'none';
  document.getElementById('formEntete').reset();
  document.getElementById('dateVol').valueAsDate = new Date();
  currentVolId = null;
  currentTypeVol = null;
  controles = {};
  updateProgress();
});

document.getElementById('btnAnnulerModal')?.addEventListener('click', () => {
  document.getElementById('modalSoumettre').style.display = 'none';
});

document.getElementById('btnConfirmerSoumission')?.addEventListener('click', async () => {
  document.getElementById('modalSoumettre').style.display = 'none';

  if (isDemoMode) {
    demoUpdateVol(currentVolId, { statut: 'soumis' });
    openSuccesModal(currentVolId, currentTypeVol);
    return;
  }

  try {
    await flushSaves();
    await autosaveMateriel();
    const heureFin = getTimePicker('heureFin');
    const { error } = await supabase.from('vols')
      .update({ statut: 'soumis', heure_fin: heureFin })
      .eq('id', currentVolId);
    if (error) throw error;
    localStorage.removeItem(`offline_${currentVolId}`);
    openSuccesModal(currentVolId, currentTypeVol);
  } catch (err) {
    showToast('Erreur lors de la soumission', 'error');
    console.error(err);
  }
});

function openSuccesModal(volId, typeVol) {
  const C  = Object.values(controles).filter(c => c.conformite === 'C').length;
  const NC = Object.values(controles).filter(c => c.conformite === 'NC').length;
  const total = C + NC;
  const taux  = total ? Math.round(C / total * 100) : 0;

  document.getElementById('succesStats').innerHTML = `
    <div class="succes-stat green"><div class="succes-stat-value">${C}</div><div class="succes-stat-label">Conformes</div></div>
    <div class="succes-stat red"><div class="succes-stat-value">${NC}</div><div class="succes-stat-label">Non conformes</div></div>
    <div class="succes-stat blue"><div class="succes-stat-value">${taux}%</div><div class="succes-stat-label">Taux C</div></div>
  `;
  document.getElementById('succesSubtitle').textContent = `Fiche ${typeVol || ''} transmise avec succès.`;

  const btnPDF   = document.getElementById('btnSuccesPDF');
  const btnShare = document.getElementById('btnSuccesShare');

  btnPDF.onclick = () => downloadFichePDF(volId, typeVol);

  btnShare.onclick = async () => {
    if (!navigator.share) { downloadFichePDF(volId, typeVol); return; }

    showToast('Préparation du partage…', 'info');
    const result = await downloadFichePDF(volId, typeVol, { returnBlob: true });
    if (!result) return;

    const { blob, filename, vol } = result;
    const agentNom = vol?.profiles?.nom || '';
    const dateStr = vol?.date_vol ? new Date(vol.date_vol).toLocaleDateString('fr-FR') : '';
    const shareTitle = `Fiche ${vol?.numero_vol || ''} – ${dateStr}`;
    const shareText = `Contrôle cabine ${vol?.numero_vol || ''} du ${dateStr}${agentNom ? ' – Agent : ' + agentNom : ''}\n${typeVol} – Conformité : ${taux}%`;

    const file = new File([blob], filename, { type: 'application/pdf' });

    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: shareTitle, text: shareText, files: [file] });
      } else {
        // Navigateur ne supporte pas le partage de fichiers → partage texte seul
        await navigator.share({ title: shareTitle, text: shareText });
      }
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Partage annulé ou non supporté', 'error');
    }
  };

  document.getElementById('modalSucces').style.display = 'flex';
}

function closeSuccesAndReset() {
  document.getElementById('modalSucces').style.display = 'none';
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
  document.getElementById('formEntete').reset();
  document.getElementById('dateVol').valueAsDate = new Date();
  currentVolId = null;
  currentTypeVol = null;
  controles = {};
  updateBadgeEnCours();
}

document.getElementById('btnSuccesRetour')?.addEventListener('click', closeSuccesAndReset);
document.getElementById('btnSuccesPDF')?.addEventListener('click', () => {});  // géré dans openSuccesModal

// ---- MES CONTRÔLES ----

const MC_PAGE_SIZE = 20;
let mcCurrentPeriod = 'today';
let mcCurrentPage = 0;
let mcTotalCount = 0;
let enCoursTotal = 0;

function setupMesControlesTabs() {
  document.querySelectorAll('.mc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mc-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      mcCurrentPeriod = tab.dataset.period;
      mcCurrentPage = 0;
      loadMesControles();
    });
  });
  document.getElementById('btnPrevPage')?.addEventListener('click', () => {
    if (mcCurrentPage > 0) { mcCurrentPage--; loadMesControles(); }
  });
  document.getElementById('btnNextPage')?.addEventListener('click', () => {
    if ((mcCurrentPage + 1) * MC_PAGE_SIZE < mcTotalCount) { mcCurrentPage++; loadMesControles(); }
  });
}

function getPeriodFilter() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (mcCurrentPeriod === 'today') return { gte: today, lte: today };
  // recent : 7 derniers jours
  const d7 = new Date(now); d7.setDate(d7.getDate() - 6);
  const from = `${d7.getFullYear()}-${pad(d7.getMonth() + 1)}-${pad(d7.getDate())}`;
  return { gte: from, lte: today };
}

function buildVolCard(vol, ncCount) {
  const canContinue = vol.statut === 'en_cours';
  const taux = (() => {
    const c = (vol.controles || []).filter(x => x.conformite === 'C').length;
    const total = c + ncCount;
    return total > 0 ? Math.round((c / total) * 100) : null;
  })();
  const tauxHtml = taux !== null
    ? `<span class="mc-card-taux ${taux >= 80 ? 'taux-ok' : taux >= 50 ? 'taux-mid' : 'taux-low'}">${taux}%</span>`
    : '';

  return `
    <div class="mc-card ${canContinue ? 'mc-card-active' : ''}">
      <div class="mc-card-top">
        <div class="mc-card-vol">
          <span class="mc-card-num">${vol.numero_vol}</span>
          <span class="mc-card-type">${vol.type_vol}</span>
        </div>
        <div class="mc-card-right">
          ${getStatutBadge(vol.statut)}
          ${tauxHtml}
        </div>
      </div>
      <div class="mc-card-meta">
        <span>📅 ${formatDate(vol.date_vol)}</span>
        ${vol.heure_debut ? `<span>🕐 ${vol.heure_debut}${vol.heure_fin ? ' → ' + vol.heure_fin : ''}</span>` : ''}
        ${ncCount > 0 ? `<span class="mc-card-nc">❌ ${ncCount} NC</span>` : '<span class="mc-card-nc-ok">✅ 0 NC</span>'}
      </div>
      <div class="mc-card-actions">
        <button class="btn btn-outline btn-sm" onclick="viewFiche('${vol.id}')">👁 Voir</button>
        ${canContinue ? `<button class="btn btn-primary btn-sm" onclick="continueFiche('${vol.id}')">▶ Continuer</button>` : ''}
        ${!canContinue ? `<button class="btn btn-outline btn-sm" onclick="downloadFichePDF('${vol.id}','${vol.type_vol}')">⬇ PDF</button>` : ''}
        ${canContinue ? `<button class="btn btn-danger btn-sm" onclick="confirmDeleteVol('${vol.id}','${vol.numero_vol}')">🗑 Supprimer</button>` : ''}
      </div>
    </div>
  `;
}

async function loadMesControles() {
  const container = document.getElementById('mesControlesList');
  const pagination = document.getElementById('mesControlesPagination');
  if (!container) return;
  container.innerHTML = '<div class="loading-state">Chargement…</div>';
  updateBadgeEnCours();
  if (pagination) pagination.style.display = 'none';

  if (isDemoMode) {
    const vols = demoGetVols('demo');
    if (!vols.length) {
      container.innerHTML = '<div class="empty-state">Aucun contrôle pour l\'instant.</div>';
      return;
    }
    const cards = vols.map(vol => {
      const nc = demoGetControles(vol.id).filter(c => c.conformite === 'NC').length;
      return buildVolCard(vol, nc);
    }).join('');
    container.innerHTML = `<div class="mc-cards-grid">${cards}</div>`;
    return;
  }

  try {
    const filter = getPeriodFilter();
    let query = supabase
      .from('vols')
      .select('id, numero_vol, date_vol, type_vol, heure_debut, heure_fin, statut, controles(conformite)', { count: 'exact' })
      .eq('agent_id', currentUser.id)
      .order('date_vol', { ascending: false })
      .order('created_at', { ascending: false })
      .range(mcCurrentPage * MC_PAGE_SIZE, (mcCurrentPage + 1) * MC_PAGE_SIZE - 1);

    if (filter) {
      query = query.gte('date_vol', filter.gte).lte('date_vol', filter.lte);
    }

    const { data: vols, error, count } = await query;
    if (error) throw error;

    mcTotalCount = count || 0;

    const enCoursBanner = (mcCurrentPeriod !== 'all' && enCoursTotal > 0)
      ? `<div class="mc-encours-banner">
           <i class="fas fa-clock"></i>
           Vous avez <strong>${enCoursTotal}</strong> contrôle${enCoursTotal > 1 ? 's' : ''} en cours sur d'autres dates.
           <button class="mc-encours-btn" id="btnVoirToutEnCours">Voir tout</button>
         </div>`
      : '';

    if (!vols || vols.length === 0) {
      const msgs = {
        today: 'Aucun contrôle aujourd\'hui.',
        recent: 'Aucun contrôle sur les 7 derniers jours.'
      };
      container.innerHTML = enCoursBanner + `<div class="empty-state">${msgs[mcCurrentPeriod] || 'Aucun contrôle.'}</div>`;
      document.getElementById('btnVoirToutEnCours')?.addEventListener('click', () => {
        document.querySelector('.mc-tab[data-period="all"]')?.click();
      });
      return;
    }

    const cards = vols.map(vol => {
      const nc = (vol.controles || []).filter(c => c.conformite === 'NC').length;
      return buildVolCard(vol, nc);
    }).join('');

    container.innerHTML = enCoursBanner + `<div class="mc-cards-grid">${cards}</div>`;
    document.getElementById('btnVoirToutEnCours')?.addEventListener('click', () => {
      document.querySelector('.mc-tab[data-period="all"]')?.click();
    });

    // Pagination (uniquement pour "all" ou si résultats > page)
    if (mcTotalCount > MC_PAGE_SIZE) {
      const totalPages = Math.ceil(mcTotalCount / MC_PAGE_SIZE);
      document.getElementById('paginationInfo').textContent =
        `Page ${mcCurrentPage + 1} / ${totalPages} (${mcTotalCount} vols)`;
      document.getElementById('btnPrevPage').disabled = mcCurrentPage === 0;
      document.getElementById('btnNextPage').disabled = (mcCurrentPage + 1) >= totalPages;
      pagination.style.display = 'flex';
    }
  } catch (err) {
    container.innerHTML = '<div class="empty-state error">Erreur de chargement.</div>';
    console.error(err);
  }
}

// ---- SUPPRESSION VOL EN COURS ----

let deleteVolId = null;

window.confirmDeleteVol = function(volId, numeroVol) {
  deleteVolId = volId;
  document.getElementById('deleteVolNumero').textContent = numeroVol;
  document.getElementById('modalDeleteVol').style.display = 'flex';
};

document.getElementById('btnAnnulerDeleteVol')?.addEventListener('click', () => {
  document.getElementById('modalDeleteVol').style.display = 'none';
  deleteVolId = null;
});

document.getElementById('btnConfirmerDeleteVol')?.addEventListener('click', async () => {
  if (!deleteVolId) return;
  const btn = document.getElementById('btnConfirmerDeleteVol');
  btn.disabled = true;
  btn.textContent = 'Suppression…';

  try {
    if (isDemoMode) {
      showToast('Suppression non disponible en mode démo.', 'error');
      return;
    }

    // Les controles, photos et materiels_utilises sont en cascade (ON DELETE CASCADE)
    const { error } = await supabase
      .from('vols')
      .delete()
      .eq('id', deleteVolId)
      .eq('agent_id', currentUser.id)
      .eq('statut', 'en_cours');

    if (error) throw error;

    localStorage.removeItem(`offline_${deleteVolId}`);
    document.getElementById('modalDeleteVol').style.display = 'none';
    deleteVolId = null;
    showToast('Contrôle supprimé.', 'success');
    updateBadgeEnCours();
    loadMesControles();
  } catch (err) {
    showToast('Erreur lors de la suppression.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Supprimer définitivement';
  }
});

// ---- VOIR FICHE ----

window.viewFiche = async function(volId) {
  document.getElementById('modalFiche').style.display = 'flex';
  const body = document.getElementById('modalFicheBody');
  body.innerHTML = '<div class="loading-state">Chargement…</div>';

  try {
    let vol, controlesList, photosList;

    if (isDemoMode) {
      vol = demoGetVol(volId);
      controlesList = demoGetControles(volId);
      photosList = [];
    } else {
      const r1 = await supabase.from('vols').select('*').eq('id', volId).single();
      const r2 = await supabase.from('controles').select('*').eq('vol_id', volId);
      const r3 = await supabase.from('photos').select('*').eq('vol_id', volId);
      vol = r1.data;
      controlesList = r2.data || [];
      photosList = r3.data || [];
    }

    if (!vol) { body.innerHTML = '<div class="empty-state error">Introuvable.</div>'; return; }

    document.getElementById('modalFicheTitle').textContent = `Fiche – Vol ${vol.numero_vol} – ${formatDate(vol.date_vol)}`;

    const controleMap = {};
    controlesList.forEach(c => {
      controleMap[getKey(c.zone, c.sous_zone, c.point_controle)] = c;
    });
    const photosMap = {};
    (photosList || []).forEach(p => {
      if (!photosMap[p.controle_id]) photosMap[p.controle_id] = [];
      photosMap[p.controle_id].push(p);
    });

    const vals = Object.values(controleMap);
    const C = vals.filter(c => c.conformite === 'C').length;
    const NC = vals.filter(c => c.conformite === 'NC').length;
    const taux = (C + NC) > 0 ? ((C / (C + NC)) * 100).toFixed(1) : '—';

    let html = `
      <div class="fiche-header-print">
        <h3>Vol ${vol.numero_vol} – ${vol.type_vol}</h3>
        <p>Date : ${formatDate(vol.date_vol)} | Immat : ${vol.immatriculation || '—'} | ${vol.heure_debut || '—'} → ${vol.heure_fin || '—'}</p>
        <div class="resume-stats">
          <span class="badge-stat badge-c">✅ ${C} C</span>
          <span class="badge-stat badge-nc">❌ ${NC} NC</span>
          <span class="badge-stat">📊 ${taux}%</span>
        </div>
      </div>
    `;

    getFicheStructure(vol.type_vol).forEach(section => {
      const label = section.sous_zone ? `${section.zone} – ${section.sous_zone}` : section.zone;
      html += `<div class="fiche-section-print"><h4>${section.icon} ${label}</h4><div class="fiche-points-print">`;
      section.points.forEach(point => {
        const key = getKey(section.zone, section.sous_zone, point);
        const ctrl = controleMap[key];
        const conf = ctrl?.conformite || '—';
        const confClass = conf === 'C' ? 'conf-c' : conf === 'NC' ? 'conf-nc' : '';
        const confLabel = conf === 'C' ? '✅ C' : conf === 'NC' ? '❌ NC' : '—';
        let photos = ctrl ? (photosMap[ctrl.id] || []) : [];
        html += `
          <div class="fiche-point-row ${confClass}">
            <span class="point-name">${point}</span>
            <span class="point-conf ${confClass}">${confLabel}</span>
            ${ctrl?.observation ? `<span class="point-obs">📝 ${ctrl.observation}</span>` : ''}
            ${photos.map(p => `<img src="${p.url_publique}" class="photo-thumb-sm" onclick="openLightbox('${p.url_publique}')" />`).join('')}
          </div>
        `;
      });
      html += `</div></div>`;
    });

    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div class="empty-state error">Erreur de chargement.</div>';
    console.error(err);
  }
};

// ---- CONTINUER FICHE ----

window.downloadFichePDF = downloadFichePDF;

window.continueFiche = async function(volId) {
  try {
    let vol, controlesList;

    if (isDemoMode) {
      vol = demoGetVol(volId);
      controlesList = demoGetControles(volId);
    } else {
      const r1 = await supabase.from('vols').select('*').eq('id', volId).single();
      const r2 = await supabase.from('controles').select('*').eq('vol_id', volId);
      vol = r1.data;
      controlesList = r2.data || [];
    }

    if (!vol) { showToast('Vol introuvable.', 'error'); return; }

    currentVolId = volId;
    controles = {};
    (controlesList || []).forEach(c => {
      const key = getKey(c.zone, c.sous_zone, c.point_controle);
      controles[key] = { conformite: c.conformite, observation: c.observation, controle_id: c.id, zone: c.zone, sous_zone: c.sous_zone, point: c.point_controle, ncConfirmed: c.conformite === 'NC' && !!c.observation?.trim() };
    });

    showView('nouveau');
    document.querySelectorAll('.sidebar-link').forEach(l => {
      l.classList.toggle('active', l.dataset.view === 'nouveau');
    });

    document.getElementById('dateVol').value = vol.date_vol;
    document.getElementById('numeroVol').value = vol.numero_vol;
    document.getElementById('immatriculation').value = vol.immatriculation || '';
    document.getElementById('typeVol').value = vol.type_vol;
    document.querySelectorAll('.type-vol-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.value === vol.type_vol);
    });
    // Déverrouiller le formGrid car le type est déjà défini
    const fg = document.getElementById('formGrid');
    if (fg) fg.classList.remove('locked');
    setTimePicker('heureDebut', vol.heure_debut || null);
    document.getElementById('rappelHeureDebut').textContent = vol.heure_debut || '—';
    setTimePicker('heureFin', vol.heure_fin || null);

    afficherFiche(vol);
    restoreConformites();
  } catch (err) {
    showToast('Erreur lors du chargement de la fiche.', 'error');
    console.error(err);
  }
};

function restoreConformites() {
  Object.entries(controles).forEach(([key, c]) => {
    if (!c.conformite) return;
    getFicheStructure(currentTypeVol).forEach((section, sIdx) => {
      section.points.forEach((point, pIdx) => {
        if (getKey(section.zone, section.sous_zone, point) === key) {
          const radio = document.querySelector(`input[name="conformite_${sIdx}_${pIdx}"][value="${c.conformite}"]`);
          if (radio) {
            radio.checked = true;
            const pointEl = radio.closest('.point-controle');
            pointEl.classList.remove('point-c', 'point-nc', 'point-na');
            pointEl.classList.add(`point-${c.conformite.toLowerCase()}`);
            if (c.conformite === 'NC') {
              const ncDetails = document.getElementById(`nc_${sIdx}_${pIdx}`);
              if (ncDetails) ncDetails.style.display = 'block';
              const obsEl = document.getElementById(`obs_${sIdx}_${pIdx}`);
              if (obsEl && c.observation) obsEl.value = c.observation;
              updateNcConfirmBtn(sIdx, pIdx, key);
            }
          }
        }
      });
    });
  });
  updateProgress();
  unlockRestoredSections();
}

function checkAndUnlockNext(sIdx) {
  const ficheStructure = getFicheStructure(currentTypeVol);
  const section = ficheStructure[sIdx];
  if (!section) return;

  const allDone = section.points.every(point =>
    !!controles[getKey(section.zone, section.sous_zone, point)]?.conformite
  );
  if (!allDone) return;

  // Chaque point NC doit avoir une justification confirmée (bouton "Confirmer NC")
  const ncSansJustif = section.points
    .map((point, pIdx) => ({ point, pIdx, key: getKey(section.zone, section.sous_zone, point) }))
    .filter(({ key }) => {
      const c = controles[key];
      return c?.conformite === 'NC' && !c.ncConfirmed;
    });

  if (ncSansJustif.length > 0) {
    showToast(
      `${ncSansJustif.length} point(s) NC : ajoutez un commentaire ou une photo puis cliquez "Confirmer la justification NC".`,
      'error'
    );
    ncSansJustif.forEach(({ pIdx }) => {
      const pointEl = document.getElementById(`point_${sIdx}_${pIdx}`);
      if (!pointEl) return;
      pointEl.classList.add('nc-missing-justif');
      if (!pointEl.querySelector('.nc-required-hint')) {
        const hint = document.createElement('div');
        hint.className = 'nc-required-hint';
        hint.innerHTML = '⚠ Ajoutez un commentaire ou une photo, puis cliquez <strong>Confirmer la justification NC</strong>.';
        pointEl.querySelector('.nc-details')?.appendChild(hint);
      }
    });
    // Scroll vers le premier NC sans justification
    const firstEl = document.getElementById(`point_${sIdx}_${ncSansJustif[0].pIdx}`);
    firstEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const cards = document.querySelectorAll('#ficheAccordion .accordion-card');
  const nextIdx = sIdx + 1;

  if (nextIdx < ficheStructure.length) {
    const nextCard = cards[nextIdx];
    if (nextCard && nextCard.classList.contains('section-locked')) {
      nextCard.classList.remove('section-locked');
      const nextHeader = nextCard.querySelector('.accordion-header');
      nextHeader?.querySelector('.section-lock-icon')?.remove();
      const nextBody = nextCard.querySelector('.accordion-body');
      if (nextBody && !nextBody.classList.contains('open')) {
        nextBody.classList.add('open');
        if (nextHeader) nextHeader.querySelector('.accordion-arrow').textContent = '▲';
      }
      nextCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    // Dernière section fiche terminée → déverrouiller matériel
    const materielCard = document.getElementById('sectionMateriel');
    if (materielCard && materielCard.classList.contains('section-locked')) {
      materielCard.classList.remove('section-locked');
      const materielBody = document.getElementById('accordionMateriel');
      if (materielBody && !materielBody.classList.contains('open')) {
        materielBody.classList.add('open');
        const arrow = materielCard.querySelector('.accordion-arrow');
        if (arrow) arrow.textContent = '▲';
      }
      materielCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function unlockRestoredSections() {
  const ficheStructure = getFicheStructure(currentTypeVol);
  const cards = document.querySelectorAll('#ficheAccordion .accordion-card');

  for (let i = 1; i < ficheStructure.length; i++) {
    const prev = ficheStructure[i - 1];
    const prevDone = prev.points.every(p =>
      !!controles[getKey(prev.zone, prev.sous_zone, p)]?.conformite
    );
    if (!prevDone) break;
    if (cards[i]) {
      cards[i].classList.remove('section-locked');
      cards[i].querySelector('.section-lock-icon')?.remove();
    }
  }

  const allFicheDone = ficheStructure.every(s =>
    s.points.every(p => !!controles[getKey(s.zone, s.sous_zone, p)]?.conformite)
  );
  if (allFicheDone) {
    document.getElementById('sectionMateriel')?.classList.remove('section-locked');
  }
}

async function loadExistingControles() {
  if (!currentVolId) return;

  if (isDemoMode) {
    const data = demoGetControles(currentVolId);
    data.forEach(c => {
      const key = getKey(c.zone, c.sous_zone, c.point_controle);
      controles[key] = { conformite: c.conformite, observation: c.observation, controle_id: c.id, zone: c.zone, sous_zone: c.sous_zone, point: c.point_controle, ncConfirmed: c.conformite === 'NC' && !!c.observation?.trim() };
    });
    restoreConformites();
    return;
  }

  const [{ data }, { data: photosData }] = await Promise.all([
    supabase.from('controles').select('*').eq('vol_id', currentVolId),
    supabase.from('photos').select('controle_id').eq('vol_id', currentVolId)
  ]);
  if (!data) return;

  // Compter les photos par controle_id
  const photoCountMap = {};
  (photosData || []).forEach(p => {
    if (p.controle_id) photoCountMap[p.controle_id] = (photoCountMap[p.controle_id] || 0) + 1;
  });

  data.forEach(c => {
    const key = getKey(c.zone, c.sous_zone, c.point_controle);
    controles[key] = {
      conformite: c.conformite,
      observation: c.observation,
      controle_id: c.id,
      zone: c.zone,
      sous_zone: c.sous_zone,
      point: c.point_controle,
      photoCount: photoCountMap[c.id] || 0
    };
  });
  restoreConformites();
}

// ---- BADGE EN COURS ----

async function updateBadgeEnCours() {
  const badge = document.getElementById('badgeEnCours');

  if (isDemoMode) {
    const count = demoGetVols('demo').filter(v => v.statut === 'en_cours').length;
    if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
    else badge.style.display = 'none';
    return;
  }

  const { data, error } = await supabase
    .from('vols')
    .select('id')
    .eq('agent_id', currentUser?.id)
    .eq('statut', 'en_cours');

  if (!error && data && data.length > 0) {
    enCoursTotal = data.length;
    badge.textContent = enCoursTotal;
    badge.style.display = 'inline-block';
  } else {
    enCoursTotal = 0;
    badge.style.display = 'none';
  }
}

// ---- OFFLINE ----

function setupOfflineDetection() {
  window.addEventListener('offline', () => {
    isOffline = true;
    document.getElementById('offlineBanner').style.display = 'block';
  });
  window.addEventListener('online', async () => {
    isOffline = false;
    document.getElementById('offlineBanner').style.display = 'none';
    await syncOfflineData();
  });
}

function saveToLocalStorage() {
  if (!currentVolId) return;
  localStorage.setItem(`offline_${currentVolId}`, JSON.stringify(controles));
}

async function syncOfflineData() {
  if (isDemoMode) return;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('offline_')) {
      const volId = key.replace('offline_', '');
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      for (const [cKey, c] of Object.entries(data)) {
        if (!c.conformite) continue;
        await supabase.from('controles').upsert({
          vol_id: volId,
          zone: c.zone,
          sous_zone: c.sous_zone || null,
          point_controle: c.point,
          conformite: c.conformite,
          observation: c.observation || null
        }, { onConflict: 'vol_id,zone,sous_zone,point_controle' });
      }
      localStorage.removeItem(key);
    }
  }
  showToast('Données synchronisées ✓', 'success');
}

// ---- MODAL FERMETURE ----

document.getElementById('btnCloseFiche')?.addEventListener('click', () => {
  document.getElementById('modalFiche').style.display = 'none';
});
document.getElementById('btnFermerFiche')?.addEventListener('click', () => {
  document.getElementById('modalFiche').style.display = 'none';
});

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

// ---- DÉMARRAGE ----

init();

// ---- GÉNÉRATION PDF FICHE ----

// Liste maître des matériels (même ordre que l'UI)
const MATERIEL_MASTER = {
  'Seaux toilettes': ['Torchon rouge','Chamoisine','Brosse de toilette','Serpillière','Eau javel','Netal 20/50'],
  'Seaux galley':    ['Torchon vert','Serpillière','Brosse galley','Decap four','Netal 20/50','Palette courte avec brosse'],
  'Seaux cabine':    ['Torchon bleu','Decap four','Brosse bay bay','Brosse tapis','Naga gumm','Nettoyant écran']
};

function loadImageBase64(url) {
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

function loadLogoBase64() {
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

async function downloadFichePDF(volId, typeVol, { returnBlob = false } = {}) {
  if (!returnBlob) showToast('Génération du PDF…', 'info');

  try {
    if (volId === currentVolId) await flushSaves();

    const [{ data: vol }, { data: ctrl }, { data: mats }, { data: photos }, logoB64] = await Promise.all([
      supabase.from('vols').select('*, profiles(nom)').eq('id', volId).single(),
      supabase.from('controles').select('*').eq('vol_id', volId),
      supabase.from('materiels_utilises').select('*').eq('vol_id', volId),
      supabase.from('photos').select('*').eq('vol_id', volId),
      loadLogoBase64()
    ]);

    if (!vol) { showToast('Impossible de charger les données', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const W = 210, M = 10;
    const colW = W - 2 * M;

    const RED   = [190, 30, 45];
    const DKRED = [140, 20, 30];
    const GREY  = [245, 245, 245];
    const DGREY = [220, 220, 220];
    const BLACK = [30, 30, 30];
    const GREEN = [16, 185, 129];

    const ctrlMap = {};
    (ctrl || []).forEach(c => {
      ctrlMap[`${c.zone}|${c.sous_zone || ''}|${c.point_controle}`] = c;
    });

    // Photos par controle_id
    const photosMap = {};
    (photos || []).forEach(p => {
      if (p.controle_id) {
        if (!photosMap[p.controle_id]) photosMap[p.controle_id] = [];
        photosMap[p.controle_id].push(p);
      }
    });

    // Pré-chargement des images NC en base64
    const ncPhotoImgs = {};
    for (const c of (ctrl || [])) {
      if (c.conformite === 'NC') {
        const ps = photosMap[c.id] || [];
        if (ps.length > 0) {
          const loaded = await Promise.all(ps.map(p => loadImageBase64(p.url_publique)));
          ncPhotoImgs[c.id] = loaded.filter(Boolean);
        }
      }
    }

    // Set des matériels cochés (utilise=true)
    const matsChecked = new Set(
      (mats || []).filter(m => m.utilise).map(m => `${m.categorie}|${m.nom_materiel}`)
    );

    const structure = getFicheStructure(typeVol);
    let y = M;

    // ── BANDEAU TITRE ──────────────────────────────────────────
    const headerH = 16;
    doc.setFillColor(...RED);
    doc.rect(M, y, colW, headerH, 'F');

    if (logoB64) {
      // Logo à gauche, proportionnel (hauteur max 13mm)
      const logoH = 13, logoW = 38;
      doc.addImage(logoB64, 'PNG', M + 3, y + 1.5, logoW, logoH);
    } else {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('RAM HANDLING', M + 4, y + 9);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(typeVol, W - M - 2, y + 7, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Fiche de Contrôle Cabine', W - M - 2, y + 13, { align: 'right' });
    y += headerH + 3;

    // ── LIGNE INFO VOL ─────────────────────────────────────────
    const fields = [
      { label: 'Date',            value: vol.date_vol || '—' },
      { label: 'N° Vol',          value: vol.numero_vol || '—' },
      { label: 'Immatriculation', value: vol.immatriculation || '—' },
      { label: 'Début',           value: vol.heure_debut || '—' },
      { label: 'Fin',             value: vol.heure_fin || '—' },
      { label: 'Agent',           value: vol.profiles?.nom || '—' }
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
      doc.setFontSize(8);
      doc.text(String(f.value), x + fw / 2, y + 9, { align: 'center' });
    });
    doc.setDrawColor(200, 200, 200);
    doc.rect(M, y, colW, 11, 'S');
    for (let i = 1; i < fields.length; i++) doc.line(M + i * fw, y, M + i * fw, y + 11);
    y += 14;

    // ── ZONES D'INSPECTION ─────────────────────────────────────
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

    const colZone  = 25;
    const colPoint = 72;
    const colConf  = 22;
    const colNbr   = 22;
    const colObs   = colW - colZone - colPoint - colConf - colNbr;
    const PAGE_H = 297, FOOTER_MARGIN = 15;

    function checkPageBreak(needed) {
      if (y + needed > PAGE_H - FOOTER_MARGIN) { doc.addPage(); y = M; }
    }

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
      doc.text('Zone',               x + colZone / 2,  y + 3.8, { align: 'center' }); x += colZone;
      doc.text('Point de contrôle',  x + colPoint / 2, y + 3.8, { align: 'center' }); x += colPoint;
      doc.text('Conforme',            x + colConf / 2,  y + 3.8, { align: 'center' }); x += colConf;
      doc.text('Non Conforme',       x + colNbr / 2,   y + 3.8, { align: 'center' }); x += colNbr;
      doc.text('Observations',       x + colObs / 2,   y + 3.8, { align: 'center' });
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
      // Zone
      doc.text(zoneName, x + 2, y + 4);
      doc.line(x + colZone, y, x + colZone, y + rowH); x += colZone;
      // Point
      doc.text(doc.splitTextToSize(point, colPoint - 3)[0], x + 2, y + 4);
      doc.line(x + colPoint, y, x + colPoint, y + rowH); x += colPoint;
      // N conforme (C)
      if (conf === 'C') {
        doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold');
        doc.text('C', x + colConf / 2, y + 4, { align: 'center' });
      } else if (conf === 'NC') {
        doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
        doc.text('—', x + colConf / 2, y + 4, { align: 'center' });
      } else {
        doc.setTextColor(200, 200, 200);
        doc.text('—', x + colConf / 2, y + 4, { align: 'center' });
      }
      doc.setTextColor(...BLACK); doc.setFont('helvetica', 'normal');
      doc.line(x + colConf, y, x + colConf, y + rowH); x += colConf;
      // N/C non conforme (NC)
      if (conf === 'NC') {
        doc.setTextColor(239, 68, 68); doc.setFont('helvetica', 'bold');
        doc.text('NC', x + colNbr / 2, y + 4, { align: 'center' });
      } else if (conf === 'C') {
        doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
        doc.text('—', x + colNbr / 2, y + 4, { align: 'center' });
      } else {
        doc.setTextColor(200, 200, 200);
        doc.text('—', x + colNbr / 2, y + 4, { align: 'center' });
      }
      doc.setTextColor(...BLACK); doc.setFont('helvetica', 'normal');
      doc.line(x + colNbr, y, x + colNbr, y + rowH); x += colNbr;
      // Observations
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

    // ── MATÉRIEL UTILISÉ ───────────────────────────────────────
    checkPageBreak(8);
    doc.setFillColor(...DKRED);
    doc.rect(M, y, colW, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Matériel utilisé', M + colW / 2, y + 4, { align: 'center' });
    y += 7;

    // Aspirateurs + Agents
    const aspRow    = (mats || []).find(m => m.categorie === 'Nombre aspirateurs');
    const aspQty    = aspRow ? aspRow.quantite : 0;
    const agentsRow = (mats || []).find(m => m.categorie === 'Nombre agents');
    const agentsQty = agentsRow ? agentsRow.quantite : 0;
    checkPageBreak(6);
    doc.setFillColor(...GREY);
    doc.rect(M, y, colW, 5.5, 'F');
    doc.setTextColor(...BLACK);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Nombre aspirateurs : ${aspQty}`, M + 4, y + 3.8);
    doc.text(`Nombre agents : ${agentsQty}`, M + colW / 2 + 4, y + 3.8);
    y += 7;

    // Catégories — afficher TOUS les items, cochés en vert, non cochés en gris
    const categories = Object.keys(MATERIEL_MASTER);
    const catCols = Math.floor(colW / categories.length);
    const startY = y;
    let maxRowY = startY;

    categories.forEach((cat, ci) => {
      const allItems = MATERIEL_MASTER[cat];
      const x = M + ci * catCols;
      checkPageBreak(6 + allItems.length * 5);

      doc.setFillColor(...DGREY);
      doc.rect(x, startY, catCols, 5.5, 'F');
      doc.setTextColor(...BLACK);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(cat, x + catCols / 2, startY + 3.8, { align: 'center' });

      let rowY = startY + 5.5;
      allItems.forEach((nom, mi) => {
        const checked = matsChecked.has(`${cat}|${nom}`);
        if (mi % 2 === 0) doc.setFillColor(252, 252, 252); else doc.setFillColor(...GREY);
        doc.rect(x, rowY, catCols, 5, 'F');

        if (checked) {
          // Cercle vert + texte noir gras
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
          // Cercle vide gris + texte gris clair
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

    // ── ANNEXE PHOTOS DES ANOMALIES ────────────────────────────
    const ncWithPhotos = (ctrl || []).filter(c =>
      c.conformite === 'NC' && (ncPhotoImgs[c.id] || []).length > 0
    );

    if (ncWithPhotos.length > 0) {
      checkPageBreak(10);
      doc.setFillColor(...RED);
      doc.rect(M, y, colW, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Annexe – Photos des anomalies', M + colW / 2, y + 4, { align: 'center' });
      y += 8;

      structure.forEach(sec => {
        sec.points.forEach(point => {
          const cKey = `${sec.zone}|${sec.sous_zone || ''}|${point}`;
          const c = ctrlMap[cKey];
          if (!c || c.conformite !== 'NC') return;
          const imgs = ncPhotoImgs[c.id] || [];
          if (!imgs.length) return;

          const sectionLabel = sec.sous_zone ? `${sec.zone} – ${sec.sous_zone}` : sec.zone;

          // En-tête de l'anomalie
          checkPageBreak(12);
          doc.setFillColor(255, 240, 240);
          doc.rect(M, y, colW, 7, 'F');
          doc.setDrawColor(...RED);
          doc.rect(M, y, colW, 7, 'S');
          doc.setTextColor(...RED);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          const anomTitle = `${sectionLabel}  —  ${point}`;
          doc.text(anomTitle, M + 3, y + 4.5);
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

          // Photos — 2 par ligne
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
              // Numéro de photo
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

    // ── PIED DE PAGE ───────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor(...DGREY);
      doc.line(M, 285, W - M, 285);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.setFont('helvetica', 'normal');
      doc.text('RAM HANDLING – Contrôle Cabine', M, 290);
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, W - M, 290, { align: 'right' });
      doc.text(`Page ${p}/${pageCount}`, W / 2, 290, { align: 'center' });
    }

    const filename = `Fiche_${vol.numero_vol}_${vol.date_vol}.pdf`.replace(/\//g, '-');

    if (returnBlob) {
      return { blob: doc.output('blob'), filename, vol };
    }

    doc.save(filename);
    showToast('PDF téléchargé ✓', 'success');

  } catch (err) {
    console.error(err);
    if (!returnBlob) showToast('Erreur lors de la génération PDF', 'error');
    return null;
  }
}
