#!/usr/bin/env node
/* SP404 DROP app icon: Signal Red field + Paper cow-on-chair mark.
   The mark is the production path from web/assets/brand-logo.svg, only scaled and translated — never redrawn.
   Outputs: web/icon.svg (+ copy at repo root), mac/icon.icns, build/icons/*.png and build/icons/contact-sheet.html.
   Needs macOS (iconutil, sips) and Google Chrome (headless) to rasterise the SVG. Run: node scripts/make-icons.js */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const RED = '#FF2A1A', PAPER = '#F2F1EC';
const MARK_W = 947, MARK_H = 1072;
const outDir = path.join(root, 'build', 'icons');

const brand = fs.readFileSync(path.join(root, 'web', 'assets', 'brand-logo.svg'), 'utf8');
const markPath = /<path d="([^"]+)"/.exec(brand)[1];

/* Icon-specific spacing only: small sizes get a larger mark so the cow stays readable. Geometry is untouched. */
function markRatio(px) { return px <= 32 ? 0.80 : px <= 64 ? 0.70 : 0.60; }

function iconSvg(size, ratio) {
  const inset = size * 100 / 1024, box = size - 2 * inset, r = size * 185 / 1024;
  const h = box * ratio, s = h / MARK_H, w = MARK_W * s;
  const x = (size - w) / 2, y = (size - h) / 2;
  const f = (n) => +n.toFixed(3);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">\n' +
    '<rect x="' + f(inset) + '" y="' + f(inset) + '" width="' + f(box) + '" height="' + f(box) + '" rx="' + f(r) + '" fill="' + RED + '"/>\n' +
    '<path transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + f(s) + ')" d="' + markPath + '" fill="' + PAPER + '"/>\n</svg>\n';
}

function chrome() {
  const c = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!fs.existsSync(c)) throw new Error('Google Chrome not found (needed to rasterise the SVG)');
  return c;
}
function renderPng(svgText, px, file) {
  const tmp = path.join(outDir, '_tmp.html');
  fs.writeFileSync(tmp, '<html><body style="margin:0;background:transparent">' + svgText + '</body></html>');
  cp.execFileSync(chrome(), ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    '--screenshot=' + file, '--window-size=1024,1024', 'file://' + tmp], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
  if (px !== 1024) cp.execFileSync('sips', ['-z', String(px), String(px), file], { stdio: 'ignore' });
}

fs.mkdirSync(outDir, { recursive: true });
const master = iconSvg(1024, 0.60);
fs.writeFileSync(path.join(root, 'web', 'icon.svg'), master);
fs.writeFileSync(path.join(root, 'icon.svg'), master);

const sizes = [16, 32, 64, 128, 256, 512, 1024];
sizes.forEach((px) => {
  renderPng(iconSvg(1024, markRatio(px)), px, path.join(outDir, 'icon_' + px + '.png'));
});

const iconset = path.join(outDir, 'drop.iconset');
fs.rmSync(iconset, { recursive: true, force: true });
fs.mkdirSync(iconset);
const map = { 'icon_16x16.png': 16, 'icon_16x16@2x.png': 32, 'icon_32x32.png': 32, 'icon_32x32@2x.png': 64, 'icon_128x128.png': 128,
  'icon_128x128@2x.png': 256, 'icon_256x256.png': 256, 'icon_256x256@2x.png': 512, 'icon_512x512.png': 512, 'icon_512x512@2x.png': 1024 };
Object.keys(map).forEach((name) => fs.copyFileSync(path.join(outDir, 'icon_' + map[name] + '.png'), path.join(iconset, name)));
cp.execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'mac', 'icon.icns')]);

const sheet = '<html><body style="margin:0;padding:24px;background:#F2F1EC;font:12px monospace;display:flex;gap:24px;align-items:flex-end">' +
  [16, 32, 64, 128, 256, 512].map((px) => '<div><img src="icon_' + px + '.png" width="' + px + '" height="' + px + '"><div>' + px + 'px</div></div>').join('') + '</body></html>';
fs.writeFileSync(path.join(outDir, 'contact-sheet.html'), sheet);
console.log('icons written: web/icon.svg, icon.svg, mac/icon.icns, build/icons/*');
