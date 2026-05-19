// Inject navbar and highlight the active link
fetch('/components/navbar/navbar.html')
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
  })
  .catch(err => console.error('Navbar injection failed:', err));
