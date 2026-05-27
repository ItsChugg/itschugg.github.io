// Apply saved theme before first paint to prevent flash.
// 'dark' is the default (no data-theme attribute = dark mode via :root).
(function () {
  var t = localStorage.getItem('itschu-theme');
  if (t && t !== 'dark') document.documentElement.setAttribute('data-theme', t);
}());

function wireNavbar() {
  // Swap LOGIN link → username if a valid session exists
  const loginLink = document.getElementById('navbar-login-link');
  if (loginLink) {
    try {
      const s = JSON.parse(localStorage.getItem('wiki_session') || 'null');
      if (s && Date.now() < s.expires) {
        loginLink.textContent = '> ' + s.username.toUpperCase();
        loginLink.href        = '/login/';
      }
    } catch {}
  }

  // Mark the current page's nav link as active
  const links = document.querySelectorAll('.navbar-links a');
  const path  = window.location.pathname;
  links.forEach(a => {
    const href = a.getAttribute('href');
    if (href === '/' ? path === '/' : path.startsWith(href)) {
      a.classList.add('active');
    }
  });

  // Wire up theme swatches
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
      document.querySelectorAll('.swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.theme === name);
      });
    });
  });
}

// If the navbar is already inlined in the page (e.g. globe), skip the fetch
// and just wire up the interactive bits.
if (document.querySelector('.navbar')) {
  wireNavbar();
} else {
  fetch('/components/navbar/navbar.html?v=6')
    .then(res => res.text())
    .then(html => {
      document.body.insertAdjacentHTML('afterbegin', html);
      wireNavbar();
    })
    .catch(err => console.error('Navbar injection failed:', err));
}
