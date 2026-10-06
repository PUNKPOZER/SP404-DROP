/* SP SYSTEM — pure helpers shared by the browser (index.html) and the Node tests.
   No DOM access in this file. ES5 style on purpose, like the rest of the app.
   encodeWav16 / crc32 / MiniZip are the original implementations, moved verbatim. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SPCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function writeStr(dv, off, str) {
    for (var i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i));
  }
  function encodeWav16(audioBuffer) {
    var numCh = audioBuffer.numberOfChannels;
    var rate = audioBuffer.sampleRate;
    var frames = audioBuffer.length;
    var blockAlign = numCh * 2;
    var dataSize = frames * blockAlign;
    var buf = new ArrayBuffer(44 + dataSize);
    var dv = new DataView(buf);
    writeStr(dv, 0, 'RIFF');
    dv.setUint32(4, 36 + dataSize, true);
    writeStr(dv, 8, 'WAVE');
    writeStr(dv, 12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, numCh, true);
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * blockAlign, true);
    dv.setUint16(32, blockAlign, true);
    dv.setUint16(34, 16, true);
    writeStr(dv, 36, 'data');
    dv.setUint32(40, dataSize, true);
    var channels = [];
    for (var c = 0; c < numCh; c++) channels.push(audioBuffer.getChannelData(c));
    var off = 44;
    for (var i = 0; i < frames; i++) {
      for (var ch = 0; ch < numCh; ch++) {
        var s = channels[ch][i];
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        dv.setInt16(off, s < 0 ? s * 32768 : s * 32767, true);
        off += 2;
      }
    }
    return new Uint8Array(buf);
  }

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function MiniZip() { this.entries = []; }
  MiniZip.prototype.addFile = function (path, bytes) {
    this.entries.push({ path: path.replace(/\\/g, '/'), bytes: bytes });
  };
  MiniZip.prototype.generate = function () {
    var parts = [], central = [], offset = 0;
    var encoder = new TextEncoder();
    this.entries.forEach(function (entry) {
      var nameBytes = encoder.encode(entry.path);
      var bytes = entry.bytes;
      var crc = crc32(bytes);
      var lh = new ArrayBuffer(30), dv = new DataView(lh);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, bytes.length, true); dv.setUint32(22, bytes.length, true);
      dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh), nameBytes, bytes);

      var ch = new ArrayBuffer(46), cdv = new DataView(ch);
      cdv.setUint32(0, 0x02014b50, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0, true); cdv.setUint16(10, 0, true); cdv.setUint16(12, 0, true); cdv.setUint16(14, 0, true);
      cdv.setUint32(16, crc, true); cdv.setUint32(20, bytes.length, true); cdv.setUint32(24, bytes.length, true);
      cdv.setUint16(28, nameBytes.length, true); cdv.setUint16(30, 0, true); cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true); cdv.setUint16(36, 0, true); cdv.setUint32(38, 0, true); cdv.setUint32(42, offset, true);
      central.push(new Uint8Array(ch), nameBytes);
      offset += lh.byteLength + nameBytes.length + bytes.length;
    });
    var centralStart = offset, centralSize = 0;
    central.forEach(function (p) { centralSize += p.length; });
    var eocd = new ArrayBuffer(22), edv = new DataView(eocd);
    edv.setUint32(0, 0x06054b50, true); edv.setUint16(4, 0, true); edv.setUint16(6, 0, true);
    edv.setUint16(8, this.entries.length, true); edv.setUint16(10, this.entries.length, true);
    edv.setUint32(12, centralSize, true); edv.setUint32(16, centralStart, true); edv.setUint16(20, 0, true);
    return new Blob(parts.concat(central, [new Uint8Array(eocd)]), { type: 'application/zip' });
  };

  /* ---- export naming (source-aware) ---------------------------------------
     "kick loop (v2).mp3" -> "kick_loop_v2". Keeps letters/digits/-/_ (incl. Cyrillic),
     collapses everything else to "_", trims, caps length so names stay readable
     on the sampler screen. Falls back to "sample" when nothing usable is left. */
  var NAME_MAX = 24;
  function padNum(n) { return n < 10 ? '0' + n : String(n); }
  function exportBaseName(fileName) {
    var base = String(fileName || '').replace(/^.*[\\\/]/, '').replace(/\.[^.]*$/, '');
    base = base.replace(/[^0-9A-Za-zЀ-ӿ_-]+/g, '_').replace(/_+/g, '_').replace(/^[_-]+|[_-]+$/g, '');
    if (base.length > NAME_MAX) base = base.slice(0, NAME_MAX).replace(/[_-]+$/, '');
    return base || 'sample';
  }
  function sampleFileName(fileName, index1) { return exportBaseName(fileName) + '_' + padNum(index1) + '.wav'; }
  function zipFileName(fileName) { return 'SP404-DROP-' + exportBaseName(fileName) + '.zip'; }

  /* ---- 4x4 pad preview mapping --------------------------------------------
     Slice i (0-based) -> bank = floor(i/16), slot = i%16. Slot 0 is pad 1 (bottom-left),
     slot 15 is pad 16 (top-right) — the SP-404 physical numbering. */
  var PAD_COUNT = 16;
  function padOf(sliceIndex) {
    return { bank: Math.floor(sliceIndex / PAD_COUNT), slot: sliceIndex % PAD_COUNT, pad: (sliceIndex % PAD_COUNT) + 1 };
  }
  function sliceAt(bank, pad) { return bank * PAD_COUNT + (pad - 1); }
  function bankCount(sliceTotal) { return Math.max(1, Math.ceil(sliceTotal / PAD_COUNT)); }
  function bankLetter(bank) { return String.fromCharCode(65 + (bank % 26)); }
  /* physical layout, top row first: 13 14 15 16 / 9 10 11 12 / 5 6 7 8 / 1 2 3 4 */
  var PAD_ROWS = [[13, 14, 15, 16], [9, 10, 11, 12], [5, 6, 7, 8], [1, 2, 3, 4]];

  return {
    encodeWav16: encodeWav16, crc32: crc32, MiniZip: MiniZip,
    padNum: padNum, exportBaseName: exportBaseName, sampleFileName: sampleFileName, zipFileName: zipFileName, NAME_MAX: NAME_MAX,
    PAD_COUNT: PAD_COUNT, PAD_ROWS: PAD_ROWS, padOf: padOf, sliceAt: sliceAt, bankCount: bankCount, bankLetter: bankLetter
  };
});
