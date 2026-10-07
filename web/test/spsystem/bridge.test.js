'use strict';
var test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
var H = require('./helpers.js'), B = require('../../sp-bridge.js'), FS = require('../../../mac/app/spsystem-fs.js');

function payload(markers, extra) {
  var d = 1.5, pts = [0].concat(markers.map(function (m) { return m.time; }), [d]), slices = [];
  for (var i = 0; i < pts.length - 1; i++) slices.push({ start: pts[i], end: pts[i + 1], wav: H.wav(pts[i + 1] - pts[i], 48000, 16, 200 + 50 * i) });
  var p = { fileName: 'DJ Manny - Something U Need.mp3', mode: 'transient', duration: d, sampleRate: 44100, channels: 2, markers: markers,
    grid: { bpm: 0, offset: 0, div: 4, show: false, detected: false }, sourceBytes: H.wav(d, 44100, 16, 110), sourceExt: 'mp3'.replace('mp3', 'wav'), slices: slices, version: '1.2.0', now: '2026-10-07T09:00:00Z' };
  for (var k in extra) p[k] = extra[k];
  return p;
}

test('DROP state -> project -> file: VALID, chain resolves, pads explicit', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spsys-br-')), file = path.join(dir, 'a.spsystem'), pr;
  return B.create(payload([])).then(function (p) { pr = p; return B.sync(p, payload([{ time: 0.5 }, { time: 1.0 }], { mode: 'beats', grid: { bpm: 120, offset: 0.1, div: 4, show: true, detected: true } })); })
    .then(function (r) { assert.ok(r.ok, JSON.stringify(r)); return FS.saveFile(pr, file); })
    .then(function (r) { assert.ok(r.ok, JSON.stringify(r)); return FS.open(file); })
    .then(function (o) {
      assert.strictEqual(o.result.level, 'VALID', JSON.stringify(o.result.issues));
      assert.strictEqual(o.project.list('chops').length, 3); assert.strictEqual(o.project.list('chops')[0].type, 'beat');
      assert.strictEqual(o.result.manifest.tempo.origin, 'detected'); assert.strictEqual(o.result.manifest.tempo.beatOffsetSeconds, 0.1);
      assert.strictEqual(o.result.manifest.title, 'DJ Manny - Something U Need');
      assert.deepStrictEqual(o.project.list('pads').map(function (a) { return a.bank + a.pad + a.sampleId; }), ['A1sample-01', 'A2sample-02', 'A3sample-03']);
    });
});
test('second export of the same project: same UUID, revision +1, kept ids, orphan samples pruned, no warnings', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spsys-br-')), file = path.join(dir, 'a.spsystem'), pr, id;
  return B.create(payload([])).then(function (p) { pr = p; return B.sync(p, payload([{ time: 0.5 }, { time: 1.0 }])); })
    .then(function () { return FS.saveFile(pr, file); }).then(function (r) { assert.ok(r.ok); id = pr.manifest.id; return B.sync(pr, payload([{ time: 0.5 }])); })
    .then(function (r) { assert.ok(r.ok); assert.deepStrictEqual([r.added, r.removed], [1, 2]); return FS.saveFile(pr, file); })
    .then(function (r) { assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.revision, 2); return FS.open(file); })
    .then(function (o) {
      assert.strictEqual(o.result.level, 'VALID', JSON.stringify(o.result.issues));
      assert.strictEqual(o.result.manifest.id, id);
      assert.deepStrictEqual(o.project.list('chops').map(function (c) { return c.id; }), ['chop-01', 'chop-04']);
      assert.deepStrictEqual(o.project.list('samples').map(function (s) { return s.id; }), ['sample-01', 'sample-04']);
      assert.ok(!o.result.package.has('samples/sample-02.wav'));
      var a = o.project.list('pads'); assert.strictEqual(a.filter(function (x) { return x.sampleId === 'sample-02'; }).length, 0);
    });
});
test('re-sync with identical state re-renders nothing and keeps every sample file', function () {
  return B.create(payload([])).then(function (p) {
    return B.sync(p, payload([{ time: 0.5 }])).then(function () {
      var before = JSON.stringify(p.list('samples')), called = 0, orig = p.putSample;
      p.putSample = function () { called++; return orig.apply(p, arguments); };
      return B.sync(p, payload([{ time: 0.5 }])).then(function () { assert.strictEqual(called, 0); assert.strictEqual(JSON.stringify(p.list('samples')), before); });
    });
  });
});

test('Electron main: open-in-learn saves in the projects dir, keeps UUID, bumps revision, launches LEARN', function () {
  var OIL = require('../../../mac/app/open-in-learn.js'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spsys-oil-')), launched = [], key = 'k' + Date.now();
  var launch = function (f) { launched.push(f); return Promise.resolve({ launched: 'learn' }); };
  var p1 = payload([{ time: 0.5 }], { sessionKey: key, fileName: 'my:track/x.mp3' }), id;
  return OIL.run(p1, { dir: dir, launch: launch }).then(function (r) {
    assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.revision, 1); assert.strictEqual(r.launched, 'learn'); id = r.id;
    assert.strictEqual(path.dirname(r.file), dir); assert.ok(/my_track_x\.spsystem$/.test(r.file), r.file);
    return OIL.run(payload([{ time: 0.5 }, { time: 1 }], { sessionKey: key, fileName: 'my:track/x.mp3' }), { dir: dir, launch: launch });
  }).then(function (r) {
    assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.revision, 2); assert.strictEqual(r.id, id); assert.strictEqual(launched.length, 2);
    return FS.open(r.file);
  }).then(function (o) { assert.strictEqual(o.result.level, 'VALID', JSON.stringify(o.result.issues)); assert.strictEqual(o.project.list('chops').length, 3);
    /* another track with the same name gets its own file */
    return OIL.run(payload([], { sessionKey: key + 'b', fileName: 'my:track/x.mp3' }), { dir: dir, launch: launch });
  }).then(function (r) { assert.ok(/my_track_x 2\.spsystem$/.test(r.file), r.file); assert.strictEqual(fs.readdirSync(dir).filter(function (n) { return /\.spsystem$/.test(n); }).length, 2); });
});
test('Electron main: a file changed on disk by LEARN is reported as a conflict, not overwritten', function () {
  var OIL = require('../../../mac/app/open-in-learn.js'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spsys-oil-')), key = 'c' + Date.now(), launch = function () { return Promise.resolve({ launched: 'learn' }); }, file, after;
  return OIL.run(payload([{ time: 0.5 }], { sessionKey: key }), { dir: dir, launch: launch }).then(function (r) {
    file = r.file;
    return H.simulateLearn(fs.readFileSync(file), '2026-10-07T09:30:00Z');
  }).then(function (l) { fs.writeFileSync(file, l.bytes); after = fs.readFileSync(file);
    return OIL.run(payload([{ time: 0.5 }, { time: 1 }], { sessionKey: key }), { dir: dir, launch: launch });
  }).then(function (r) { assert.strictEqual(r.ok, false); assert.strictEqual(r.conflict, true); assert.deepStrictEqual(fs.readFileSync(file), after); });
});
