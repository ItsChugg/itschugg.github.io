/**
 * site-config.js?v=26 — Site-wide constants and shared session helper.
 * Load this BEFORE inject-navbar.js and any inline scripts that need SITE.
 *
 * Exposes: window.SITE = { REPO, ALLOWED, getSession() }
 *
 * This file is loaded synchronously (no defer/async) so it also handles
 * theme flash prevention — applying the saved theme before the first paint.
 */

// ── Theme flash prevention ────────────────────────────────────────────────────
// Runs synchronously in <head>, before any CSS-dependent paint, so there is no
// frame of the wrong theme before inject-navbar.js (deferred) kicks in.
(function () {
  try {
    var t = localStorage.getItem('itschu-theme');
    if (t && t !== 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
}());

(function () {
  window.SITE = {
    REPO:    'ItsChugg/itschugg.github.io',
    ALLOWED: ['ItsChugg', 'zmbprotocol', 'Zachary-N-Kaleno'],

    /** Returns the current session object or null if expired / missing. */
    getSession() {
      try {
        const s = JSON.parse(localStorage.getItem('wiki_session') || 'null');
        if (!s || Date.now() > s.expires) return null;
        return s;
      } catch { return null; }
    }
  };
}());
