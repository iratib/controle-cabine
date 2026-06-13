// ============================================================
// pwa.js – Gestion PWA : installation + notification de mise à jour
// Chargé en script classique (non-module) dans les 3 pages HTML
// ============================================================

(function () {
  if (!('serviceWorker' in navigator)) return;

  let swReg = null;

  // ── Enregistrement du Service Worker ─────────────────────────
  navigator.serviceWorker.register('/sw.js').then(reg => {
    swReg = reg;

    // Un SW en attente existe déjà (ex : onglet rouvert après déploiement)
    if (reg.waiting) showUpdateBanner(reg);

    // Nouveau SW détecté en cours d'installation
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(reg);
        }
      });
    });

    // Vérifier une mise à jour toutes les 30 minutes
    setInterval(() => reg.update(), 30 * 60 * 1000);

  }).catch(err => console.warn('[PWA] Enregistrement SW échoué :', err));

  // Rechargement automatique quand le nouveau SW prend le contrôle
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  // ── Bannière de mise à jour ───────────────────────────────────
  function showUpdateBanner(reg) {
    if (document.getElementById('pwa-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.innerHTML = `
      <div class="pwa-banner-content">
        <i class="fas fa-rotate" style="color:#4ade80;margin-right:.5rem;"></i>
        <span>Nouvelle version disponible</span>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-btn-update" id="pwa-do-update">Mettre à jour</button>
        <button class="pwa-btn-dismiss" id="pwa-dismiss-update">✕</button>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('pwa-do-update').addEventListener('click', () => {
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      banner.remove();
    });

    document.getElementById('pwa-dismiss-update').addEventListener('click', () => {
      banner.remove();
    });
  }

  // ── Prompt d'installation ─────────────────────────────────────
  let deferredPrompt = null;

  // Exposer la fonction d'install pour le bouton topbar
  window.__pwaInstall = async function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      hideInstallBanner();
      const btn = document.getElementById('pwa-topbar-install');
      if (btn) btn.style.display = 'none';
    }
    deferredPrompt = null;
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    // Afficher le bouton dans la topbar
    const btn = document.getElementById('pwa-topbar-install');
    if (btn) btn.style.display = 'inline-flex';
    // Bannière seulement si pas déjà refusée
    if (!sessionStorage.getItem('pwa-install-dismissed')) showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    hideInstallBanner();
    deferredPrompt = null;
    const btn = document.getElementById('pwa-topbar-install');
    if (btn) btn.style.display = 'none';
  });

  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';

    if (isIOS) {
      if (sessionStorage.getItem('pwa-ios-dismissed')) return;
      banner.innerHTML = `
        <div class="pwa-banner-content">
          <img src="/images/logo.png" alt="Logo" class="pwa-install-logo" />
          <span>Appuyez sur <strong>⬆</strong> puis <strong>Sur l'écran d'accueil</strong> pour installer l'app</span>
        </div>
        <div class="pwa-banner-actions">
          <button class="pwa-btn-dismiss" id="pwa-dismiss-install">Fermer</button>
        </div>
      `;
      document.body.appendChild(banner);
      document.getElementById('pwa-dismiss-install').addEventListener('click', () => {
        banner.remove();
        sessionStorage.setItem('pwa-ios-dismissed', '1');
      });
    } else {
      banner.innerHTML = `
        <div class="pwa-banner-content">
          <img src="/images/logo.png" alt="Logo" class="pwa-install-logo" />
          <span>Installer <strong>Contrôle Cabine</strong> sur cet appareil</span>
        </div>
        <div class="pwa-banner-actions">
          <button class="pwa-btn-install" id="pwa-do-install"><i class="fas fa-download"></i> Installer</button>
          <button class="pwa-btn-dismiss" id="pwa-dismiss-install">Plus tard</button>
        </div>
      `;
      document.body.appendChild(banner);

      document.getElementById('pwa-do-install').addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') hideInstallBanner();
        deferredPrompt = null;
      });

      document.getElementById('pwa-dismiss-install').addEventListener('click', () => {
        hideInstallBanner();
        sessionStorage.setItem('pwa-install-dismissed', '1');
      });
    }
  }

  function hideInstallBanner() {
    document.getElementById('pwa-install-banner')?.remove();
  }
})();
