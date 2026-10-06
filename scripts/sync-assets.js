#!/usr/bin/env node
/* Injects the SVG sprite (web/assets/icons.svg symbols + the brand symbol from web/assets/brand-logo.svg)
   into web/index.html between the sp:sprite markers. `--check` only verifies that the file is in sync.
   Why inline: <use href="assets/icons.svg#id"> is blocked under file:// and in Electron's file protocol. */
'use strict';
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..', 'web');
const START = '<!-- sp:sprite:start -->';
const END = '<!-- sp:sprite:end -->';

function build() {
  const icons = fs.readFileSync(path.join(web, 'assets', 'icons.svg'), 'utf8');
  const symbols = (icons.match(/<symbol[\s\S]*?<\/symbol>/g) || []).map((s) => '  ' + s.trim());
  const brand = fs.readFileSync(path.join(web, 'assets', 'brand-logo.svg'), 'utf8');
  const vb = /viewBox="([^"]+)"/.exec(brand)[1];
  const pathEl = /<path[^>]*\/>/.exec(brand)[0].replace(/\s+/g, ' ');
  symbols.push('  <symbol id="sp-brand" viewBox="' + vb + '">' + pathEl + '</symbol>');
  return START + '\n<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">\n' +
    symbols.join('\n') + '\n</svg>\n' + END;
}

function sync(check) {
  const file = path.join(web, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < 0) throw new Error('sprite markers not found in index.html');
  const next = html.slice(0, a) + build() + html.slice(b + END.length);
  if (check) { if (next !== html) { console.error('index.html sprite is out of date — run: npm run sync-assets'); process.exit(1); } return; }
  fs.writeFileSync(file, next);
  console.log('sprite synced');
}

if (require.main === module) sync(process.argv.includes('--check'));
module.exports = { build, sync };
