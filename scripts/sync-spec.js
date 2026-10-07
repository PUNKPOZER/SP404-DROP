#!/usr/bin/env node
/* Vendored SP SYSTEM specification snapshot (sp-system-spec/).
   The canonical specification lives in the SP-404 LEARN repository. This directory is a READ-ONLY snapshot, never edited in DROP.
     node scripts/sync-spec.js <path-to-sp404-learn-repo>   copy snapshot + write SPEC_VERSION / SPEC_HASH (only after an agreed spec update)
     node scripts/sync-spec.js --check                       verify that the files still match SPEC_HASH (used by the tests)
   SPEC_HASH = SHA-256 of the sorted lines "<sha256>  <relative path>" of every snapshot file except SPEC_VERSION and SPEC_HASH. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const dest = path.join(root, 'sp-system-spec');
const META = ['SPEC_VERSION', 'SPEC_HASH'];

function walk(dir, base) {
  base = base || dir;
  let out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === '.DS_Store' || name === '__pycache__' || name.endsWith('.pyc')) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out = out.concat(walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
function digestLines(dir) {
  return walk(dir).filter((f) => !META.includes(f)).map((f) =>
    crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex') + '  ' + f);
}
function specHash(dir) { return crypto.createHash('sha256').update(digestLines(dir).join('\n') + '\n').digest('hex'); }

function check() {
  if (!fs.existsSync(path.join(dest, 'SPEC_HASH'))) throw new Error('sp-system-spec/SPEC_HASH missing');
  const recorded = fs.readFileSync(path.join(dest, 'SPEC_HASH'), 'utf8').split('\n')[0].trim();
  const actual = specHash(dest);
  if (recorded !== actual) {
    console.error('sp-system-spec/ does not match SPEC_HASH (recorded ' + recorded + ', actual ' + actual + '). The snapshot must not be edited locally.');
    process.exit(1);
  }
  return actual;
}

function sync(src) {
  const specDir = path.join(src, 'sp-system-spec');
  if (!fs.existsSync(path.join(specDir, 'schemas'))) throw new Error('not an SP-404 LEARN checkout: ' + src);
  fs.rmSync(dest, { recursive: true, force: true });
  for (const f of walk(specDir)) {
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
    fs.copyFileSync(path.join(specDir, f), path.join(dest, f));
  }
  fs.copyFileSync(path.join(src, 'SP_SYSTEM_INTERCHANGE.md'), path.join(dest, 'SP_SYSTEM_INTERCHANGE.md'));
  let commit = 'unknown', dirty = '';
  try {
    commit = cp.execFileSync('git', ['-C', src, 'rev-parse', '--short', 'HEAD']).toString().trim();
    if (cp.execFileSync('git', ['-C', src, 'status', '--porcelain', '--', 'sp-system-spec', 'SP_SYSTEM_INTERCHANGE.md']).toString().trim()) dirty = ' (+ uncommitted changes)';
  } catch (e) { /* not a git checkout */ }
  const hash = specHash(dest);
  fs.writeFileSync(path.join(dest, 'SPEC_VERSION'),
    'SP SYSTEM interchange specification — draft v1 (formatVersion 1)\n' +
    'source: sp404-learn @ ' + commit + dirty + '\n' +
    'snapshot taken: ' + new Date().toISOString().slice(0, 10) + '\n' +
    'contents: schemas/, examples/, migrations/, README.md, validate_examples.py, SP_SYSTEM_INTERCHANGE.md (normative text)\n' +
    'READ-ONLY SNAPSHOT. Do not edit. The canonical specification is owned by the SP SYSTEM spec (LEARN repo); update this folder only with\n' +
    '`node scripts/sync-spec.js <learn-repo>` after an agreed specification update. SPEC_HASH is verified by the tests.\n');
  fs.writeFileSync(path.join(dest, 'SPEC_HASH'), hash + '\n' + digestLines(dest).join('\n') + '\n');
  console.log('snapshot written: sp404-learn@' + commit + dirty + '  SPEC_HASH ' + hash);
}

if (require.main === module) {
  const a = process.argv[2];
  if (a === '--check') { console.log('SPEC_HASH ok ' + check()); }
  else if (a) sync(path.resolve(a));
  else { console.error('usage: sync-spec.js <learn-repo> | --check'); process.exit(2); }
}
module.exports = { specHash, check, walk };
