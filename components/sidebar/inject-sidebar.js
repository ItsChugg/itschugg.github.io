// Builds a collapsible sidebar from /pages/wikipedia/pages.json
// and injects it into #sidebar-container.

document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar-container');
  if (!sidebar) return;

  fetch('/pages/wikipedia/pages.json')
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      const nav = document.createElement('nav');

      const title = document.createElement('div');
      title.className = 'subpage-bar-title';
      title.textContent = 'PAGE INDEX';
      nav.appendChild(title);

      const currentPath = window.location.pathname;
      const base = '/pages/wikipedia/';

      data.forEach(group => {
        // Category toggle button
        const toggle = document.createElement('button');
        toggle.className = 'dropdown-toggle';
        toggle.innerHTML = `${group.category} <span class="arrow">▶</span>`;

        // Page list
        const list = document.createElement('ul');
        list.className = 'dropdown';

        let hasActive = false;

        group.pages.forEach(page => {
          const href = base + page.file;
          const li   = document.createElement('li');
          const a    = document.createElement('a');
          a.href      = href;
          a.textContent = page.title;
          if (currentPath === href || currentPath.startsWith(href.replace(/\.html$/, '/'))) {
            a.classList.add('active');
            hasActive = true;
          }
          li.appendChild(a);
          list.appendChild(li);
        });

        // Auto-open the active category
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

  // Inject edit button for logged-in users on any wiki page
  try {
    const s = JSON.parse(localStorage.getItem('wiki_session') || 'null');
    if (s && Date.now() < s.expires) {
      const a = document.createElement('a');
      a.href = '/pages/wikipedia/editor/?edit=' + encodeURIComponent(window.location.pathname);
      a.textContent = '✎ EDIT PAGE';
      a.className = 'wiki-edit-btn';
      document.body.appendChild(a);
    }
  } catch(e) {}
});
