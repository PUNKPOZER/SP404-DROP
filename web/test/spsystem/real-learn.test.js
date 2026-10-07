'use strict';
/* REAL_LEARN_FIXTURE -> DROP READ -> DROP MUTATION -> DROP WRITE -> DROP READ
   learn-mutated.spsystem was produced by the actual SP-404 LEARN implementation (not by simulateLearn). */
var test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
var FS = require('../../../mac/app/spsystem-fs.js'), P = require('../../sp-package.js');
var DIR = path.join(__dirname, '..', 'fixtures', 'spsystem'), UUID = '6f1c2b9e-3a44-4d0a-9b1e-2c7d5a8f0e11';
var LEARN_OWNED = ['analysis/track.json', 'learn/recipe.json', 'learn/requirements.json', 'learn/progress.json'];

function payloads(pkg) {
  var out = {};
  return Promise.all(pkg.entries.filter(function (e) { return !e.dir; }).map(function (e) { return pkg.read(e).then(function (b) { out[e.name] = Buffer.from(b); }); })).then(function () { return out; });
}

test('REAL LEARN fixture: read -> pad edit -> write -> read', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spsys-real-')), file = path.join(dir, 'p.spsystem'), before;
  fs.copyFileSync(path.join(DIR, 'learn-mutated.spsystem'), file);
  return FS.open(file).then(function (o) {
    var r = o.result;
    assert.ok(r.level === 'VALID' || r.level === 'VALID_WITH_WARNINGS', r.level + JSON.stringify(r.issues));
    assert.ok(r.issues.every(function (i) { return i.severity !== 'error'; }));
    assert.deepStrictEqual(r.issues.map(function (i) { return i.code + ':' + i.where; }), ['W_UNKNOWN_FILE:x-future/notes.bin']);
    assert.strictEqual(r.manifest.formatVersion, 1); assert.strictEqual(r.manifest.id, UUID); assert.strictEqual(r.manifest.revision, 4);
    ['analysis', 'recipe', 'progress', 'requirements'].forEach(function (n) { assert.strictEqual(r.modules[n].status, 'ok', n); });
    ['chops', 'samples', 'pads', 'loops'].forEach(function (n) { assert.strictEqual(r.modules[n].status, 'ok', n); });
    ctx = { project: o.project, res: r };
    return payloads(r.package);
  }).then(function (p) {
    before = p;
    var pr = ctx.project;
    assert.deepStrictEqual(pr.setPad('A', 5, 'sample-01'), { ok: true });                   /* DROP-owned mutation (A4=sample-03 already exists in the fixture, so use A5) */
    return FS.saveFile(pr, file, { now: '2026-10-09T12:00:00Z', version: '1.2.0' });
  }).then(function (r) {
    assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.revision, 5);
    return FS.open(file);
  }).then(function (o) {
    var r = o.result;
    assert.ok(r.level === 'VALID' || r.level === 'VALID_WITH_WARNINGS');
    assert.strictEqual(r.manifest.id, UUID, 'UUID unchanged'); assert.strictEqual(r.manifest.revision, 5);
    assert.strictEqual(r.manifest.modifiedBy, 'sp404-drop');
    assert.deepStrictEqual(r.manifest['x-learn-note'], { keep: 'me' });
    assert.strictEqual(r.manifest.tempo.bpm, 118); assert.strictEqual(r.manifest.tempo.origin, 'user', 'LEARN user tempo untouched');
    var a4 = r.modules.pads.data.assignments.filter(function (a) { return a.bank === 'A' && a.pad === 5; });
    assert.strictEqual(a4.length, 1); assert.strictEqual(a4[0].sampleId, 'sample-01', 'mutation present: A5 -> sample-01');
    assert.strictEqual(r.modules.pads.data.assignments.filter(function (a) { return a.pad === 4; })[0].sampleId, 'sample-03', 'earlier mapping kept');
    return payloads(r.package);
  }).then(function (after) {
    var changed = ['manifest.json', 'project/pads.json'];
    Object.keys(before).forEach(function (n) {
      if (changed.indexOf(n) >= 0) return;
      assert.ok(after[n], n + ' present'); assert.deepStrictEqual(after[n], before[n], n + ' payload byte-identical');
    });
    assert.deepStrictEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'same entry names');
    LEARN_OWNED.concat(['x-future/notes.bin', 'audio/source.wav', 'samples/sample-01.wav', 'samples/sample-02.wav', 'samples/sample-03.wav', 'project/chops.json', 'project/samples.json', 'project/loops.json'])
      .forEach(function (n) { assert.deepStrictEqual(after[n], before[n], n); });
    assert.notDeepStrictEqual(after['project/pads.json'], before['project/pads.json']);
  });
});
var ctx;

test('committed return fixture drop-after-real-learn.spsystem is what DROP\'s writer produces', function () {
  return FS.open(path.join(DIR, 'drop-after-real-learn.spsystem')).then(function (o) {
    assert.ok(o.result.level === 'VALID' || o.result.level === 'VALID_WITH_WARNINGS', JSON.stringify(o.result.issues));
    assert.strictEqual(o.result.manifest.revision, 5); assert.strictEqual(o.result.manifest.id, UUID);
    return Promise.all([payloads(o.result.package), FS.open(path.join(DIR, 'learn-mutated.spsystem')).then(function (l) { return payloads(l.result.package); })]);
  }).then(function (x) {
    LEARN_OWNED.concat(['x-future/notes.bin', 'audio/source.wav']).forEach(function (n) { assert.deepStrictEqual(x[0][n], x[1][n], n); });
  });
});
