#!/usr/bin/env node
/* Builds the committed example packages in web/test/fixtures/spsystem/:
     drop-created.spsystem      what DROP writes for a new project (3 chops, 3 samples, explicit pads, portable source)
     after-learn-and-drop.spsystem  the same project after a simulated LEARN pass and a DROP pad edit (round trip)
   Fixed id/timestamps; run: node scripts/build-fixtures.js */
'use strict';
var fs = require('fs'), path = require('path');
var H = require('../web/test/spsystem/helpers.js'), FS = require('../mac/app/spsystem-fs.js');
var out = path.join(__dirname, '..', 'web', 'test', 'fixtures', 'spsystem');
fs.mkdirSync(out, { recursive: true });
var a = path.join(out, 'drop-created.spsystem'), b = path.join(out, 'after-learn-and-drop.spsystem');
[a, b, a + '.bak', b + '.bak'].forEach(function (f) { try { fs.unlinkSync(f); } catch (e) {} });
H.dropProject({ id: '6f1c2b9e-3a44-4d0a-9b1e-2c7d5a8f0e11' }).then(function (p) {
  return FS.saveFile(p, a, { now: '2026-10-07T09:00:00Z', version: '1.2.0' });
}).then(function (r) {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return H.simulateLearn(fs.readFileSync(a), '2026-10-07T09:30:00Z');
}).then(function (l) {
  fs.writeFileSync(b, l.bytes);
  return FS.open(b);
}).then(function (o) {
  o.project.setPad('A', 4, 'sample-03');
  return FS.saveFile(o.project, b, { now: '2026-10-07T10:00:00Z', version: '1.2.0' });
}).then(function (r) {
  if (!r.ok) throw new Error(JSON.stringify(r));
  try { fs.unlinkSync(b + '.bak'); } catch (e) {}
  console.log('wrote', a, fs.statSync(a).size, 'bytes;', b, fs.statSync(b).size, 'bytes');
}).catch(function (e) { console.error(e); process.exit(1); });
