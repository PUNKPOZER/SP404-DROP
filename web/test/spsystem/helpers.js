'use strict';
var P = require('../../sp-package.js'), SPProject = require('../../sp-project.js');

function wav(seconds, rate, bits, freq) {
  rate = rate || 48000; bits = bits || 16;
  var n = Math.round(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(bits, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (var i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (freq || 220) * i / rate) * 12000), 44 + i * 2);
  return new Uint8Array(b);
}

/* Raw ZIP builder for hostile / odd archives. entries: [{name, data, method, flags, extAttr, versionMade, crc, usize, csize, rawBytes}] */
function rawZip(entries, o) {
  o = o || {};
  var z = require('zlib'), chunks = [], cd = [], off = 0;
  function w(buf) { chunks.push(buf); off += buf.length; }
  entries.forEach(function (e) {
    var name = Buffer.from(e.name, 'utf8'), data = Buffer.from(e.data || ''), method = e.method === undefined ? 0 : e.method;
    var body = e.rawBytes ? Buffer.from(e.rawBytes) : (method === 8 ? z.deflateRawSync(data) : data);
    var crc = e.crc !== undefined ? e.crc : P.crc32(new Uint8Array(data)), usize = e.usize !== undefined ? e.usize : data.length, csize = e.csize !== undefined ? e.csize : body.length;
    var flags = e.flags === undefined ? 0x800 : e.flags;
    var h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(flags, 6); h.writeUInt16LE(method, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(csize, 18); h.writeUInt32LE(usize, 22); h.writeUInt16LE(name.length, 26);
    var localOff = off; w(h); w(name); w(body);
    var c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(e.versionMade === undefined ? 20 : e.versionMade, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8); c.writeUInt16LE(method, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(csize, 20); c.writeUInt32LE(usize, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE((e.extAttr || 0) >>> 0, 38); c.writeUInt32LE(e.localOff !== undefined ? e.localOff : localOff, 42);
    cd.push(Buffer.concat([c, name]));
  });
  var cdBuf = Buffer.concat(cd), cdOff = off; w(cdBuf);
  var e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cdBuf.length, 12); e.writeUInt32LE(cdOff, 16);
  w(e);
  return new Uint8Array(Buffer.concat(chunks));
}
function json(o) { return Buffer.from(JSON.stringify(o)); }
function manifest(extra) {
  var m = { format: 'sp-system', formatVersion: 1, id: '6f1c2b9e-3a44-4d0a-9b1e-2c7d5a8f0e11', createdBy: 'test', createdAt: '2026-10-07T09:00:00Z' };
  for (var k in extra) m[k] = extra[k];
  return m;
}
function minimalZip(extraEntries, mExtra) {
  return rawZip([{ name: 'manifest.json', data: json(manifest(mExtra)) }].concat(extraEntries || []));
}
function openBytes(bytes, opts) { return P.open(P.fromBytes(bytes), opts); }
function codes(res) { return res.issues.map(function (i) { return i.code; }); }

/* A DROP-created project with 3 chops / 3 samples / explicit pads. */
function dropProject(o) {
  o = o || {};
  var src = wav(1.5, 44100, 16, 110);
  return SPProject.sha256(src).then(function (h) {
    var p = SPProject.create({ title: 'Round trip', filename: 'break.wav', durationSeconds: 1.5, sampleRate: 44100, channels: 1, mode: o.mode || 'portable',
      audio: src, sha256: h, version: '1.2.0', now: '2026-10-07T09:00:00Z', id: o.id,
      externalSource: o.mode === 'lightweight' ? { path: '/Users/x/break.wav', hash: h, sizeBytes: src.length } : undefined });
    p.applyTempo({ bpm: 120, beatOffsetSeconds: 0.02, userSet: false, confidence: 0.8, now: '2026-10-07T09:00:00Z' });
    p.syncChopsFromMarkers([{ id: 1, time: 0.5 }, { id: 2, time: 1.0 }], 1.5, { mode: o.chopMode || 'transient', now: '2026-10-07T09:00:00Z' });
    var chain = Promise.resolve();
    p.chopView().forEach(function (c, i) {
      chain = chain.then(function () { return p.putSample({ chop: p.list('chops')[i], wav: wav(c.end - c.start, 48000, 16, 200 + 100 * i), name: 'Slice ' + (i + 1), category: 'drum' }); });
    });
    return chain.then(function () { p.ensurePads(); return p; });
  });
}
module.exports = { wav: wav, rawZip: rawZip, json: json, manifest: manifest, minimalZip: minimalZip, openBytes: openBytes, codes: codes, dropProject: dropProject, P: P };

/* A faithful stand-in for LEARN: it adds the files it owns, an unknown future file and an unknown manifest field,
   bumps revision, and copies everything else through raw (as the spec requires of every SP SYSTEM app). */
module.exports.simulateLearn = function (bytes, now) {
  var learnFiles = {
    'analysis/track.json': Buffer.from(JSON.stringify({ analysisVersion: 1, producedBy: { app: 'sp404-learn', version: '0.4.0' }, producedAt: '2026-10-07T09:20:00Z',
      tempo: { raw: { bpm: 120, confidence: 0.7 } }, 'x-learn-private': { weights: [0.1, 0.2] },
      chopCandidates: [{ id: 'cand-01', kind: 'drum-break', startSeconds: 0.2, endSeconds: 0.9, confidence: 0.7, state: 'suggested' }] }, null, 1)),
    'learn/recipe.json': Buffer.from('{"recipeVersion":1,"kind":"track","steps":[{"id":"step-1","title":"Chop the break"}],"x-future-field":true}\n'),
    'learn/progress.json': Buffer.from('{ "progressVersion": 1,   "lessonsDone": {"l1": 1760000000000} }'),
    'learn/requirements.json': Buffer.from('{"requirementsVersion":1,"lesson":"l1","needs":[{"type":"drum-chop","count":3}]}'),
    'x-future/notes.bin': Buffer.from([0, 1, 2, 3, 250, 251, 252, 253])
  };
  var add = {}; Object.keys(learnFiles).forEach(function (k) { add[k] = new Uint8Array(learnFiles[k]); });
  return P.open(P.fromBytes(bytes)).then(function (r) {
    var m = JSON.parse(JSON.stringify(r.manifest));
    m.revision = (m.revision || 0) + 1; m.modifiedBy = 'sp404-learn'; m.modifiedByVersion = '0.4.0'; m.modifiedAt = now || '2026-10-07T09:30:00Z';
    m['x-learn-note'] = { keep: 'me' };
    m.modules = m.modules || {};
    [['analysis', 'analysis/track.json'], ['recipe', 'learn/recipe.json'], ['progress', 'learn/progress.json'], ['requirements', 'learn/requirements.json']].forEach(function (x) { m.modules[x[0]] = { path: x[1], schemaVersion: 1, owner: 'sp404-learn' }; });
    var sink = P.memorySink();
    return P.assemble(r.package, { replace: { 'manifest.json': P.stringify(m) }, add: add }, sink, { now: now }).then(function () { return { bytes: sink.bytes(), learnFiles: learnFiles }; });
  });
};
