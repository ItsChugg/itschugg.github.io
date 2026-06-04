/**
 * wiki-utils.js?v=6 — Shared utilities for wiki editing and rendering.
 * Requires site-config.js?v=6 to be loaded first (uses SITE.REPO, SITE.getSession).
 *
 * Exposes: window.WIKI = { slugify, esc, toB64, ghPut, renderWikiGrid, genHubHTML }
 */
(function () {

  // ── Pure helpers ────────────────────────────────────────────────────────────

  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toB64(s) {
    return btoa(unescape(encodeURIComponent(s)));
  }

  // ── GitHub API helper ───────────────────────────────────────────────────────

  /** PUT a file to GitHub. Fetches the existing SHA automatically. */
  async function ghPut(filePath, content, message) {
    const session = SITE.getSession();
    if (!session) throw new Error('Not authenticated');
    const url  = `https://api.github.com/repos/${SITE.REPO}/contents/${filePath}`;
    const hdrs = {
      'Authorization': `Bearer ${session.token}`,
      'Accept':        'application/vnd.github+json'
    };
    let sha = null;
    try {
      const chk = await fetch(url, { headers: hdrs });
      if (chk.ok) sha = (await chk.json()).sha;
    } catch {}
    const body = { message, content: toB64(content), branch: 'main' };
    if (sha) body.sha = sha;
    const resp = await fetch(url, {
      method:  'PUT',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || String(resp.status));
    }
    return resp.json();
  }

  // ── Wiki card grid ──────────────────────────────────────────────────────────

  /**
   * Fetches /wikipedia/wikis.json and renders wiki cards into `containerId`.
   * Appends a "Create a new Wikipedia" card for authorised users.
   */
  function renderWikiGrid(containerId) {
    const session = SITE.getSession();
    const grid    = document.getElementById(containerId);
    if (!grid) return;

    fetch('/wikipedia/wikis.json')
      .then(r => r.json())
      .then(wikis => {
        wikis.forEach(w => {
          const a = document.createElement('a');
          a.className = 'wiki-hub-card';
          a.href      = '/wikipedia/' + w.slug + '/';
          a.innerHTML = `<div class="wiki-hub-card-name">${esc(w.name)}</div>
                         <div class="wiki-hub-card-desc">${esc(w.description)}</div>`;
          grid.appendChild(a);
        });
        if (session && SITE.ALLOWED.includes(session.username)) {
          const btn = document.createElement('a');
          btn.className = 'wiki-hub-card create';
          btn.href      = '/wikipedia/new/';
          btn.innerHTML = `<div class="wiki-hub-card-name">+</div>
                           <div class="wiki-hub-card-desc">Create a new Wikipedia</div>`;
          grid.appendChild(btn);
        }
      })
      .catch(() => {
        grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;">Could not load wikis.</p>';
      });
  }

  // ── Hub HTML generator ──────────────────────────────────────────────────────

  /** Converts plain text with blank-line paragraphs + **bold** / *italic* to HTML. */
  function leadToHtml(text) {
    return (text || '').split(/\n\n+/).filter(Boolean).map(p =>
      `<p>${p.trim()
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      }</p>`
    ).join('\n        ');
  }

  /**
   * Generates a complete wiki hub index.html for the given state + wiki slug.
   * Version strings (theme.css?v=6 inject-navbar.js?v=6 inject-sidebar.js?v=6
   * are updated automatically by `node build.js`.
   */
  function genHubHTML(state, slug) {
    const title     = esc(state.title || 'Untitled');
    const leadHtml  = leadToHtml(state.lead || '');
    const statsHtml = (state.stats || []).filter(s => s.label).map(s =>
      `<div class="wiki-stat">
            <span class="wiki-stat-num">${esc(s.num)}</span>
            <span class="wiki-stat-label">${esc(s.label)}</span>
          </div>`
    ).join('\n          ');

    const ft       = state.featured || {};
    const featHtml = ft.title ? `
          <div class="wiki-hub-box">
            <div class="wiki-hub-box-title">Featured Article — ${esc(ft.title)}</div>
            <p style="font-size:0.83rem;line-height:1.75;">
              <strong><a href="${esc(ft.link || '#')}">${esc(ft.title)}</a></strong>
              ${esc(ft.excerpt)}
            </p>
            <p style="font-size:0.78rem;margin-top:8px;">
              <a href="${esc(ft.link || '#')}">Read full article &rarr;</a>
            </p>
          </div>` : '<div class="wiki-hub-box"></div>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ITSCHU.GG</title>
  <link rel="icon" href="/assets/icons/favicon.png" type="image/png" />
  <link rel="stylesheet" href="/components/themes/theme.css?v=6" />
</head>
<body>

  <div class="page-wrapper">
    <div class="wiki-layout">

      <aside id="sidebar-container" class="subpage-bar"></aside>

      <main class="wiki-article">

        <div class="wiki-breadcrumb">
          <a href="/">HOME</a>
          <span class="sep">//</span>
          <a href="/wikipedia/">WIKIPEDIA</a>
          <span class="sep">//</span>
          ${title.toUpperCase()}
        </div>

        <h1>${title}</h1>
        ${leadHtml}

        <hr class="wiki-rule">

        <div class="wiki-stats">
          ${statsHtml}
        </div>

        <div class="wiki-hub-cols">
          ${featHtml}
          <div class="wiki-hub-box">
            <div class="wiki-hub-box-title">Quick Navigation</div>
            <ul id="hub-quicknav-list"></ul>
          </div>
        </div>

        <section>
          <h2>Browse by Category</h2>
          <div class="wiki-categories" id="hub-categories"></div>
        </section>

        <div class="wiki-meta">
          <div class="wiki-meta-edited">${esc(state.footerNote || '')}</div>
        </div>

      </main>
    </div>
  </div>

  <script>
    fetch('/wikipedia/${slug}/pages.json')
      .then(r => r.json())
      .then(data => {
        const nav  = document.getElementById('hub-quicknav-list');
        const cats = document.getElementById('hub-categories');
        data.forEach(g => {
          if (nav) {
            const li = document.createElement('li');
            li.innerHTML = '<a href="#">' + g.category + '</a> — ' +
              g.pages.slice(0, 3).map(p => p.title).join(', ');
            nav.appendChild(li);
          }
          if (cats) {
            const a = document.createElement('a');
            a.className = 'wiki-category-card';
            a.href = '#';
            a.innerHTML = '<div class="cat-name">' + g.category + '</div>' +
              '<div class="cat-count">' + g.pages.length +
              ' article' + (g.pages.length === 1 ? '' : 's') + '</div>';
            cats.appendChild(a);
          }
        });
      });
  <\/script>

  <script src="/components/site-config.js?v=6"></script>
  <script src="/components/navbar/inject-navbar.js?v=6" defer></script>
  <script src="/components/sidebar/inject-sidebar.js?v=6" defer></script>
</body>
</html>`;
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  window.WIKI = { slugify, esc, toB64, ghPut, renderWikiGrid, genHubHTML, leadToHtml };

}());
