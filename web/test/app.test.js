'use strict';
/* Static checks on the shipped files: brand asset integrity, token discipline, sprite sync, EN/RU coverage. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const web = path.join(__dirname, '..');
const root = path.join(web, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const html = read(web, 'index.html');
const subpaths = (svg) => /<path[^>]* d="([^"]+)"/.exec(svg)[1].match(/M[^M]*/g);

test('brand: production mark = source minus the registered-mark glyph, geometry untouched', () => {
  const src = subpaths(read(root, 'design-reference', 'brand-logo.svg'));
  const prod = subpaths(read(web, 'assets', 'brand-logo.svg'));
  assert.equal(src.length, 8);
  assert.equal(prod.length, 4);
  assert.deepEqual(prod, src.slice(0, 4));            // cow + chair sub-paths identical to the supplied file
  assert.match(read(web, 'assets', 'brand-logo.svg'), /viewBox="0 0 947 1072"/);
  assert.match(read(web, 'assets', 'brand-logo.svg'), /fill="currentColor"/);
});

test('brand: no registered-mark symbol and no pixel/web fonts in the product UI', () => {
  assert.ok(!html.includes('®') && !html.includes('&reg;'));
  assert.ok(!/fonts\.googleapis|fonts\.gstatic|Silkscreen|Pixelify/.test(html));
  assert.ok(!/fonts\.googleapis|Silkscreen|Pixelify/.test(read(web, 'sp-system.css') + read(web, 'drop.css')));
});

test('tokens: the SP SYSTEM palette is exact and there are no gradients', () => {
  const css = read(web, 'sp-system.css');
  const tok = (n) => new RegExp('--' + n + ':\\s*(#[0-9A-Fa-f]{6})').exec(css)[1].toUpperCase();
  assert.equal(tok('sp-paper'), '#F2F1EC'); assert.equal(tok('sp-ink'), '#191918'); assert.equal(tok('sp-red'), '#FF2A1A');
  assert.equal(tok('sp-blue'), '#1265F5'); assert.equal(tok('sp-green'), '#718A35');
  ['space-1', 'radius-2', 'border-w', 'control-h', 'pad-gap', 'dur', 'z-overlay', 'focus', 'font-display', 'font-ui', 'font-mono'].forEach((n) =>
    assert.match(css, new RegExp('--sp-' + n + ':')));
  assert.ok(!/gradient\(/.test(css + read(web, 'drop.css')));
  assert.match(css, /prefers-reduced-motion/);
});

test('tokens: index.html has no stray colour literals (canvas colours come from the CSS tokens)', () => {
  const noFallbacks = html.replace(/COL\.\w+ = v\([^)]*\)[;,]?/g, '').replace(/COL\.inkTint[^\n]*\n/, '').replace(/<svg.*?<\/svg>/gs, '');
  const hex = (noFallbacks.replace(/<meta name="theme-color"[^>]*>/, '').match(/#[0-9A-Fa-f]{6}\b/g) || []);
  assert.deepEqual(hex, []);
});

test('sprite embedded in index.html is in sync with assets (npm run sync-assets)', () => {
  execFileSync('node', [path.join(root, 'scripts', 'sync-assets.js'), '--check']);
});

test('EN/RU: every static string, attribute and tr() key has a Russian entry', () => {
  const dictSrc = html.slice(html.indexOf('  var RU = {'), html.indexOf('\n  };\n', html.indexOf('  var RU = {')) + 5);
  const RU = new Function(dictSrc + '; return RU;')();
  const decode = (s) => s.replace(/&mdash;/g, '—').replace(/&middot;/g, '·').replace(/&divide;/g, '÷').replace(/&times;/g, '×').replace(/&larr;/g, '←')
    .replace(/&rarr;/g, '→').replace(/&minus;/g, '−').replace(/&hellip;/g, '…').replace(/&amp;/g, '&');
  const body = html.slice(html.indexOf('<body>'), html.indexOf('<script src=')).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const used = new Set();
  for (const m of body.matchAll(/>([^<]+)</g)) { const t = decode(m[1]).replace(/\s+/g, ' ').trim(); if (t) used.add(t); }
  for (const m of body.matchAll(/(?:title|aria-label)="([^"]*)"/g)) used.add(decode(m[1]).replace(/\s+/g, ' ').trim());
  const script = html.slice(html.indexOf('<script>\n'));
  for (const m of script.matchAll(/tr\(\s*'((?:[^'\\]|\\.)*)'/g)) used.add(m[1].replace(/\\'/g, "'"));
  for (const m of script.matchAll(/(?:label|hint): '((?:[^'\\]|\\.)*)'/g)) used.add(m[1]);
  const skip = (k) => !/[A-Za-z]{3,}/.test(k) || ['SP', 'DROP', '404', 'WAV', 'MP3', 'AIFF', 'FLAC', 'OGG', 'M4A', 'FOR SP-404MKII', 'BPM', 'EN', 'RU', 'SP404 DROP'].includes(k);
  const missing = [...used].filter((k) => !skip(k) && !(k in RU));
  assert.deepEqual(missing, []);
});

test('accessibility: icon-only buttons are labelled, pads are buttons, status regions exist', () => {
  for (const m of html.matchAll(/<button[^>]*class="[^"]*\bicon\b[^"]*"[^>]*>/g)) assert.match(m[0], /aria-label=/, m[0].slice(0, 80));
  assert.match(html, /id="chopAlert"[^>]*role="status"/);
  assert.match(html, /id="convAlert"[^>]*role="alert"/);
  assert.match(html, /class="sp-pad-grid" id="padGrid" role="group"/);
  assert.ok(!/<div class="mode-tile|<div class="part-chip/.test(html));   // tiles are real <button>s
});

test('mac shell: main.js parses', () => {
  execFileSync('node', ['--check', path.join(root, 'mac', 'app', 'main.js')]);
});

test('shell: top strip, ink sidebar with Drop / Convert / Chop nav and About, real screens', () => {
  assert.match(html, /class="sp-topstrip"><span>SP SYSTEM \/ DROP<\/span><span>FOR SP-404MKII<\/span>/);
  for (const sc of ['home', 'convert', 'chop', 'about']) {
    assert.match(html, new RegExp('class="side-btn[^"]*"[^>]*data-screen="' + sc + '"'));
    assert.match(html, new RegExp('id="screen' + sc[0].toUpperCase() + sc.slice(1) + '"'));
  }
  assert.ok(!/Settings|Batch<|>Export</.test(html.replace(/<script[\s\S]*$/, '').replace(/Export (Selected|All)/g, '')));   // no nav items for features that do not exist
});

test('mac shell: native .spsystem open (open-file before ready, single instance + second-instance, one pipeline, preload door)', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'mac', 'app', 'main.js'), 'utf8');
  assert.match(main, /app\.on\('open-file'/); assert.match(main, /requestSingleInstanceLock/); assert.match(main, /second-instance/);
  assert.match(main, /openExternalProject/); assert.match(main, /spsystem:ready/);
  assert.ok(main.indexOf("app.on('open-file'") < main.indexOf('app.whenReady()'), 'open-file listener is registered before ready (cold start)');
  const pre = fs.readFileSync(path.join(__dirname, '..', '..', 'mac', 'app', 'preload.js'), 'utf8');
  assert.match(pre, /onProjectOpened/); assert.match(pre, /acceptSuggestion/); assert.match(pre, /saveProject/);
  const plist = fs.readFileSync(path.join(__dirname, '..', '..', 'mac', 'Info.extra.plist'), 'utf8');
  assert.match(plist, /<string>spsystem<\/string>/); assert.match(plist, /Alternate/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'mac', 'build.sh'), 'utf8'), /--extend-info=Info\.extra\.plist/);
});
