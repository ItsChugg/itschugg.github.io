/**
 * wiki-utils.js?v=31 — Shared utilities for wiki editing and rendering.
 * Requires site-config.js?v=31 to be loaded first (uses SITE.REPO, SITE.getSession).
 *
 * Exposes: window.WIKI = { slugify, esc, toB64, ghPut, renderWikiGrid, genHubHTML }
 */
(function () {

  // ── Pure helpers ────────────────────────────────────────────────────────────

  /** Read the build version from this page's own CSS link (for generated HTML). */
  function liveVer() {
    try {
      const link = document.querySelector('link[href*="theme.css"]');
      const m = link && link.getAttribute('href').match(/\?v=(\d+)/);
      return m ? m[1] : '14';
    } catch { return '14'; }
  }

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

  // ── GitHub API helpers ──────────────────────────────────────────────────────

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

  /** DELETE a file from GitHub. Silently skips if file doesn't exist. */
  async function ghDelete(filePath, message) {
    const session = SITE.getSession();
    if (!session) throw new Error('Not authenticated');
    const url  = `https://api.github.com/repos/${SITE.REPO}/contents/${filePath}`;
    const hdrs = {
      'Authorization': `Bearer ${session.token}`,
      'Accept':        'application/vnd.github+json'
    };
    const chk = await fetch(url, { headers: hdrs });
    if (!chk.ok) return; // Already gone — that's fine
    const sha  = (await chk.json()).sha;
    const resp = await fetch(url, {
      method:  'DELETE',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, sha, branch: 'main' })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || String(resp.status));
    }
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

  // ── Category page shell generator ──────────────────────────────────────────

  /**
   * Returns a generic category-hub shell HTML.
   * The page derives the wiki + category from its own URL at runtime, so the
   * same HTML can be placed at any wikipedia/{wiki}/{cat-slug}/index.html path.
   */
  function genCategoryHTML() {
    const v = liveVer();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Loading… — ITSCHU.GG</title>
  <link rel="icon" href="/assets/icons/favicon.png" type="image/png" />
  <link rel="stylesheet" href="/components/themes/theme.css?v=31" />
  <script src="/components/site-config.js?v=31"><\/script>
  <script src="/components/navbar/inject-navbar.js?v=31" defer><\/script>
  <script src="/components/sidebar/inject-sidebar.js?v=31" defer><\/script>
</head>
<body>
  <div class="page-wrapper">
    <div class="wiki-layout">
      <aside id="sidebar-container" class="subpage-bar"></aside>
      <main class="wiki-article">
        <div class="wiki-breadcrumb" id="cat-bc"><a href="/">HOME</a></div>
        <h1 id="cat-title"></h1>
        <div id="cat-lead"></div>
        <hr class="wiki-rule" style="margin-top:18px;">
        <div id="cat-articles" style="margin-top:16px;"></div>
        <div class="wiki-meta" style="margin-top:28px;">
          <div class="wiki-meta-edited" id="cat-footer"></div>
        </div>
      </main>
    </div>
  </div>
  <script>
    (function(){
      var sl=function(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');};
      var pts=location.pathname.replace(/\\/+$/,'').split('/').filter(Boolean);
      var wiki=pts[1], cat=pts[2];
      fetch('/wikipedia/'+wiki+'/pages.json')
        .then(function(r){return r.json();})
        .then(function(data){
          var g=data.find(function(c){return (c.slug||sl(c.category))===cat;});
          if(!g){document.getElementById('cat-title').textContent='Category not found';return;}
          document.title=g.category+' — ITSCHU.GG';
          document.getElementById('cat-title').textContent=g.category;
          document.getElementById('cat-bc').innerHTML=
            '<a href="/">HOME</a><span class="sep"> // </span>'+
            '<a href="/wikipedia/">WIKIPEDIA</a><span class="sep"> // </span>'+
            '<a href="/wikipedia/'+wiki+'/">'+wiki.toUpperCase()+'</a><span class="sep"> // </span>'+
            g.category.toUpperCase();
          if(g.lead)document.getElementById('cat-lead').innerHTML=g.lead;
          var box=document.getElementById('cat-articles');
          if(!g.pages||!g.pages.length){
            box.innerHTML='<p style="color:var(--text-muted);font-size:0.85rem;">No articles in this category yet.</p>';
            return;
          }
          g.pages.forEach(function(p){
            var href='/wikipedia/'+wiki+'/'+p.file.replace(/index\\.html$/,'').replace(/\\.html$/,'/');
            var a=document.createElement('a');
            a.className='wiki-cat-article';
            a.href=href;
            a.textContent=p.title;
            box.appendChild(a);
          });
        })
        .catch(function(){document.getElementById('cat-title').textContent='Error loading category';});
    })();
  <\/script>
</body>
</html>`;
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
   * Version strings (theme.css?v=31 inject-navbar.js?v=31 inject-sidebar.js?v=31
   * are updated automatically by `node build.js`.
   */
  function genHubHTML(state, slug) {
    const v        = liveVer();
    const title    = esc(state.title || 'Untitled');
    // Support both new rich-text leadHtml (v2 editor) and old plain-text lead (v1)
    const leadHtml = state.leadHtml || leadToHtml(state.lead || '');

    // Normalise featured: support old single-object and new array format
    const featArr = Array.isArray(state.featured)
      ? state.featured.filter(f => f.title)
      : (state.featured?.title ? [state.featured] : []);

    const featHtml = featArr.length
      ? featArr.map(f => `
          <div class="wiki-hub-box">
            <div class="wiki-hub-box-title">Featured — ${esc(f.title)}</div>
            <p style="font-size:0.83rem;line-height:1.75;">
              <strong><a href="${esc(f.link || '#')}">${esc(f.title)}</a></strong>
              ${esc(f.excerpt)}
            </p>
            <p style="font-size:0.78rem;margin-top:8px;">
              <a href="${esc(f.link || '#')}">Read full article &rarr;</a>
            </p>
          </div>`).join('\n')
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ITSCHU.GG</title>
  <link rel="icon" href="/assets/icons/favicon.png" type="image/png" />
  <link rel="stylesheet" href="/components/themes/theme.css?v=31" />
  <script src="/components/site-config.js?v=31"><\/script>
  <script src="/components/navbar/inject-navbar.js?v=31" defer><\/script>
  <script src="/components/sidebar/inject-sidebar.js?v=31" defer><\/script>
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

        <div class="wiki-stats wiki-stats-sm">
          <div class="wiki-stat">
            <span class="wiki-stat-num" id="stat-pages">—</span>
            <span class="wiki-stat-label">Pages</span>
          </div>
          <div class="wiki-stat">
            <span class="wiki-stat-num" id="stat-cats">—</span>
            <span class="wiki-stat-label">Categories</span>
          </div>
        </div>

        ${featHtml}

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
        var sp = document.getElementById('stat-pages');
        var sc = document.getElementById('stat-cats');
        if (sp) sp.textContent = data.reduce(function(n, g) { return n + g.pages.length; }, 0);
        if (sc) sc.textContent = data.length;
        var cats = document.getElementById('hub-categories');
        if (cats) data.forEach(function(g) {
          var catSlug = g.slug || g.category.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
          var a = document.createElement('a');
          a.className = 'wiki-category-card';
          a.href = '/wikipedia/${slug}/' + catSlug + '/';
          a.innerHTML = '<div class="cat-name">' + g.category + '</div><div class="cat-count">' +
            g.pages.length + ' article' + (g.pages.length === 1 ? '' : 's') + '</div>';
          cats.appendChild(a);
        });
      })
      .catch(function() {});
  <\/script>

</body>
</html>`;
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  window.WIKI = { slugify, esc, toB64, ghPut, ghDelete, renderWikiGrid, genHubHTML, genCategoryHTML, leadToHtml };

}());
