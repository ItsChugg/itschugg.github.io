/**
 * inject-navbar.js — Fetches and injects the shared navbar, wires theme
 * swatches, swaps the LOGIN link for a user avatar when signed in, and
 * injects wiki edit/create buttons on relevant pages.
 *
 * Requires site-config.js?v=4 to be loaded first (uses SITE.getSession).
 */

// Apply saved theme before first paint to prevent flash.
(function () {
  const t = localStorage.getItem('itschu-theme');
  if (t && t !== 'dark') document.documentElement.setAttribute('data-theme', t);
}());

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
    // parts[0] = 'wikipedia', parts[1] = wiki slug, parts[2+] = article path

    if (parts[0] === 'wikipedia' && parts[1]) {
      const slug = parts[1];
      const btn  = document.createElement('a');
      btn.className = 'wiki-edit-btn';

      if (parts.length >= 3) {
        // Article page inside a wiki
        btn.href      = `/wikipedia/editor/?wiki=${slug}&edit=${encodeURIComponent(path)}`;
        btn.textContent = '✎ EDIT PAGE';
        document.body.appendChild(btn);
      } else if (parts.length === 2) {
        // Wiki hub page: /wikipedia/{slug}/
        btn.href      = `/wikipedia/hub-editor/?wiki=${slug}`;
        btn.textContent = '✎ EDIT HOME';
        document.body.appendChild(btn);
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

  // ── Theme swatches ────────────────────────────────────────────────────────
  const currentTheme = localStorage.getItem('itschu-theme') || 'dark';
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === currentTheme);
    s.addEventListener('click', () => {
      const name = s.dataset.theme;
      if (name === 'dark') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', name);
      }
      localStorage.setItem('itschu-theme', name);
      document.querySelectorAll('.swatch').forEach(sw =>
        sw.classList.toggle('active', sw.dataset.theme === name)
      );
    });
  });
}

// Skip fetch if navbar is already inlined (e.g. globe viewer).
if (document.querySelector('.navbar')) {
  wireNavbar();
} else {
  fetch('/components/navbar/navbar.html?v=4')
    .then(res => res.text())
    .then(html => {
      document.body.insertAdjacentHTML('afterbegin', html);
      wireNavbar();
    })
    .catch(err => console.error('Navbar injection failed:', err));
}
