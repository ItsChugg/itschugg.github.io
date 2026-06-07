/**
 * inject-sidebar.js?v=25 — Builds a collapsible sidebar from the current wiki's
 * pages.json and injects it into #sidebar-container.
 *
 * Each category header is split into:
 *   • A link   → navigates to /wikipedia/{wiki}/{category-slug}/
 *   • An arrow → expands / collapses the article list
 *
 * Wiki slug is derived automatically from the URL:
 *   /wikipedia/{slug}/... → fetches /wikipedia/{slug}/pages.json
 */
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar-container');
  if (!sidebar) return;

  const parts    = window.location.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'wikipedia') return;
  const wikiSlug = parts[1];
  const base     = `/wikipedia/${wikiSlug}/`;

  const slugify  = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  fetch(`/wikipedia/${wikiSlug}/pages.json`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      const nav = document.createElement('nav');

      const title = document.createElement('div');
      title.className   = 'subpage-bar-title';
      title.textContent = 'PAGE INDEX';
      nav.appendChild(title);

      const currentPath = window.location.pathname;

      data.forEach(group => {
        const catSlug    = group.slug || slugify(group.category);
        const catHref    = base + catSlug + '/';

        // ── Category header row ──────────────────────────────────────────────
        // Left: link to category page; Right: expand/collapse arrow button
        const header = document.createElement('div');
        header.className = 'dropdown-header';

        const catLink = document.createElement('a');
        catLink.href      = catHref;
        catLink.className = 'dropdown-cat-link';
        catLink.textContent = group.category;
        // Highlight if we're currently on this category's hub page
        if (currentPath === catHref || currentPath === catHref + 'index.html') {
          catLink.classList.add('active');
        }

        const arrow = document.createElement('button');
        arrow.className = 'dropdown-arrow';
        arrow.innerHTML = '<span class="arrow">▶</span>';
        arrow.setAttribute('aria-label', 'Toggle ' + group.category);

        header.appendChild(catLink);
        header.appendChild(arrow);

        // ── Article list ─────────────────────────────────────────────────────
        const list     = document.createElement('ul');
        list.className = 'dropdown';
        let hasActive  = false;

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
          arrow.classList.add('open');
        }

        arrow.addEventListener('click', () => {
          list.classList.toggle('open');
          arrow.classList.toggle('open');
        });

        nav.appendChild(header);
        nav.appendChild(list);
      });

      sidebar.innerHTML = '';
      sidebar.appendChild(nav);
    })
    .catch(err => console.error('Sidebar failed to load:', err));
});
