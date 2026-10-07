'use strict';
var test = require('node:test'), assert = require('node:assert'), zlib = require('zlib');
var H = require('./helpers.js'), P = H.P, rawZip = H.rawZip, minimalZip = H.minimalZip, openBytes = H.openBytes, codes = H.codes, json = H.json;

function expectBad(bytes, code, opts) {
  return openBytes(bytes, opts).then(function (r) { assert.strictEqual(r.level, 'CORRUPTED', JSON.stringify(r.issues)); assert.strictEqual(r.code, code); assert.strictEqual(r.manifest, null); return r; });
}

test('minimal package is VALID', function () {
  return openBytes(minimalZip()).then(function (r) { assert.strictEqual(r.level, 'VALID'); assert.strictEqual(r.manifest.format, 'sp-system'); });
});
test('writer output is a real ZIP that re-opens (store + deflate, UTF-8 names)', function () {
  var sink = P.memorySink();
  return P.assemble(null, { add: { 'manifest.json': P.stringify(H.manifest()), 'project/chops.json': P.stringify({ schemaVersion: 1, chops: [] }),
    'samples/ключ.wav': H.wav(0.1), 'x-future/notes.txt': new Uint8Array(Buffer.from('hello '.repeat(100))) } }, sink, { deflate: true, now: '2026-10-07T09:00:00Z' })
    .then(function (w) {
      assert.strictEqual(w.entries[0].name, 'manifest.json');
      return openBytes(sink.bytes());
    }).then(function (r) {
      assert.ok(r.level === 'VALID' || r.level === 'VALID_WITH_WARNINGS', JSON.stringify(r.issues));
      assert.ok(r.package.has('samples/ключ.wav'));
      return r.package.read('x-future/notes.txt');
    }).then(function (b) { assert.strictEqual(Buffer.from(b).toString(), 'hello '.repeat(100)); });
});

/* ---- hostile archives ---------------------------------------------------- */
['../evil.json', 'a/../../evil.json', '/etc/passwd', 'C:/x.json', 'c:\\x.json', 'a\\b.json', './x.json', 'a//b.json', 'a/./b', 'ctl\u0001.json'].forEach(function (n) {
  test('rejects unsafe name ' + JSON.stringify(n), function () { return expectBad(minimalZip([{ name: n, data: '{}' }]), 'E_PATH_UNSAFE'); });
});
test('rejects over-long name', function () { return expectBad(minimalZip([{ name: new Array(250).join('a') + '.json', data: '{}' }]), 'E_PATH_UNSAFE'); });
test('rejects symlink entries', function () {
  return expectBad(minimalZip([{ name: 'samples/link.wav', data: '/etc/passwd', versionMade: (3 << 8) | 20, extAttr: (0o120777 << 16) >>> 0 }]), 'E_SYMLINK');
});
['run.exe', 'a.sh', 'x/tool.dll', 'script.js', 'm.command', 'Foo.APP', 'a.bat', 'q.py'].forEach(function (n) {
  test('rejects executable type ' + n, function () { return expectBad(minimalZip([{ name: n, data: 'x' }]), 'E_FORBIDDEN_TYPE'); });
});
test('rejects duplicate and case/normalisation-colliding names', function () {
  return expectBad(minimalZip([{ name: 'a.bin', data: '1' }, { name: 'a.bin', data: '2' }]), 'E_DUP_NAME').then(function () {
    return expectBad(minimalZip([{ name: 'Samples/A.bin', data: '1' }, { name: 'samples/a.bin', data: '2' }]), 'E_CASE_COLLISION');
  }).then(function () {
    return expectBad(minimalZip([{ name: 'caf\u00e9.bin', data: '1' }, { name: 'cafe\u0301.bin', data: '2' }]), 'E_CASE_COLLISION');
  });
});
test('rejects too many entries (limit is configurable)', function () {
  var es = []; for (var i = 0; i < 12; i++) es.push({ name: 'x/f' + i + '.bin', data: 'a' });
  return expectBad(minimalZip(es), 'E_TOO_MANY_ENTRIES', { limits: { maxEntries: 10 } });
});
test('default entry cap is 2000', function () { assert.strictEqual(P.DEFAULT_LIMITS.maxEntries, 2000); });
test('zip bomb: huge ratio rejected before inflating', function () {
  var data = Buffer.alloc(8 * 1024 * 1024);
  return expectBad(minimalZip([{ name: 'x/bomb.bin', data: data, method: 8 }]), 'E_RATIO');
});
test('size limits report the friendly message, never crash', function () {
  return expectBad(minimalZip([{ name: 'x/big.bin', data: Buffer.alloc(5000) }]), 'E_TOO_LARGE', { limits: { maxEntryBytes: 1000 } }).then(function (r) {
    assert.strictEqual(r.message, 'PROJECT TOO LARGE FOR THIS VERSION OF DROP');
    return expectBad(minimalZip([{ name: 'x/big.bin', data: Buffer.alloc(5000) }]), 'E_TOO_LARGE', { limits: { maxPackageBytes: 100 } });
  }).then(function () { return expectBad(minimalZip([{ name: 'x/a.bin', data: Buffer.alloc(900) }, { name: 'x/b.bin', data: Buffer.alloc(900) }]), 'E_TOO_LARGE', { limits: { maxTotalBytes: 1500 } }); });
});
test('declared sizes lie: inflate past declared size / stored mismatch / CRC', function () {
  var body = zlib.deflateRawSync(Buffer.alloc(5000, 7));
  return openBytes(minimalZip([{ name: 'x/a.bin', data: Buffer.alloc(5000, 7), method: 8, usize: 10, rawBytes: body }])).then(function (r) {
    return r.package.read('x/a.bin').then(function () { assert.fail('should throw'); }, function (e) { assert.ok(/E_SIZE_MISMATCH|E_TOO_LARGE/.test(e.code), e.code); });
  }).then(function () {
    return expectBad(minimalZip([{ name: 'x/b.bin', data: 'abcd', usize: 9 }]), 'E_SIZE_MISMATCH');
  }).then(function () {
    return openBytes(minimalZip([{ name: 'x/c.bin', data: 'abcd', crc: 12345 }]));
  }).then(function (r) { return r.package.read('x/c.bin').then(function () { assert.fail('no'); }, function (e) { assert.strictEqual(e.code, 'E_CRC'); }); });
});
test('memory budget refuses to buffer a huge entry', function () {
  return openBytes(minimalZip([{ name: 'x/a.bin', data: Buffer.alloc(5000) }]), { limits: { memoryBudgetBytes: 1000 } }).then(function (r) {
    return r.package.read('x/a.bin').then(function () { assert.fail('no'); }, function (e) { assert.strictEqual(e.code, 'E_TOO_LARGE'); assert.strictEqual(e.message, P.TOO_LARGE_MESSAGE); });
  });
});
test('rejects encrypted, ZIP64 markers, junk, truncation, missing manifest', function () {
  return expectBad(minimalZip([{ name: 'x/e.bin', data: 'a', flags: 0x801 }]), 'E_ENCRYPTED').then(function () {
    var z = Buffer.from(minimalZip()); z.writeUInt16LE(0xFFFF, z.length - 22 + 10); z.writeUInt16LE(0xFFFF, z.length - 22 + 8);
    return expectBad(new Uint8Array(z), 'E_ZIP64');
  }).then(function () { return expectBad(new Uint8Array(Buffer.from('this is not a zip file at all, definitely')), 'E_NOT_ZIP'); })
    .then(function () { return expectBad(minimalZip().subarray(0, 40), 'E_NOT_ZIP'); })
    .then(function () { return expectBad(rawZip([{ name: 'project/chops.json', data: '{}' }]), 'E_NO_MANIFEST'); });
});
test('rejects bad local header / overlapping entries', function () {
  return expectBad(rawZip([{ name: 'manifest.json', data: json(H.manifest()) }, { name: 'x/a.bin', data: 'hello', localOff: 0 }]), 'E_NOT_ZIP');
});
test('manifest problems: not JSON, wrong format, schema violations, newer formatVersion', function () {
  return expectBad(rawZip([{ name: 'manifest.json', data: '{nope' }]), 'E_MANIFEST_INVALID').then(function () {
    return expectBad(rawZip([{ name: 'manifest.json', data: json(H.manifest({ format: 'other' })) }]), 'E_MANIFEST_INVALID');
  }).then(function () {
    return expectBad(rawZip([{ name: 'manifest.json', data: json(H.manifest({ id: 'nope' })) }]), 'E_MANIFEST_INVALID');
  }).then(function () {
    return openBytes(rawZip([{ name: 'manifest.json', data: json(H.manifest({ formatVersion: 2 })) }]));
  }).then(function (r) { assert.strictEqual(r.level, 'UNSUPPORTED_VERSION'); assert.strictEqual(r.code, 'E_UNSUPPORTED_VERSION'); });
});
test('content sniffing: audio must match its extension; executables rejected by magic', function () {
  return expectBad(minimalZip([{ name: 'samples/x.wav', data: 'not really a wav file....' }]), 'E_SNIFF_MISMATCH').then(function () {
    return expectBad(minimalZip([{ name: 'samples/x.wav', data: Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(40)]) }]), 'E_FORBIDDEN_TYPE');
  }).then(function () { return expectBad(minimalZip([{ name: 'audio/source.wav', data: '#!/bin/sh\nrm -rf /' }]), 'E_FORBIDDEN_TYPE'); });
});

/* ---- modules ---------------------------------------------------- */
test('invalid DROP module: warning, kept read-only; invalid JSON too', function () {
  return openBytes(minimalZip([{ name: 'project/pads.json', data: json({ schemaVersion: 1, assignments: [{ bank: 'zz', pad: 99 }] }) }, { name: 'project/loops.json', data: '{broken' }])).then(function (r) {
    assert.strictEqual(r.level, 'VALID_WITH_WARNINGS');
    assert.strictEqual(r.modules.pads.status, 'invalid'); assert.strictEqual(r.modules.loops.status, 'invalid');
    assert.strictEqual(codes(r).filter(function (c) { return c === 'W_MODULE_INVALID'; }).length, 2);
  });
});
test('newer DROP-owned module -> UNSUPPORTED_VERSION; newer LEARN-owned -> warning only', function () {
  return openBytes(minimalZip([{ name: 'project/chops.json', data: json({ schemaVersion: 2, chops: [] }) }])).then(function (r) {
    assert.strictEqual(r.level, 'UNSUPPORTED_VERSION');
    return openBytes(minimalZip([{ name: 'analysis/track.json', data: json({ analysisVersion: 5, brandNew: true }) }]));
  }).then(function (r) { assert.strictEqual(r.level, 'VALID_WITH_WARNINGS'); assert.ok(codes(r).indexOf('W_MODULE_NEWER') >= 0); assert.strictEqual(r.modules.analysis.status, 'newer'); });
});
test('dangling references, stale analysis and unknown files are warnings, never errors', function () {
  var z = minimalZip([
    { name: 'project/samples.json', data: json({ schemaVersion: 1, samples: [{ id: 'sample-01', file: 'samples/none.wav', sourceChopId: 'chop-99', durationSeconds: 1, sampleRate: 48000, bitDepth: 16, channels: 1 }] }) },
    { name: 'project/chops.json', data: json({ schemaVersion: 1, chops: [] }) },
    { name: 'project/pads.json', data: json({ schemaVersion: 1, assignments: [{ bank: 'A', pad: 1, sampleId: 'sample-77' }] }) },
    { name: 'analysis/track.json', data: json({ analysisVersion: 1, audioSha256: 'ffffffffffffffffffffffffffffffff' }) },
    { name: 'x-future/blob.bin', data: 'zz' }
  ], { source: { mode: 'portable', audio: 'audio/source.wav', sha256: '0123456789abcdef0123456789abcdef' } });
  return openBytes(z).then(function (r) {
    assert.strictEqual(r.level, 'VALID_WITH_WARNINGS');
    ['W_MISSING_FILE', 'W_DANGLING_REF', 'W_STALE_ANALYSIS', 'W_UNKNOWN_FILE'].forEach(function (c) { assert.ok(codes(r).indexOf(c) >= 0, c); });
  });
});
test('unsafe keys are dropped from DROP-owned JSON with a warning (S20)', function () {
  return openBytes(minimalZip([{ name: 'project/loops.json', data: '{"schemaVersion":1,"loops":[],"__proto__":{"polluted":1},"constructor":{"x":1}}' }])).then(function (r) {
    assert.ok(codes(r).indexOf('W_PROTO_KEY_DROPPED') >= 0);
    assert.strictEqual(({}).polluted, undefined);
    assert.ok(!Object.prototype.hasOwnProperty.call(r.modules.loops.data, '__proto__'));
  });
});
test('writer refuses unsafe or executable names', function () {
  var sink = P.memorySink();
  assert.throws(function () { P.assemble(null, { add: { 'manifest.json': P.stringify(H.manifest()), '../x.json': new Uint8Array(1) } }, sink); }, /unsafe entry name/);
  assert.throws(function () { P.assemble(null, { add: { 'manifest.json': P.stringify(H.manifest()), 'run.sh': new Uint8Array(1) } }, sink); }, /unsafe entry name/);
});
test('raw copy-through keeps name, mtime, method, CRC and compressed bytes', function () {
  var z = rawZip([{ name: 'manifest.json', data: json(H.manifest()) }, { name: 'x-future/a.bin', data: Buffer.alloc(400, 3), method: 8 }]);
  return openBytes(z).then(function (r) {
    var sink = P.memorySink();
    return P.assemble(r.package, { replace: { 'manifest.json': P.stringify(H.manifest({ revision: 1 })) } }, sink).then(function () {
      return openBytes(sink.bytes()).then(function (r2) {
        var a = r.package.entry('x-future/a.bin'), b = r2.package.entry('x-future/a.bin');
        ['crc', 'csize', 'usize', 'method', 'time', 'date'].forEach(function (k) { assert.strictEqual(b[k], a[k], k); });
        return Promise.all([r.package.readRaw(a), r2.package.readRaw(b)]).then(function (x) { assert.deepStrictEqual(Buffer.from(x[0]), Buffer.from(x[1])); });
      });
    });
  });
});
