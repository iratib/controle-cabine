// js/theme.js — gestion du mode nuit
export function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  const btn = document.getElementById('btnTheme');
  if (!btn) return;
  _updateBtn(btn, saved);

  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    _updateBtn(btn, next);
  });
}

function _updateBtn(btn, theme) {
  btn.innerHTML = theme === 'dark'
    ? '<i class="fas fa-sun"></i>'
    : '<i class="fas fa-moon"></i>';
  btn.title = theme === 'dark' ? 'Mode jour' : 'Mode nuit';
  btn.setAttribute('aria-label', theme === 'dark' ? 'Mode jour' : 'Mode nuit');
}
