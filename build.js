#!/usr/bin/env node
/**
 * build.js — Stamps the current build version into every asset reference.
 *
 * Usage:   node build.js
 * Or:      npm run build
 *
 * Increments buildId in package.json and rewrites every ?v=... query string
 * on theme.css, inject-navbar.js, inject-sidebar.js, site-config.js,
 * wiki-utils.js and navbar.html throughout the project.
 *
 * A .githooks/pre-commit hook runs this automatically before each commit.
 * Enable it once with:  git config core.hooksPath .githooks
 */

const fs   = require('fs');
const path = require('path');

// ── Bump build counter ────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.buildId = (pkg.buildId || 0) + 1;
const VER = String(pkg.buildId);
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(`\n🔨  Build #${VER}\n`);

// ── Asset patterns to stamp ───────────────────────────────────────────────────
// Each entry: regex to find an existing versioned (or unversioned) reference,
// and the replacement string containing the new version.
const STAMPS = [
  { re: /theme\.css\?v=[^"'\s]*/g,                        out: `theme.css?v=${VER}` },
  { re: /inject-navbar\.js\?v=[^"'\s]*/g,                 out: `inject-navbar.js?v=${VER}` },
  { re: /inject-sidebar\.js(?:\?v=[^"'\s]*)?(?=["'\s>])/g, out: `inject-sidebar.js?v=${VER}` },
  { re: /site-config\.js(?:\?v=[^"'\s]*)?(?=["'\s>])/g,   out: `site-config.js?v=${VER}` },
  { re: /wiki-utils\.js(?:\?v=[^"'\s]*)?(?=["'\s>])/g,    out: `wiki-utils.js?v=${VER}` },
  { re: /navbar\.html\?v=[^"'\s]*/g,                       out: `navbar.html?v=${VER}` },
];

// ── File walker ───────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['_backup', 'node_modules', '.git', 'assets']);

function walk(dir) {
  const results = [];
  for (const f of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(f)) continue;
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (f.endsWith('.html') || f.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

// ── Stamp files ───────────────────────────────────────────────────────────────
let updated = 0;
for (const file of walk('.')) {
  // Skip build.js itself (no asset refs inside)
  if (path.basename(file) === 'build.js') continue;

  let content = fs.readFileSync(file, 'utf8');
  let stamped = content;
  for (const { re, out } of STAMPS) {
    stamped = stamped.replace(re, out);
  }
  if (stamped !== content) {
    fs.writeFileSync(file, stamped);
    console.log(`  ✓  ${file}`);
    updated++;
  }
}

console.log(`\n  ${updated} file(s) updated → version ${VER}\n`);
