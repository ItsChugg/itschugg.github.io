/**
 * inject-navbar.js — Fetches and injects the shared navbar and wires the
 * dark/light toggle + colour theme dropdown.
 *
 * Load site-config.js?v=40 synchronously first for theme flash prevention.
 */

// Apply saved theme before first paint to prevent flash.
(function () {
  const t = localStorage.getItem('itschu-theme');
  if (t && t !== 'dark') document.documentElement.setAttribute('data-theme', t);
}());

function wireNavbar() {
  // ── Mark active nav link ──────────────────────────────────────────────────
  const path = window.location.pathname;
  document.querySelectorAll('.navbar-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === '/' ? path === '/' : path.startsWith(href)) {
      a.classList.add('active');
    }
  });

  // ── Theme switcher ────────────────────────────────────────────────────────
  const currentTheme = localStorage.getItem('itschu-theme') || 'dark';

  function applyTheme(name) {
    if (name === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', name);
    }
    localStorage.setItem('itschu-theme', name);
    document.querySelectorAll('.swatch').forEach(sw =>
      sw.classList.toggle('active', sw.dataset.theme === name)
    );
    const tog = document.getElementById('dark-light-toggle');
    if (tog) tog.checked = (name === 'light');
  }

  // Dark ↔ Light slider
  const toggleInput = document.getElementById('dark-light-toggle');
  if (toggleInput) {
    toggleInput.checked = (currentTheme === 'light');
    toggleInput.addEventListener('change', () => {
      applyTheme(toggleInput.checked ? 'light' : 'dark');
    });
  }

  // Colour theme dropdown
  const extrasBtn  = document.getElementById('theme-extras-btn');
  const extrasMenu = document.getElementById('theme-extras-menu');
  if (extrasBtn && extrasMenu) {
    extrasBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = extrasMenu.classList.toggle('open');
      extrasBtn.classList.toggle('open', isOpen);
    });
    document.addEventListener('click', () => {
      extrasMenu.classList.remove('open');
      extrasBtn?.classList.remove('open');
    });
    extrasMenu.querySelectorAll('.swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.theme === currentTheme);
      s.addEventListener('click', () => {
        applyTheme(s.dataset.theme);
        // All colour themes are dark-based — move toggle to dark position
        if (toggleInput) toggleInput.checked = false;
        extrasMenu.classList.remove('open');
        extrasBtn.classList.remove('open');
      });
    });
  }
}

// Skip fetch if navbar is already inlined (e.g. globe viewer).
if (document.querySelector('.navbar')) {
  wireNavbar();
} else {
  fetch('/components/navbar/navbar.html?v=40')
    .then(res => res.text())
    .then(html => {
      document.body.insertAdjacentHTML('afterbegin', html);
      wireNavbar();
    })
    .catch(err => console.error('Navbar injection failed:', err));
}
