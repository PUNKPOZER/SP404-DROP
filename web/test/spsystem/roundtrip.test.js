'use strict';
/* Mandatory round trip (spec §23): DROP creates -> LEARN adds analysis/recipe/progress + unknown data ->
   DROP changes pad 4 and saves -> LEARN reopens. */
var test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
var H = require('./helpers.js'), P = H.P, FS = require('../../../mac/app/spsystem-fs.js');

test('DROP -> LEARN -> DROP -> LEARN round trip preserves identity, LEARN data and unknown data', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spsys-rt-')), file = path.join(dir, 'song.spsystem'), ctx = {};
  return H.dropProject().then(function (p) {
    return FS.saveFile(p, file, { now: '2026-10-07T09:00:00Z' });
  }).then(function (r) {
    assert.ok(r.ok, JSON.stringify(r));
    return FS.open(file);
  }).then(function (o) {                                                         /* [1] DROP-created package */
    assert.strictEqual(o.result.level, 'VALID', JSON.stringify(o.result.issues));
    ctx.id = o.result.manifest.id; assert.strictEqual(o.result.manifest.revision, 1);
    ctx.samples = {}; o.result.package.entries.filter(function (e) { return /^samples\//.test(e.name); }).forEach(function (e) { ctx.samples[e.name] = e.crc; });
    assert.strictEqual(Object.keys(ctx.samples).length, 3);
    var pad4 = o.project.list('pads').filter(function (a) { return a.bank === 'A' && a.pad === 4; });
    assert.strictEqual(pad4.length, 0, 'pad A4 is empty before the edit');
    ctx.audioCrc = o.result.package.entry('audio/source.wav').crc;
    return fs.promises.readFile(file);
  }).then(function (bytes) {                                                    /* [2] LEARN adds its data */
    return H.simulateLearn(bytes, '2026-10-07T09:30:00Z');
  }).then(function (l) {
    ctx.learn = l.learnFiles; fs.writeFileSync(file, l.bytes);
    return FS.open(file);
  }).then(function (o) {                                                         /* DROP opens the LEARN-modified package */
    assert.strictEqual(o.result.level, 'VALID_WITH_WARNINGS', JSON.stringify(o.result.issues));
    assert.ok(o.result.issues.some(function (i) { return i.code === 'W_UNKNOWN_FILE' && i.where === 'x-future/notes.bin'; }));
    assert.strictEqual(o.result.manifest.id, ctx.id); assert.strictEqual(o.result.manifest.revision, 2);
    var p = o.project;
    assert.strictEqual(p.candidates().chops.length, 1, 'DROP can see LEARN candidates (read-only)');
    assert.deepStrictEqual(p.setPad('A', 4, 'sample-03'), { ok: true });          /* [3] DROP changes pad 4 */
    return FS.saveFile(p, file, { now: '2026-10-07T10:00:00Z', version: '1.2.0' });
  }).then(function (r) {
    assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.revision, 3);
    return FS.open(file);
  }).then(function (o) {                                                         /* [4] LEARN reopens */
    var res = o.result;
    assert.ok(res.level === 'VALID' || res.level === 'VALID_WITH_WARNINGS', res.level);
    assert.ok(res.issues.every(function (i) { return i.severity !== 'error'; }));
    assert.strictEqual(res.manifest.id, ctx.id, 'UUID unchanged');
    assert.strictEqual(res.manifest.revision, 3, 'revision increased 1 -> 2 -> 3');
    assert.strictEqual(res.manifest.modifiedBy, 'sp404-drop');
    assert.deepStrictEqual(res.manifest['x-learn-note'], { keep: 'me' }, 'unknown manifest field preserved');
    assert.strictEqual(res.modules.pads.data.assignments.filter(function (a) { return a.bank === 'A' && a.pad === 4; })[0].sampleId, 'sample-03', 'pad A4 updated');
    /* LEARN-owned files and the unknown file: byte-identical */
    Object.keys(ctx.learn).forEach(function (name) { assert.ok(res.package.entry(name), name + ' present'); });
    var checks = Object.keys(ctx.learn).map(function (name) { return res.package.read(name).then(function (b) { assert.deepStrictEqual(Buffer.from(b), ctx.learn[name], name); }); });
    Object.keys(ctx.samples).forEach(function (n) { assert.strictEqual(res.package.entry(n).crc, ctx.samples[n], n + ' preserved'); });
    assert.strictEqual(res.package.entry('audio/source.wav').crc, ctx.audioCrc, 'source audio preserved');
    ['learn/recipe.json', 'learn/progress.json', 'learn/requirements.json', 'analysis/track.json'].forEach(function (n) { assert.strictEqual(res.modules[Object.keys(res.modules).filter(function (k) { return res.modules[k].path === n; })[0]].status, 'ok'); });
    return Promise.all(checks);
  });
});

test('committed example packages open cleanly', function () {
  var dir = path.join(__dirname, '..', 'fixtures', 'spsystem');
  return FS.open(path.join(dir, 'drop-created.spsystem')).then(function (o) {
    assert.strictEqual(o.result.level, 'VALID', JSON.stringify(o.result.issues));
    return FS.open(path.join(dir, 'after-learn-and-drop.spsystem'));
  }).then(function (o) {
    assert.ok(o.result.level === 'VALID' || o.result.level === 'VALID_WITH_WARNINGS');
    assert.strictEqual(o.result.manifest.revision, 3);
    assert.strictEqual(o.result.manifest.id, '6f1c2b9e-3a44-4d0a-9b1e-2c7d5a8f0e11');
  });
});
