// ============================================================
// utils.js – Utilitaires partagés
// ============================================================

export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-show'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function getStatutBadge(statut) {
  const map = {
    en_cours: '<span class="statut-badge statut-en_cours">En cours</span>',
    soumis:   '<span class="statut-badge statut-soumis">Soumis</span>',
    'validé': '<span class="statut-badge statut-valide">Validé</span>',
    'rejeté': '<span class="statut-badge statut-rejete">Rejeté</span>'
  };
  return map[statut] || statut;
}
