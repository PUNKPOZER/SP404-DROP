'use strict';
var test = require('node:test'), assert = require('node:assert');
var H = require('./helpers.js'), P = H.P, SPProject = require('../../sp-project.js'), V = require('../../sp-validate.js'), S = require('../../sp-schemas.js');

function saveToBytes(p, opts) {
  var prep = p.prepareSave(opts || { now: '2026-10-07T10:00:00Z' }), sink = P.memorySink();
  return P.assemble(p.pkg, prep.plan, sink, { now: '2026-10-07T10:00:00Z' }).then(function () { return sink.bytes(); });
}
function reopen(bytes) { return H.openBytes(bytes).then(function (r) { return { res: r, project: SPProject.fromOpen(r) }; }); }

test('new project: UUID, revision 0 in memory -> first save writes 1, all modules valid', function () {
  return H.dropProject().then(function (p) {
    assert.match(p.manifest.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.strictEqual(p.manifest.revision, 0);
    return saveToBytes(p);
  }).then(reopen).then(function (o) {
    assert.strictEqual(o.res.level, 'VALID', JSON.stringify(o.res.issues));
    assert.strictEqual(o.res.manifest.revision, 1);
    assert.strictEqual(o.res.manifest.createdBy, 'sp404-drop');
    assert.strictEqual(o.res.manifest.source.mode, 'portable');
    ['chops', 'samples', 'pads'].forEach(function (n) { assert.strictEqual(o.res.modules[n].status, 'ok', n); });
  });
});
test('DROP automatic layout is serialised into pads.json (A1 = pad 1 bottom-left)', function () {
  return H.dropProject().then(function (p) {
    var a = p.list('pads');
    assert.deepStrictEqual(a.map(function (x) { return x.bank + x.pad + ':' + x.sampleId; }), ['A1:sample-01', 'A2:sample-02', 'A3:sample-03']);
    assert.deepStrictEqual(V.validate(S.schemas, 'pads.schema.json', p.modules.pads.data), []);
  });
});
test('chain PAD -> sampleId -> sample -> sourceChopId -> chop resolves; stable ids follow the pattern', function () {
  return H.dropProject().then(function (p) {
    var a = p.list('pads')[1], s = p.list('samples').filter(function (x) { return x.id === a.sampleId; })[0], c = p.list('chops').filter(function (x) { return x.id === s.sourceChopId; })[0];
    assert.strictEqual(c.id, 'chop-02'); assert.strictEqual(s.file, 'samples/sample-02.wav');
    p.list('chops').concat(p.list('samples')).forEach(function (x) { assert.match(x.id, /^[a-z0-9][a-z0-9._-]{0,63}$/); });
    assert.strictEqual(s.sampleRate, 48000); assert.strictEqual(s.bitDepth, 16); assert.strictEqual(s.channels, 1);
    assert.ok(Math.abs(s.durationSeconds - 0.5) < 1e-6); assert.match(s.sha256, /^[0-9a-f]{64}$/);
  });
});
test('Equal mode is stored as type "manual" + method "equal"; readers ignore method', function () {
  return H.dropProject({ chopMode: 'equal' }).then(function (p) {
    p.list('chops').forEach(function (c) { assert.strictEqual(c.type, 'manual'); assert.strictEqual(c.method, 'equal'); });
    assert.deepStrictEqual(V.validate(S.schemas, 'chops.schema.json', p.modules.chops.data), []);
  });
});
test('all DROP modes map to canonical types; DROP never writes type "loop"', function () {
  assert.deepStrictEqual(SPProject.typeFor('beat'), { type: 'beat' });
  assert.deepStrictEqual(SPProject.typeFor('transient'), { type: 'transient' });
  assert.deepStrictEqual(SPProject.typeFor('manual'), { type: 'manual' });
  assert.deepStrictEqual(SPProject.typeFor('equal'), { type: 'manual', method: 'equal' });
});
test('stable ids are never reused after deletion, and survive reopen', function () {
  return H.dropProject().then(function (p) {
    p.syncChopsFromMarkers([{ time: 0.5 }], 1.5, { mode: 'manual' });          /* chop-01 kept, 0.5..1.5 is new => chop-04; chop-02/03 removed */
    assert.deepStrictEqual(p.list('chops').map(function (c) { return c.id; }), ['chop-01', 'chop-04']);
    return saveToBytes(p).then(reopen).then(function (o) {
      var q = o.project; q.syncChopsFromMarkers([], 1.5, { mode: 'manual' });
      assert.deepStrictEqual(q.list('chops').map(function (c) { return c.id; }), ['chop-05']);
    });
  });
});
test('unchanged chop objects keep every field (name, extra, createdAt) when markers are re-synced', function () {
  return H.dropProject().then(function (p) {
    p.list('chops')[0].name = 'My kick'; p.list('chops')[0]['x-lab'] = { hello: 1 };
    var before = JSON.stringify(p.list('chops')[0]);
    p.syncChopsFromMarkers([{ time: 0.5 }, { time: 1.0 }, { time: 1.2 }], 1.5, { mode: 'transient' });
    assert.strictEqual(JSON.stringify(p.list('chops')[0]), before);
    assert.strictEqual(p.list('chops').length, 4);
  });
});
test('chops are independent regions: gaps/overlap/nesting/out-of-order/short saved losslessly; editor goes LIMITED', function () {
  return H.dropProject().then(function (p) {
    var weird = [{ id: 'chop-10', startSeconds: 1.2, endSeconds: 1.4, type: 'manual' }, { id: 'chop-11', startSeconds: 0.1, endSeconds: 1.0, type: 'beat' },
                 { id: 'chop-12', startSeconds: 0.3, endSeconds: 0.4, type: 'transient', 'x-keep': [1, 2] }, { id: 'chop-13', startSeconds: 0.3, endSeconds: 0.4, type: 'manual' }];
    p.modules.chops.data.chops = weird; p.modules.chops.dirty = true;
    var snapshot = JSON.stringify(weird);
    var rep = p.chopsRepresentable(1.5); assert.strictEqual(rep.ok, false); assert.ok(p.isLimited(1.5));
    var r = p.syncChopsFromMarkers([{ time: 0.7 }], 1.5, { mode: 'manual' });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'E_LIMITED_EDITING');
    assert.strictEqual(JSON.stringify(p.list('chops')), snapshot, 'refused edit must not touch the data');
    return saveToBytes(p).then(reopen).then(function (o) {
      assert.strictEqual(JSON.stringify(o.project.list('chops')), snapshot);
      assert.ok(o.res.issues.every(function (i) { return i.code === 'W_DANGLING_REF'; }), 'only the (expected) dangling sample links are flagged');
    });
  });
});
test('partition detection: contiguous ordered full cover is representable as markers', function () {
  return H.dropProject().then(function (p) {
    var r = p.chopsRepresentable(1.5); assert.ok(r.ok); assert.deepStrictEqual(r.markers, [0.5, 1.0]);
    assert.strictEqual(p.chopsRepresentable(2.0).ok, false);
  });
});
test('rendered samples are not re-rendered when valid (D7); region change forces re-render', function () {
  return H.dropProject().then(function (p) {
    var c = p.list('chops')[0];
    assert.strictEqual(p.needsRender(c), false);
    c.endSeconds = 0.6;
    assert.strictEqual(p.needsRender(c), true);
  });
});
test('revision rules: external package without revision opens as 0 and normalises on first save', function () {
  var z = H.minimalZip();
  return reopen(z).then(function (o) {
    assert.strictEqual(o.project.hadRevision, false);
    return saveToBytes(o.project);
  }).then(reopen).then(function (o) { assert.strictEqual(o.res.manifest.revision, 1); assert.strictEqual(o.res.manifest.modifiedBy, 'sp404-drop'); });
});
test('tempo: user/imported tempo wins over DROP detection; user edit overrides', function () {
  return reopen(H.minimalZip([], { tempo: { bpm: 172, origin: 'user', setBy: 'sp404-learn', 'x-note': 'hi' } })).then(function (o) {
    var p = o.project;
    assert.deepStrictEqual(p.applyTempo({ bpm: 90, userSet: false }), { ok: true, kept: true });
    assert.strictEqual(p.manifest.tempo.bpm, 172);
    p.applyTempo({ bpm: 95, userSet: true, beatOffsetSeconds: 0.1 });
    assert.strictEqual(p.manifest.tempo.bpm, 95); assert.strictEqual(p.manifest.tempo.origin, 'user');
    assert.strictEqual(p.manifest.tempo['x-note'], 'hi', 'unknown tempo fields survive');
  });
});
test('source modes: portable / lightweight / none', function () {
  return H.dropProject({ mode: 'lightweight' }).then(function (p) {
    assert.strictEqual(p.manifest.source.mode, 'lightweight'); assert.ok(p.manifest.source.externalSource.path);
    assert.strictEqual(p.manifest.source.audio, undefined);
    assert.strictEqual(p.list('chops')[0].source, undefined, 'S6: no chop.source when source is not in the package');
    return saveToBytes(p);
  }).then(reopen).then(function (o) {
    assert.ok(!o.res.package.entries.some(function (e) { return /^audio\//.test(e.name); }));
    assert.strictEqual(o.res.level, 'VALID', JSON.stringify(o.res.issues));
    var q = SPProject.create({ title: 'only samples', mode: 'none', version: '1.2.0' });
    assert.strictEqual(q.manifest.source.mode, 'none'); assert.strictEqual(q.manifest.source.audio, undefined);
    assert.throws(function () { SPProject.create({ mode: 'lightweight' }); }, /externalSource/);
    assert.throws(function () { SPProject.create({ mode: 'cloud' }); }, /unknown source mode/);
  });
});
test('setPad data layer: moves/clears/labels; rejects bad pads and unknown samples', function () {
  return H.dropProject().then(function (p) {
    assert.deepStrictEqual(p.setPad('A', 4, 'sample-03'), { ok: true });
    assert.deepStrictEqual(p.setPad('B', 16, null, 'empty'), { ok: true });
    assert.strictEqual(p.setPad('A', 17, 'sample-01').code, 'E_BAD_PAD'); assert.strictEqual(p.setPad('a', 1, 'sample-01').code, 'E_BAD_PAD');
    assert.strictEqual(p.setPad('A', 1, 'sample-99').code, 'E_NO_SAMPLE');
    assert.deepStrictEqual(V.validate(S.schemas, 'pads.schema.json', p.modules.pads.data), []);
  });
});
test('ensurePads keeps the saved mapping (user wins) and only places new samples in free slots', function () {
  return H.dropProject().then(function (p) {
    p.setPad('A', 1, 'sample-03'); p.setPad('A', 3, null);
    p.modules.samples.data.samples.push({ id: 'sample-09', file: 'samples/sample-09.wav', durationSeconds: 1, sampleRate: 48000, bitDepth: 16, channels: 1 });
    var r = p.ensurePads(); assert.strictEqual(r.placed, 2, 'sample-01 (displaced by the user) and sample-09 are unassigned');
    assert.strictEqual(p.list('pads')[1].sampleId, 'sample-02');
    assert.strictEqual(p.list('pads')[0].sampleId, 'sample-03');
    assert.ok(p.list('pads').some(function (a) { return a.sampleId === 'sample-09'; }));
  });
});
test('candidates: read-only view; accepting creates a chop with fromCandidateId and never edits analysis', function () {
  var analysis = { analysisVersion: 1, 'x-learn': 7, chopCandidates: [{ id: 'cand-01', kind: 'drum-break', label: 'Break', startSeconds: 0.2, endSeconds: 0.9, confidence: 0.7, state: 'suggested' }],
                   loopCandidates: [{ id: 'lc-1', startSeconds: 0, endSeconds: 1, bars: 1 }] };
  return reopen(H.minimalZip([{ name: 'analysis/track.json', data: H.json(analysis) }])).then(function (o) {
    var p = o.project, c = p.candidates();
    assert.strictEqual(c.chops.length, 1); assert.strictEqual(c.loops.length, 1); assert.strictEqual(c.chops[0].state, 'suggested');
    var r = p.acceptCandidate('cand-01', { now: '2026-10-07T10:00:00Z' });
    assert.strictEqual(r.chop.type, 'analysis-suggestion'); assert.strictEqual(r.chop.fromCandidateId, 'cand-01');
    assert.strictEqual(p.acceptCandidate('cand-01').code, 'E_ALREADY_ACCEPTED'); assert.strictEqual(p.acceptCandidate('nope').code, 'E_NO_CANDIDATE');
    assert.strictEqual(p.modules.analysis.dirty, false);
    return saveToBytes(p).then(function (b) { return reopen(b); }).then(function (o2) {
      assert.deepStrictEqual(Buffer.from(o2.res.modules.analysis.raw), Buffer.from(o.res.modules.analysis.raw), 'analysis bytes untouched');
    });
  });
});
test('loops sync keeps unchanged objects and allocates loop ids', function () {
  return H.dropProject().then(function (p) {
    p.syncLoops([{ startSeconds: 0, endSeconds: 0.5, bars: 1, bpm: 120 }]);
    var first = JSON.stringify(p.list('loops')[0]); assert.strictEqual(p.list('loops')[0].id, 'loop-01');
    p.syncLoops([{ startSeconds: 0, endSeconds: 0.5, bars: 1, bpm: 120 }, { startSeconds: 0.5, endSeconds: 1, bars: 1 }]);
    assert.strictEqual(JSON.stringify(p.list('loops')[0]), first); assert.strictEqual(p.list('loops')[1].id, 'loop-02');
    assert.deepStrictEqual(V.validate(S.schemas, 'loops.schema.json', p.modules.loops.data), []);
  });
});
test('read-only modules cannot be changed; invalid DROP-owned file is written back byte-identical', function () {
  var bad = Buffer.from('{ "schemaVersion": 1, "assignments": [ {"bank":"zz","pad":99} ] }  ');
  return reopen(H.minimalZip([{ name: 'project/pads.json', data: bad }])).then(function (o) {
    var p = o.project;
    assert.throws(function () { p.setPad('A', 1, null); }, function (e) { return e.code === 'E_READONLY_MODULE'; });
    return saveToBytes(p).then(reopen).then(function (o2) { assert.deepStrictEqual(Buffer.from(o2.res.modules.pads.raw), bad); });
  });
});
test('refuses to save invalid data', function () {
  return H.dropProject().then(function (p) {
    p.list('samples')[0].bitDepth = 12;
    assert.throws(function () { p.prepareSave({}); }, function (e) { return e.code === 'E_INVALID_MODULE_DATA'; });
  });
});
test('Save a copy regenerates the id; normal save never does', function () {
  return H.dropProject().then(function (p) {
    var id = p.manifest.id;
    assert.strictEqual(p.prepareSave({}).manifest.id, id);
    var c = p.prepareSave({ copy: true }); assert.notStrictEqual(c.manifest.id, id); assert.strictEqual(c.nextRevision, 1);
  });
});
test('wavInfo reads canonical sample metadata', function () {
  var i = SPProject.wavInfo(H.wav(0.25, 48000, 16));
  assert.strictEqual(i.sampleRate, 48000); assert.strictEqual(i.bitDepth, 16); assert.strictEqual(i.channels, 1); assert.ok(Math.abs(i.durationSeconds - 0.25) < 1e-9);
  assert.strictEqual(SPProject.wavInfo(new Uint8Array(10)), null);
});
