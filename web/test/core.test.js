'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../sp-core.js');

function fakeBuffer(channels, rate) {
  const data = channels.map((c) => Float32Array.from(c));
  return { numberOfChannels: data.length, sampleRate: rate, length: data[0].length, getChannelData: (i) => data[i] };
}

test('encodeWav16: header and PCM bytes', () => {
  const wav = core.encodeWav16(fakeBuffer([[0, 1, -1, 2, -2, 0.5]], 48000));
  const dv = new DataView(wav.buffer);
  const tag = (o) => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
  assert.equal(tag(0), 'RIFF'); assert.equal(tag(8), 'WAVE'); assert.equal(tag(12), 'fmt '); assert.equal(tag(36), 'data');
  assert.equal(dv.getUint32(4, true), 36 + 12);
  assert.equal(dv.getUint16(20, true), 1);          // PCM
  assert.equal(dv.getUint16(22, true), 1);          // mono
  assert.equal(dv.getUint32(24, true), 48000);
  assert.equal(dv.getUint32(28, true), 96000);      // byte rate
  assert.equal(dv.getUint16(32, true), 2);          // block align
  assert.equal(dv.getUint16(34, true), 16);
  assert.equal(dv.getUint32(40, true), 12);
  const s = [0, 1, 2, 3, 4, 5].map((i) => dv.getInt16(44 + i * 2, true));
  assert.deepEqual(s, [0, 32767, -32768, 32767, -32768, 16383]);   // clamped, asymmetric scale, truncated
});

test('encodeWav16: stereo is interleaved', () => {
  const wav = core.encodeWav16(fakeBuffer([[1, 0], [0, -1]], 44100));
  const dv = new DataView(wav.buffer);
  assert.equal(dv.getUint16(22, true), 2);
  assert.deepEqual([0, 1, 2, 3].map((i) => dv.getInt16(44 + i * 2, true)), [32767, 0, 0, -32768]);
});

test('crc32 matches the reference value', () => {
  assert.equal(core.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  assert.equal(core.crc32(new Uint8Array(0)), 0);
});

test('MiniZip output is a valid archive (unzip -t) with the right content', async () => {
  const zip = new core.MiniZip();
  const a = core.encodeWav16(fakeBuffer([[0, 0.25, -0.25]], 48000));
  zip.addFile('Folder\\sub/a.wav', a);
  zip.addFile('CONVERSION_REPORT.txt', new TextEncoder().encode('hello\n'));
  const buf = Buffer.from(await zip.generate().arrayBuffer());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp404zip-'));
  const f = path.join(dir, 't.zip');
  fs.writeFileSync(f, buf);
  const out = execFileSync('unzip', ['-t', f]).toString();
  assert.match(out, /No errors detected/);
  assert.match(execFileSync('unzip', ['-l', f]).toString(), /Folder\/sub\/a\.wav/);
  assert.deepEqual(Buffer.from(execFileSync('unzip', ['-p', f, 'Folder/sub/a.wav'])), Buffer.from(a));
  assert.equal(execFileSync('unzip', ['-p', f, 'CONVERSION_REPORT.txt']).toString(), 'hello\n');
});

test('export names are source-aware, safe and short', () => {
  assert.equal(core.exportBaseName('kick loop (v2).mp3'), 'kick_loop_v2');
  assert.equal(core.exportBaseName('/a/b/Track-01.WAV'), 'Track-01');
  assert.equal(core.exportBaseName('Привет мир.flac'), 'Привет_мир');
  assert.equal(core.exportBaseName('...'), 'sample');
  assert.equal(core.exportBaseName(''), 'sample');
  assert.ok(core.exportBaseName('a'.repeat(80) + '.wav').length <= core.NAME_MAX);
  assert.equal(core.sampleFileName('Amen Break.wav', 3), 'Amen_Break_03.wav');
  assert.equal(core.sampleFileName('x.wav', 12), 'x_12.wav');
  assert.equal(core.zipFileName('My Song.mp3'), 'SP404-DROP-My_Song.zip');
});

test('pad mapping: 1 = bottom-left, banks of 16, no slice is lost', () => {
  assert.deepEqual(core.PAD_ROWS, [[13, 14, 15, 16], [9, 10, 11, 12], [5, 6, 7, 8], [1, 2, 3, 4]]);
  assert.deepEqual(core.PAD_ROWS.flat().sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.deepEqual(core.padOf(0), { bank: 0, slot: 0, pad: 1 });
  assert.deepEqual(core.padOf(15), { bank: 0, slot: 15, pad: 16 });
  assert.deepEqual(core.padOf(16), { bank: 1, slot: 0, pad: 1 });
  assert.equal(core.sliceAt(1, 3), 18);
  assert.equal(core.bankCount(0), 1); assert.equal(core.bankCount(16), 1); assert.equal(core.bankCount(17), 2); assert.equal(core.bankCount(500), 32);
  for (let i = 0; i < 100; i++) { const p = core.padOf(i); assert.equal(core.sliceAt(p.bank, p.pad), i); }
  assert.equal(core.bankLetter(0), 'A'); assert.equal(core.bankLetter(2), 'C');
});
