/**
 * site-config.js?v=13 — Site-wide constants and shared session helper.
 * Load this BEFORE inject-navbar.js and any inline scripts that need SITE.
 *
 * Exposes: window.SITE = { REPO, ALLOWED, getSession() }
 */
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
