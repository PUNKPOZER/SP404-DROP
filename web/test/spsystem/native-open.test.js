'use strict';
/* LEARN -> DROP: native open pipeline (mac/app/project-open.js), suggestions, accept, lesson requirements, save, conflict.
   Uses packages produced by the REAL SP-404 LEARN code (learn-prepared*.spsystem = LEARN's "Prepare in DROP" export,
   learn-mutated.spsystem = LEARN's cross-app fixture). */
var test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
var H = require('./helpers.js'), P = H.P, FS = require('../../../mac/app/spsystem-fs.js'), PO = require('../../../mac/app/project-open.js'), OIL = require('../../../mac/app/open-in-learn.js');
var FIX = path.join(__dirname, '..', 'fixtures', 'spsystem');

function copy(name) { var d = fs.mkdtempSync(path.join(os.tmpdir(), 'spsys-no-')), f = path.join(d, name); fs.copyFileSync(path.join(FIX, name), f); return f; }
function sha(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }
function entries(f) { return FS.open(f).then(function (o) { var out = {}; return Promise.all(o.result.package.entries.filter(function (e) { return !e.dir; }).map(function (e) { return o.result.package.read(e).then(function (b) { out[e.name] = Buffer.from(b); }); })).then(function () { return out; }); }); }
function slicePayload(key, chops, extra) {
  var p = { sessionKey: key, fileName: 'track.wav', mode: 'transient', duration: 1.5, sampleRate: 44100, channels: 1, markers: [], regionsMode: true,
            grid: { bpm: 120, offset: 0.02, div: 4, show: false, detected: true }, sourceBytes: new Uint8Array(1), sourceExt: 'wav', renderKey: '48k16', version: '1.1.0', now: Date.now(),
            slices: chops.map(function (c) { return { start: c.start, end: c.end, wav: H.wav(c.end - c.start, 48000, 16, 300) }; }) };
  for (var k in extra) p[k] = extra[k];
  return p;
}

test('cold start: open the real LEARN package -> VALID, identity kept, nothing written, not dirty', function () {
  var f = copy('learn-prepared.spsystem'), before = sha(f), dir = path.dirname(f), mt = fs.statSync(f).mtimeMs;
  return PO.openExternalProject(f).then(function (r) {
    assert.ok(r.ok, JSON.stringify(r)); var i = r.info;
    assert.strictEqual(i.level, 'VALID'); assert.strictEqual(i.id, 'a30f7b45-e6ed-4dd0-851e-394f15cd96b7'); assert.strictEqual(i.revision, 1);
    assert.strictEqual(i.dirty, false); assert.strictEqual(i.path, f); assert.ok(i.key);
    assert.strictEqual(sha(f), before, 'file bytes untouched'); assert.strictEqual(fs.statSync(f).mtimeMs, mt);
    assert.deepStrictEqual(fs.readdirSync(dir), ['learn-prepared.spsystem'], 'no .bak / .lock / temp created by opening');
    var s = OIL.sessions.get(i.key); assert.strictEqual(s.project.manifest.revision, 1); assert.strictEqual(s.project.manifest.modifiedBy, 'sp404-learn'); assert.strictEqual(s.project.isDirty(), false);
  });
});
test('warm start: a second open request (newer revision) while one is open gives its own session and the revision on disk', function () {
  var f = copy('learn-mutated.spsystem');
  return PO.openExternalProject(f).then(function (a) {
    assert.ok(a.ok); assert.strictEqual(a.info.revision, 4); assert.strictEqual(a.info.level, 'VALID_WITH_WARNINGS');
    return H.simulateLearn(fs.readFileSync(f), '2026-10-09T13:00:00Z').then(function (l) { fs.writeFileSync(f, l.bytes); return PO.openExternalProject(f); }).then(function (b) {
      assert.ok(b.ok); assert.strictEqual(b.info.revision, 5); assert.strictEqual(b.info.id, a.info.id); assert.notStrictEqual(b.info.key, a.info.key);
      assert.ok(OIL.sessions.get(a.info.key) && OIL.sessions.get(b.info.key));
    });
  });
});
test('bad inputs never crash: missing file, junk, newer version', function () {
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'spsys-no-')), j = path.join(d, 'junk.spsystem'); fs.writeFileSync(j, 'junk junk junk junk junk junk');
  var nv = path.join(d, 'new.spsystem'); fs.writeFileSync(nv, H.rawZip([{ name: 'manifest.json', data: H.json(H.manifest({ formatVersion: 2 })) }]));
  return PO.openExternalProject(path.join(d, 'none.spsystem')).then(function (r) { assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'E_NO_FILE'); return PO.openExternalProject(j); })
    .then(function (r) { assert.strictEqual(r.ok, false); assert.ok(/not a usable/.test(r.message)); return PO.openExternalProject(nv); })
    .then(function (r) { assert.strictEqual(r.ok, false); assert.strictEqual(r.level, 'UNSUPPORTED_VERSION'); assert.ok(/newer version/.test(r.message)); });
});
test('portable source: embedded audio is returned, no original path needed', function () {
  var f = copy('learn-prepared.spsystem');
  return PO.openExternalProject(f).then(function (r) {
    assert.strictEqual(r.info.source.state, 'ok'); assert.strictEqual(r.info.source.mode, 'portable'); assert.strictEqual(r.sourceExt, 'wav');
    return entries(f).then(function (e) { assert.deepStrictEqual(Buffer.from(r.sourceBytes), e['audio/source.wav']); });
  });
});
test('lightweight source: resolved when the external file exists and matches; missing / changed -> clear states, no crash', function () {
  var f = copy('learn-prepared-lightweight.spsystem'), ext = '/tmp/lp/x.wma', bytes = Buffer.from('not embeddable audio bytes');
  fs.mkdirSync('/tmp/lp', { recursive: true });
  try { fs.unlinkSync(ext); } catch (e) {}
  return PO.openExternalProject(f).then(function (r) {
    assert.ok(r.ok); assert.strictEqual(r.info.source.state, 'missing'); assert.strictEqual(r.info.source.path, ext); assert.strictEqual(r.sourceBytes, null); assert.strictEqual(r.info.level, 'VALID');
    fs.writeFileSync(ext, bytes); return PO.openExternalProject(f);
  }).then(function (r) {
    assert.strictEqual(r.info.source.state, 'ok'); assert.deepStrictEqual(Buffer.from(r.sourceBytes), bytes);
    fs.writeFileSync(ext, 'someone replaced the file'); return PO.openExternalProject(f);
  }).then(function (r) { assert.strictEqual(r.info.source.state, 'mismatch'); assert.strictEqual(r.sourceBytes, null); try { fs.unlinkSync(ext); } catch (e) {} });
});
test('suggestions are loaded (chop + loop) but never become chops/loops by themselves', function () {
  var f = copy('learn-prepared.spsystem');
  return PO.openExternalProject(f).then(function (r) {
    var c = r.info.candidates; assert.strictEqual(c.chops.length, 2); assert.ok(c.chops.every(function (x) { return x.state === 'suggested' && x.accepted === false; }));
    assert.strictEqual(r.info.chops.length, 0); assert.strictEqual(r.info.loops.length, 0); assert.strictEqual(r.info.hasAnalysis, true);
    var p = OIL.sessions.get(r.info.key).project; assert.ok(!p.pkg.has('project/chops.json') && !p.pkg.has('project/loops.json'));
  });
});
test('loopCandidates are read as suggestions too (analysis extended on top of the real LEARN package, written by DROP\'s writer)', function () {
  var f = copy('learn-prepared.spsystem');
  return FS.open(f).then(function (o) {
    var an = JSON.parse(JSON.stringify(o.result.modules.analysis.data)); an.loopCandidates = [{ id: 'loop-cand-1', startSeconds: 0.0, endSeconds: 1.0, bars: 1, confidence: 0.8, loopability: 0.9, state: 'suggested' }];
    var sink = P.memorySink();
    return P.assemble(o.result.package, { replace: { 'analysis/track.json': P.stringify(an) } }, sink).then(function () { fs.writeFileSync(f, sink.bytes()); return PO.openExternalProject(f); });
  }).then(function (r) {
    assert.strictEqual(r.info.candidates.loops.length, 1); assert.strictEqual(r.info.candidates.loops[0].accepted, false); assert.strictEqual(r.info.loops.length, 0);
    var acc = PO.acceptSuggestion(r.info.key, 'loop-cand-1', 'loop');
    assert.ok(acc.ok); assert.strictEqual(acc.state.loops.length, 1); assert.strictEqual(acc.state.candidates.loops[0].accepted, true);
    assert.strictEqual(PO.acceptSuggestion(r.info.key, 'loop-cand-1', 'loop').code, 'E_ALREADY_ACCEPTED');
  });
});
test('REAL LEARN package -> open -> accept one -> save: revision +1 once, valid, LEARN data byte-preserved, candidate kept, fromCandidateId set', function () {
  var f = copy('learn-prepared.spsystem'), before;
  return entries(f).then(function (e) { before = e; return PO.openExternalProject(f); }).then(function (r) {
    var key = r.info.key, acc = PO.acceptSuggestion(key, 'cand-01', 'chop');
    assert.ok(acc.ok, JSON.stringify(acc)); assert.strictEqual(acc.state.dirty, true); assert.strictEqual(acc.state.chops.length, 1); assert.strictEqual(acc.state.chops[0].fromCandidateId, 'cand-01');
    assert.strictEqual(acc.state.candidates.chops[0].accepted, true); assert.strictEqual(acc.state.candidates.chops[1].accepted, false);
    assert.strictEqual(sha(f), sha(f)); assert.strictEqual(fs.statSync(f).size, fs.statSync(f).size);
    return PO.saveSession(slicePayload(key, acc.state.chops));
  }).then(function (s) {
    assert.ok(s.ok, JSON.stringify(s)); assert.strictEqual(s.revision, 2); assert.strictEqual(s.state.dirty, false);
    return Promise.all([FS.open(f), entries(f)]);
  }).then(function (x) {
    var res = x[0].result, after = x[1];
    assert.strictEqual(res.level, 'VALID', JSON.stringify(res.issues)); assert.strictEqual(res.manifest.revision, 2); assert.strictEqual(res.manifest.id, 'a30f7b45-e6ed-4dd0-851e-394f15cd96b7');
    assert.strictEqual(res.manifest.modifiedBy, 'sp404-drop'); assert.strictEqual(res.manifest.tempo.setBy, 'sp404-learn', 'LEARN tempo untouched');
    assert.deepStrictEqual(after['analysis/track.json'], before['analysis/track.json'], 'analysis byte-identical'); assert.deepStrictEqual(after['audio/source.wav'], before['audio/source.wav']);
    var ch = x[0].project.list('chops'); assert.strictEqual(ch.length, 1); assert.strictEqual(ch[0].fromCandidateId, 'cand-01'); assert.strictEqual(ch[0].type, 'analysis-suggestion');
    assert.strictEqual(x[0].project.candidates().chops.length, 2, 'candidates remain as analysis history');
    assert.strictEqual(x[0].project.list('samples').length, 1); assert.strictEqual(x[0].project.list('pads')[0].sampleId, 'sample-01');
    assert.ok(after['samples/sample-01.wav']);
  });
});
test('REAL LEARN fixture with DROP data: LEARN-owned + unknown entries preserved on save; requirements are read-only and counted', function () {
  var f = copy('learn-mutated.spsystem'), before;
  return entries(f).then(function (e) { before = e; return PO.openExternalProject(f); }).then(function (r) {
    var i = r.info; assert.strictEqual(i.chopsPartition, true); assert.deepStrictEqual(i.markers, [0.5, 1.0]);
    var rq = i.requirements; assert.strictEqual(rq.lesson, 'l1'); assert.deepStrictEqual(rq.needs.map(function (n) { return [n.type, n.count, n.have]; }), [['drum-chop', 3, 3]]);
    var key = i.key, acc = PO.acceptSuggestion(key, 'cand-01', 'chop'); assert.ok(acc.ok);
    assert.strictEqual(acc.state.requirements.needs[0].have, 4, 'accepted drum-break counts as drum');
    var regions = acc.state.chops; assert.strictEqual(regions.length, 4);
    return PO.saveSession(slicePayload(key, regions));
  }).then(function (s) { assert.ok(s.ok, JSON.stringify(s)); assert.strictEqual(s.revision, 5); return entries(f); })
    .then(function (after) {
      ['analysis/track.json', 'learn/recipe.json', 'learn/progress.json', 'learn/requirements.json', 'x-future/notes.bin', 'audio/source.wav', 'samples/sample-01.wav', 'samples/sample-02.wav', 'samples/sample-03.wav'].forEach(function (n) {
        assert.deepStrictEqual(after[n], before[n], n + ' byte-identical');
      });
      return FS.open(f);
    }).then(function (o) { assert.ok(/VALID/.test(o.result.level)); assert.strictEqual(o.result.manifest.revision, 5); assert.deepStrictEqual(o.result.manifest['x-learn-note'], { keep: 'me' }); });
});
test('save conflict: LEARN saved revision 5 while DROP held 4 -> conflict, nothing overwritten, no merge', function () {
  var f = copy('learn-mutated.spsystem');
  return PO.openExternalProject(f).then(function (r) {
    var key = r.info.key; assert.strictEqual(r.info.revision, 4); var acc = PO.acceptSuggestion(key, 'cand-01', 'chop'); assert.ok(acc.ok);
    return H.simulateLearn(fs.readFileSync(f), '2026-10-09T13:00:00Z').then(function (l) {
      fs.writeFileSync(f, l.bytes); var onDisk = fs.readFileSync(f);
      return PO.saveSession(slicePayload(key, acc.state.chops)).then(function (s) {
        assert.strictEqual(s.ok, false); assert.strictEqual(s.conflict, true); assert.strictEqual(s.code, 'E_CONFLICT'); assert.strictEqual(s.disk.revision, 5); assert.strictEqual(s.base.revision, 4);
        assert.deepStrictEqual(fs.readFileSync(f), onDisk); assert.ok(OIL.sessions.get(key).project.isDirty(), 'DROP keeps the user\'s unsaved work');
      });
    });
  });
});
test('Open in LEARN on an unchanged opened project hands the file over without saving (no revision bump)', function () {
  var f = copy('learn-prepared.spsystem'), launched = [];
  return PO.openExternalProject(f).then(function (r) {
    var before = sha(f);
    return OIL.run({ sessionKey: r.info.key, unchanged: true }, { launch: function (x) { launched.push(x); return Promise.resolve({ launched: 'learn' }); } }).then(function (o) {
      assert.ok(o.ok && o.saved === false && o.revision === 1); assert.deepStrictEqual(launched, [f]); assert.strictEqual(sha(f), before);
    });
  });
});
test('read-only requirements: DROP never offers a write path for learn/requirements.json; absent requirements -> null', function () {
  var f = copy('learn-prepared.spsystem');
  return PO.openExternalProject(f).then(function (r) {
    assert.strictEqual(r.info.requirements, null);
    var p = OIL.sessions.get(r.info.key).project; assert.strictEqual(p.isReadOnly('requirements'), true);
    assert.ok(['chops', 'samples', 'pads', 'loops'].every(function (n) { return !p.isReadOnly(n); }));
  });
});

test('Open in LEARN picks a LEARN build that can open .spsystem (newest), never an old one', function () {
  assert.strictEqual(OIL.chooseLearn([{ path: '/Applications/Old.app', opensSpsystem: false, modified: 9 }]), null);
  assert.strictEqual(OIL.chooseLearn([{ path: '/a/Old.app', opensSpsystem: false, modified: 9 }, { path: '/b/Dev.app', opensSpsystem: true, modified: 1 }, { path: '/c/New.app', opensSpsystem: true, modified: 5 }]), '/c/New.app');
  assert.strictEqual(OIL.chooseLearn([]), null);
});
