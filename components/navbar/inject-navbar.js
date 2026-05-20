// Apply saved theme before first paint to prevent flash
(function () {
  var t = localStorage.getItem('itschu-theme');
  if (t && t !== 'amber') document.documentElement.setAttribute('data-theme', t);
}());

fetch('/components/navbar/navbar.html?v=4')
  .then(res => res.text())
  .then(html => {
    document.body.insertAdjacentHTML('afterbegin', html);

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
    const currentTheme = localStorage.getItem('itschu-theme') || 'amber';
    document.querySelectorAll('.swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.theme === currentTheme);
      s.addEventListener('click', () => {
        const name = s.dataset.theme;
        if (name === 'amber') {
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
  })
  .catch(err => console.error('Navbar injection failed:', err));
