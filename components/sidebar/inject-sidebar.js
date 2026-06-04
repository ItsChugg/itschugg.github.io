/**
 * inject-sidebar.js?v=3 — Builds a collapsible sidebar from the current wiki's
 * pages.json and injects it into #sidebar-container.
 *
 * Wiki slug is derived automatically from the URL:
 *   /wikipedia/{slug}/... → fetches /wikipedia/{slug}/pages.json
 */
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar-container');
  if (!sidebar) return;

  // Derive which wiki we're in from the URL path
  const parts    = window.location.pathname.split('/').filter(Boolean);
  // Expect:  ['wikipedia', '{slug}', ...]
  if (parts.length < 2 || parts[0] !== 'wikipedia') return;
  const wikiSlug = parts[1];
  const base     = `/wikipedia/${wikiSlug}/`;

  fetch(`/wikipedia/${wikiSlug}/pages.json`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      const nav         = document.createElement('nav');
      const title       = document.createElement('div');
      title.className   = 'subpage-bar-title';
      title.textContent = 'PAGE INDEX';
      nav.appendChild(title);

      const currentPath = window.location.pathname;

      data.forEach(group => {
        const toggle = document.createElement('button');
        toggle.className = 'dropdown-toggle';
        toggle.innerHTML = `${group.category} <span class="arrow">▶</span>`;

        const list      = document.createElement('ul');
        list.className  = 'dropdown';
        let hasActive   = false;

        group.pages.forEach(page => {
          const href = base + page.file;
          const li   = document.createElement('li');
          const a    = document.createElement('a');
          a.href        = href;
          a.textContent = page.title;
          if (currentPath === href ||
              currentPath.startsWith(href.replace(/\.html$/, '/'))) {
            a.classList.add('active');
            hasActive = true;
          }
          li.appendChild(a);
          list.appendChild(li);
        });

        if (hasActive) {
          list.classList.add('open');
          toggle.classList.add('open');
        }
        toggle.addEventListener('click', () => {
          list.classList.toggle('open');
          toggle.classList.toggle('open');
        });

        nav.appendChild(toggle);
        nav.appendChild(list);
      });

      sidebar.innerHTML = '';
      sidebar.appendChild(nav);
    })
    .catch(err => console.error('Sidebar failed to load:', err));
});
