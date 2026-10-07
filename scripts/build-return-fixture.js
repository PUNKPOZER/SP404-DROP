#!/usr/bin/env node
/* learn-mutated.spsystem (produced by the REAL LEARN) -> DROP read -> DROP pad edit -> DROP writer -> drop-after-real-learn.spsystem
   Usage: node scripts/build-return-fixture.js */
'use strict';
var fs = require('fs'), path = require('path'), FS = require('../mac/app/spsystem-fs.js');
var dir = path.join(__dirname, '..', 'web', 'test', 'fixtures', 'spsystem'), src = path.join(dir, 'learn-mutated.spsystem'), out = path.join(dir, 'drop-after-real-learn.spsystem');
[out, out + '.bak'].forEach(function (f) { try { fs.unlinkSync(f); } catch (e) {} });
fs.copyFileSync(src, out);
FS.open(out).then(function (o) {
  if (!o.project) throw new Error('cannot open: ' + JSON.stringify(o.result));
  var r = o.project.setPad('A', 5, 'sample-01'); if (!r.ok) throw new Error(JSON.stringify(r));
  return FS.saveFile(o.project, out, { now: '2026-10-09T12:00:00Z', version: '1.2.0' });
}).then(function (r) { if (!r.ok) throw new Error(JSON.stringify(r)); try { fs.unlinkSync(out + '.bak'); } catch (e) {} console.log('wrote', out, 'revision', r.revision); })
  .catch(function (e) { console.error(e); process.exit(1); });
