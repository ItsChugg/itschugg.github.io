/**
 * inject-navbar.js — Fetches and injects the shared navbar, wires the
 * dark/light toggle + colour theme dropdown, swaps LOGIN for an avatar
 * when signed in, and injects wiki edit buttons on relevant pages.
 *
 * Requires site-config.js?v=28 to be loaded synchronously first (uses SITE.getSession).
 */

// Apply saved theme before first paint to prevent flash.
(function () {
  const t = localStorage.getItem('itschu-theme');
  if (t && t !== 'dark') document.documentElement.setAttribute('data-theme', t);
}());

// Utility paths that sit at /wikipedia/{slug}/ but are NOT wiki hubs
const WIKI_UTILITY_SLUGS = new Set(['new', 'editor', 'hub-editor']);

function wireNavbar() {
  const session = SITE.getSession();

  // ── Swap LOGIN → avatar + username when signed in ─────────────────────────
  const loginLink = document.getElementById('navbar-login-link');
  if (loginLink && session) {
    const img     = document.createElement('img');
    img.src       = session.avatar;
    img.alt       = session.username;
    img.className = 'navbar-user-avatar';
    loginLink.textContent = '';
    loginLink.appendChild(img);
    loginLink.appendChild(document.createTextNode(session.username.toUpperCase()));
    loginLink.href = '/account/';
    loginLink.classList.add('navbar-user');
  }

  // ── Wiki action buttons (only for signed-in users) ────────────────────────
  if (session) {
    const path  = window.location.pathname;
    const parts = path.split('/').filter(Boolean);

    if (parts[0] === 'wikipedia' && parts[1] && !WIKI_UTILITY_SLUGS.has(parts[1])) {
      const slug = parts[1];
      const btn  = document.createElement('a');
      btn.className = 'wiki-edit-btn';

      if (parts.length >= 3) {
        // Article page — single EDIT PAGE button
        btn.href      = `/wikipedia/editor/?wiki=${slug}&edit=${encodeURIComponent(path)}`;
        btn.textContent = '✎ EDIT PAGE';
        document.body.appendChild(btn);
      } else if (parts.length === 2) {
        // Wiki hub page — CREATE PAGE (primary) + EDIT HOME (stacked above it)
        btn.href      = `/wikipedia/editor/?wiki=${slug}`;
        btn.textContent = '+ CREATE PAGE';
        document.body.appendChild(btn);

        const editBtn = document.createElement('a');
        editBtn.href      = `/wikipedia/hub-editor/?wiki=${slug}`;
        editBtn.textContent = '✎ EDIT HOME';
        editBtn.className = 'wiki-edit-btn wiki-edit-btn-alt';
        document.body.appendChild(editBtn);
      }
    }
  }

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
  fetch('/components/navbar/navbar.html?v=28')
    .then(res => res.text())
    .then(html => {
      document.body.insertAdjacentHTML('afterbegin', html);
      wireNavbar();
    })
    .catch(err => console.error('Navbar injection failed:', err));
}
