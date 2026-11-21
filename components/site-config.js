/**
 * site-config.js?v=36 — Site-wide constants.
 * Load this BEFORE inject-navbar.js.
 *
 * Exposes: window.SITE = { REPO }
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

window.SITE = {
  REPO: 'ItsChugg/itschugg.github.io',
};
