/* SP SYSTEM — .spsystem package reader / writer (ZIP container), dependency-free, ES5 style.

   A .spsystem file is UNTRUSTED INPUT. This module never executes anything and never writes to disk;
   it parses the ZIP central directory, vets every entry, validates the manifest + known modules against
   the canonical schemas (sp-schemas.js) and resolves with a result object — it does not throw for bad
   input (programmer errors excepted).

   Result levels: VALID | VALID_WITH_WARNINGS | UNSUPPORTED_VERSION | CORRUPTED.
   Compression is injected (codecs.inflateRaw / deflateRaw) so the same code runs in Node, Electron and the
   browser; defaultCodecs() provides Node's zlib when available.

   Ownership (spec §Merge): DROP owns manifest tempo/modules + project/*.json; LEARN owns analysis/ + learn/.
   Everything not rewritten is copied through "raw" (same name, mtime, method, CRC, compressed bytes). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sp-schemas.js'), require('./sp-validate.js'));
  else root.SPPackage = factory(root.SPSchemas, root.SPValidate);
})(typeof self !== 'undefined' ? self : this, function (SPSchemas, SPValidate) {
  'use strict';

  var FORMAT_VERSION_SUPPORTED = 1;
  var MODULE_VERSION_SUPPORTED = 1;
  var TOO_LARGE_MESSAGE = 'PROJECT TOO LARGE FOR THIS VERSION OF DROP';

  /* Implementation limits (NOT schema limits — see SP_SYSTEM_SCHEMA_ISSUES.md S16). */
  var DEFAULT_LIMITS = {
    maxEntries: 2000,
    maxNameBytes: 240,
    maxJsonBytes: 64 * 1024 * 1024,
    maxPackageBytes: 1024 * 1024 * 1024,        /* 1 GiB compressed (whole file)            */
    maxEntryBytes: 1024 * 1024 * 1024,          /* 1 GiB uncompressed per entry             */
    maxTotalBytes: 2 * 1024 * 1024 * 1024,      /* 2 GiB uncompressed in total              */
    maxRatio: 200,                              /* uncompressed:compressed, entries > ratioMinBytes */
    ratioMinBytes: 1024 * 1024,
    memoryBudgetBytes: null                     /* optional: refuse to buffer a single entry bigger than this */
  };

  /* name, default path, schema file, owner, version key */
  var MODULES = {
    chops:        { path: 'project/chops.json',      schema: 'chops.schema.json',        owner: 'sp404-drop',  ver: 'schemaVersion' },
    samples:      { path: 'project/samples.json',    schema: 'samples.schema.json',      owner: 'sp404-drop',  ver: 'schemaVersion' },
    pads:         { path: 'project/pads.json',       schema: 'pads.schema.json',         owner: 'sp404-drop',  ver: 'schemaVersion' },
    loops:        { path: 'project/loops.json',      schema: 'loops.schema.json',        owner: 'sp404-drop',  ver: 'schemaVersion' },
    analysis:     { path: 'analysis/track.json',     schema: 'analysis.schema.json',     owner: 'sp404-learn', ver: 'analysisVersion' },
    recipe:       { path: 'learn/recipe.json',       schema: 'recipe.schema.json',       owner: 'sp404-learn', ver: 'recipeVersion' },
    progress:     { path: 'learn/progress.json',     schema: 'progress.schema.json',     owner: 'sp404-learn', ver: 'progressVersion' },
    requirements: { path: 'learn/requirements.json', schema: 'requirements.schema.json', owner: 'sp404-learn', ver: 'requirementsVersion' }
  };

  var FORBIDDEN_EXT = /\.(exe|dll|so|dylib|bat|cmd|com|scr|msi|sh|bash|zsh|command|app|jar|apk|ipa|ps1|psm1|vbs|vbe|wsf|hta|lnk|pif|reg|cpl|js|mjs|py|pl|rb|php|appimage|dmg|pkg|deb|rpm|swf)$/i;
  var DANGEROUS_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };

  /* ---- small helpers ---------------------------------------------------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes, prev) {
    var c = ~(prev || 0) >>> 0;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (~c) >>> 0;
  }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function put16(a, v) { a.push(v & 255, (v >>> 8) & 255); }
  function put32(a, v) { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }
  function utf8(str) { return new TextEncoder().encode(str); }
  function utf8Strict(bytes) { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  function latin1(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }
  function concat(chunks) {
    var n = 0, i; for (i = 0; i < chunks.length; i++) n += chunks[i].length;
    var out = new Uint8Array(n), o = 0;
    for (i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
    return out;
  }
  function dosTime(date) {
    var y = Math.min(2107, Math.max(1980, date.getFullYear()));
    return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
             date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() };
  }
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ---- sources & codecs ---------------------------------------------------- */
  function fromBytes(u8) {
    return { size: u8.length, read: function (off, len) { return Promise.resolve(u8.subarray(off, off + len)); } };
  }
  function defaultCodecs() {
    if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof require === 'function') {
      var z = require('zlib');
      return {
        inflateRaw: function (u8, maxOut) { return Promise.resolve(new Uint8Array(z.inflateRawSync(u8, { maxOutputLength: Math.max(1, maxOut) }))); },
        deflateRaw: function (u8) { return Promise.resolve(new Uint8Array(z.deflateRawSync(u8, { level: 6 }))); }
      };
    }
    function pipe(Ctor, fmt, u8) {
      var s = new Blob([u8]).stream().pipeThrough(new Ctor(fmt));
      return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    return {
      inflateRaw: function (u8) { return pipe(DecompressionStream, 'deflate-raw', u8); },
      deflateRaw: function (u8) { return pipe(CompressionStream, 'deflate-raw', u8); }
    };
  }

  /* ---- name vetting ---------------------------------------------------- */
  /* Returns an error code or null. Mirrors common.schema.json#relPath plus spec §21 (stricter). */
  function vetName(name, nameBytesLen, limits) {
    if (!name) return 'E_PATH_UNSAFE';
    if (nameBytesLen > limits.maxNameBytes) return 'E_PATH_UNSAFE';
    if (name.charAt(0) === '/') return 'E_PATH_UNSAFE';
    if (/^[A-Za-z]:/.test(name)) return 'E_PATH_UNSAFE';
    if (name.indexOf('\\') >= 0) return 'E_PATH_UNSAFE';
    if (/[\u0000-\u001f\u007f]/.test(name)) return 'E_PATH_UNSAFE';
    var segs = name.replace(/\/$/, '').split('/');
    for (var i = 0; i < segs.length; i++) if (segs[i] === '' || segs[i] === '.' || segs[i] === '..') return 'E_PATH_UNSAFE';
    return null;
  }
  function nameKey(name) { return name.normalize('NFC').toLowerCase(); }
  function isDir(name) { return name.charAt(name.length - 1) === '/'; }

  function sniffAudio(head, ext) {
    if (head.length < 4) return false;
    var s4 = latin1(head.subarray(0, 4));
    if (ext === 'wav' || ext === 'wave') return s4 === 'RIFF' && head.length >= 12 && latin1(head.subarray(8, 12)) === 'WAVE';
    if (ext === 'flac') return s4 === 'fLaC';
    if (ext === 'ogg' || ext === 'oga' || ext === 'opus') return s4 === 'OggS';
    if (ext === 'mp3') return s4.slice(0, 3) === 'ID3' || (head[0] === 0xFF && (head[1] & 0xE0) === 0xE0);
    if (ext === 'm4a' || ext === 'mp4' || ext === 'aac') return head.length >= 8 && latin1(head.subarray(4, 8)) === 'ftyp' || (ext === 'aac' && head[0] === 0xFF);
    if (ext === 'aif' || ext === 'aiff') return s4 === 'FORM';
    return true; /* unknown audio extension: nothing to compare against */
  }
  function looksExecutable(head) {
    if (head.length >= 2 && head[0] === 0x23 && head[1] === 0x21) return true;                       /* #! script */
    if (head.length >= 2 && head[0] === 0x4D && head[1] === 0x5A) return true;                       /* MZ (PE)   */
    if (head.length >= 4 && head[0] === 0x7F && head[1] === 0x45 && head[2] === 0x4C && head[3] === 0x46) return true; /* ELF */
    if (head.length >= 4) {
      var m = u32(head, 0);
      if (m === 0xFEEDFACE || m === 0xFEEDFACF || m === 0xCEFAEDFE || m === 0xCFFAEDFE || m === 0xBEBAFECA || m === 0xCAFEBABE) return true; /* Mach-O / fat */
    }
    return false;
  }

  /* ---- JSON ---------------------------------------------------- */
  function parseJson(bytes) {
    var s = utf8Strict(bytes);
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    return JSON.parse(s);
  }
  /* Returns number of dropped keys; mutates in place. Only used on files DROP rewrites (S20). */
  function stripDangerous(v) {
    var n = 0;
    if (Array.isArray(v)) { v.forEach(function (x) { n += stripDangerous(x); }); }
    else if (v && typeof v === 'object') {
      Object.keys(v).forEach(function (k) {
        if (DANGEROUS_KEYS[k]) { delete v[k]; n++; } else n += stripDangerous(v[k]);
      });
    }
    return n;
  }
  function stringify(obj) { return utf8(JSON.stringify(obj, null, 2) + '\n'); }

  /* ---- reader ---------------------------------------------------- */
  function Issues() { this.list = []; }
  Issues.prototype.add = function (severity, code, message, where) { this.list.push({ severity: severity, code: code, message: message, where: where || null }); };

  function failure(level, code, message, issues, extra) {
    issues.add('error', code, message);
    var r = { level: level, ok: false, code: code, message: message, issues: issues.list, manifest: null, entries: [], modules: {}, fingerprint: null };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  /* open(source, opts) -> Promise<result>
     opts: { codecs, limits, schemas }  (source: {size, read(off,len)->Promise<Uint8Array>}) */
  function open(source, opts) {
    opts = opts || {};
    var limits = {}; var k;
    for (k in DEFAULT_LIMITS) limits[k] = DEFAULT_LIMITS[k];
    if (opts.limits) for (k in opts.limits) limits[k] = opts.limits[k];
    var codecs = opts.codecs || defaultCodecs();
    var schemas = (opts.schemas || SPSchemas.schemas);
    var issues = new Issues();
    var tooLarge = function (what) { return failure('CORRUPTED', 'E_TOO_LARGE', TOO_LARGE_MESSAGE, issues, { detail: what }); };

    var size = source.size;
    if (size > limits.maxPackageBytes) return Promise.resolve(tooLarge('package ' + size + ' bytes'));
    if (size < 22) return Promise.resolve(failure('CORRUPTED', 'E_NOT_ZIP', 'Not a ZIP archive (too small)', issues));

    var tailLen = Math.min(size, 22 + 65535);
    return source.read(size - tailLen, tailLen).then(function (tail) {
      var eocd = -1, i;
      for (i = tail.length - 22; i >= 0; i--) {
        if (tail[i] === 0x50 && tail[i + 1] === 0x4B && tail[i + 2] === 5 && tail[i + 3] === 6) {
          if (i + 22 + u16(tail, i + 20) === tail.length) { eocd = i; break; }
        }
      }
      if (eocd < 0) return failure('CORRUPTED', 'E_NOT_ZIP', 'Not a ZIP archive (no end-of-central-directory record)', issues);
      if (eocd >= 20 && tail[eocd - 20] === 0x50 && tail[eocd - 19] === 0x4B && tail[eocd - 18] === 6 && tail[eocd - 17] === 7)
        return failure('CORRUPTED', 'E_ZIP64', 'ZIP64 archives are not supported', issues);
      var diskNo = u16(tail, eocd + 4), cdDisk = u16(tail, eocd + 6);
      var nThis = u16(tail, eocd + 8), nTotal = u16(tail, eocd + 10);
      var cdSize = u32(tail, eocd + 12), cdOff = u32(tail, eocd + 16);
      if (diskNo || cdDisk || nThis !== nTotal) return failure('CORRUPTED', 'E_NOT_ZIP', 'Multi-disk archives are not supported', issues);
      if (nTotal === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) return failure('CORRUPTED', 'E_ZIP64', 'ZIP64 archives are not supported', issues);
      if (nTotal > limits.maxEntries) return failure('CORRUPTED', 'E_TOO_MANY_ENTRIES', 'Archive has more than ' + limits.maxEntries + ' entries', issues);
      if (cdOff + cdSize > size) return failure('CORRUPTED', 'E_NOT_ZIP', 'Central directory outside the file', issues);
      if (cdSize > 16 * 1024 * 1024) return tooLarge('central directory');
      return source.read(cdOff, cdSize).then(function (cd) {
        if (cd.length !== cdSize) return failure('CORRUPTED', 'E_NOT_ZIP', 'Truncated central directory', issues);
        return parseCentral(cd, nTotal, cdOff, cdSize, size);
      });
    }).then(function (res) { return res; }, function (e) {
      return failure('CORRUPTED', 'E_NOT_ZIP', 'Cannot read archive: ' + (e && e.message), issues);
    });

    function parseCentral(cd, count, cdOff, cdSize, fileSize) {
      var entries = [], byName = {}, byKey = {}, p = 0, total = 0, i;
      for (i = 0; i < count; i++) {
        if (p + 46 > cd.length || u32(cd, p) !== 0x02014b50) return failure('CORRUPTED', 'E_NOT_ZIP', 'Corrupt central directory', issues);
        var flags = u16(cd, p + 8), nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32);
        if (p + 46 + nl + xl + cl > cd.length) return failure('CORRUPTED', 'E_NOT_ZIP', 'Corrupt central directory', issues);
        var nameBytes = cd.slice(p + 46, p + 46 + nl);
        var e = {
          versionMade: u16(cd, p + 4), versionNeeded: u16(cd, p + 6), flags: flags, method: u16(cd, p + 10),
          time: u16(cd, p + 12), date: u16(cd, p + 14), crc: u32(cd, p + 16), csize: u32(cd, p + 20), usize: u32(cd, p + 24),
          diskStart: u16(cd, p + 34), intAttr: u16(cd, p + 36), extAttr: u32(cd, p + 38), localOff: u32(cd, p + 42),
          nameBytes: nameBytes, comment: cd.slice(p + 46 + nl + xl, p + 46 + nl + xl + cl), extra: cd.slice(p + 46 + nl, p + 46 + nl + xl)
        };
        p += 46 + nl + xl + cl;
        if (flags & 1 || flags & 0x40) return failure('CORRUPTED', 'E_ENCRYPTED', 'Encrypted entries are not supported', issues);
        if (e.method !== 0 && e.method !== 8) return failure('CORRUPTED', 'E_NOT_ZIP', 'Unsupported compression method ' + e.method, issues);
        if (e.csize === 0xFFFFFFFF || e.usize === 0xFFFFFFFF || e.localOff === 0xFFFFFFFF) return failure('CORRUPTED', 'E_ZIP64', 'ZIP64 archives are not supported', issues);
        if (e.diskStart) return failure('CORRUPTED', 'E_NOT_ZIP', 'Multi-disk archives are not supported', issues);
        var name;
        if (flags & 0x800) {
          try { name = utf8Strict(nameBytes); } catch (x) { return failure('CORRUPTED', 'E_PATH_UNSAFE', 'Entry name is not valid UTF-8', issues); }
        } else {
          try { name = utf8Strict(nameBytes); } catch (x2) { name = latin1(nameBytes); issues.add('warning', 'W_NAME_ENCODING', 'Entry name is not UTF-8; read as Latin-1', name); }
        }
        e.name = name;
        var bad = vetName(name, nameBytes.length, limits);
        if (bad) return failure('CORRUPTED', bad, 'Unsafe entry name: ' + JSON.stringify(name), issues);
        e.dir = isDir(name);
        var host = e.versionMade >> 8, mode = e.extAttr >>> 16;
        if (host === 3 && (mode & 0xF000) === 0xA000) return failure('CORRUPTED', 'E_SYMLINK', 'Symbolic link entries are not allowed: ' + name, issues);
        if (!e.dir && FORBIDDEN_EXT.test(name)) return failure('CORRUPTED', 'E_FORBIDDEN_TYPE', 'Executable / script file types are not allowed: ' + name, issues);
        if (hasOwn(byName, name)) return failure('CORRUPTED', 'E_DUP_NAME', 'Duplicate entry name: ' + name, issues);
        var key = nameKey(name);
        if (hasOwn(byKey, key)) return failure('CORRUPTED', 'E_CASE_COLLISION', 'Entry names collide on case-insensitive / Unicode-normalised file systems: ' + name, issues);
        if (e.method === 0 && e.csize !== e.usize) return failure('CORRUPTED', 'E_SIZE_MISMATCH', 'Stored entry size mismatch: ' + name, issues);
        if (e.usize > limits.maxEntryBytes) return tooLarge(name + ' ' + e.usize + ' bytes');
        total += e.usize;
        if (total > limits.maxTotalBytes) return tooLarge('total uncompressed ' + total + ' bytes');
        if (e.usize > limits.ratioMinBytes && e.csize > 0 && e.usize / e.csize > limits.maxRatio)
          return failure('CORRUPTED', 'E_RATIO', 'Compression ratio too high (possible zip bomb): ' + name, issues);
        if (e.usize > limits.ratioMinBytes && e.csize === 0) return failure('CORRUPTED', 'E_RATIO', 'Compression ratio too high (possible zip bomb): ' + name, issues);
        byName[name] = e; byKey[key] = e;
        entries.push(e);
      }
      if (p !== cdSize) issues.add('warning', 'W_ZIP_TRAILING', 'Unexpected bytes after the central directory records');
      /* local headers: cross-check + overlap detection */
      return checkLocals(entries, cdOff).then(function (bad2) {
        if (bad2) return failure('CORRUPTED', bad2.code, bad2.message, issues);
        var pkg = new Package(source, entries, byName, codecs, limits, schemas, { cdOff: cdOff, cdSize: cdSize, cdCrc: crc32(cd), fileSize: fileSize });
        return pkg._load(issues);
      });
    }

    function checkLocals(entries, cdOff) {
      var idx = 0;
      function next() {
        if (idx >= entries.length) return Promise.resolve(null);
        var e = entries[idx++];
        return source.read(e.localOff, 30).then(function (h) {
          if (h.length < 30 || u32(h, 0) !== 0x04034b50) return { code: 'E_NOT_ZIP', message: 'Bad local header for ' + e.name };
          var nl = u16(h, 26), xl = u16(h, 28);
          return source.read(e.localOff + 30, nl).then(function (nb) {
            if (nb.length !== e.nameBytes.length || latin1(nb) !== latin1(e.nameBytes))
              return { code: 'E_NOT_ZIP', message: 'Local header name does not match central directory: ' + e.name };
            e.dataStart = e.localOff + 30 + nl + xl;
            e.dataEnd = e.dataStart + e.csize;
            if (e.dataEnd > cdOff) return { code: 'E_NOT_ZIP', message: 'Entry data overlaps the central directory: ' + e.name };
            return next();
          });
        });
      }
      return next().then(function (bad) {
        if (bad) return bad;
        var sorted = entries.slice().sort(function (a, b) { return a.localOff - b.localOff; });
        for (var j = 1; j < sorted.length; j++)
          if (sorted[j].localOff < sorted[j - 1].dataEnd) return { code: 'E_NOT_ZIP', message: 'Overlapping entries: ' + sorted[j - 1].name + ' / ' + sorted[j].name };
        return null;
      });
    }
  }

  /* ---- Package (opened archive) ---------------------------------------------------- */
  function Package(source, entries, byName, codecs, limits, schemas, cdInfo) {
    this._source = source; this.entries = entries; this._byName = byName; this._codecs = codecs;
    this.limits = limits; this._schemas = schemas; this._cd = cdInfo;
  }
  Package.prototype.entry = function (name) { return hasOwn(this._byName, name) ? this._byName[name] : null; };
  Package.prototype.has = function (name) { return !!this.entry(name); };

  /* raw (still compressed) bytes, for copy-through */
  Package.prototype.readRaw = function (e) {
    return this._source.read(e.dataStart, e.csize).then(function (b) {
      if (b.length !== e.csize) throw new Error('truncated entry ' + e.name);
      return b;
    });
  };
  function budgetError(pkg, e) {
    var b = pkg.limits.memoryBudgetBytes;
    if (b && e.usize > b) { var er = new Error(TOO_LARGE_MESSAGE); er.code = 'E_TOO_LARGE'; return er; }
    return null;
  }
  /* uncompressed bytes, bounded and CRC-verified */
  Package.prototype.read = function (name, opts) {
    var self = this, e = typeof name === 'string' ? this.entry(name) : name;
    if (!e) return Promise.reject(Object.assign(new Error('no such entry: ' + name), { code: 'E_NO_ENTRY' }));
    var cap = (opts && opts.maxBytes) || Infinity;
    if (e.usize > cap) return Promise.reject(Object.assign(new Error('entry too large: ' + e.name), { code: 'E_TOO_LARGE' }));
    var be = budgetError(this, e); if (be) return Promise.reject(be);
    return this.readRaw(e).then(function (raw) {
      if (e.method === 0) return raw;
      return new Promise(function (res) { res(self._codecs.inflateRaw(raw, e.usize)); }).then(function (u) {
        if (u.length > e.usize) throw Object.assign(new Error('entry inflates past its declared size: ' + e.name), { code: 'E_SIZE_MISMATCH' });
        return u;
      }, function (er) {
        throw Object.assign(new Error('cannot inflate ' + e.name + ': ' + (er && er.message)), { code: er && er.code === 'ERR_BUFFER_TOO_LARGE' ? 'E_SIZE_MISMATCH' : 'E_NOT_ZIP' });
      });
    }).then(function (data) {
      if (data.length !== e.usize) throw Object.assign(new Error('size mismatch: ' + e.name), { code: 'E_SIZE_MISMATCH' });
      if (crc32(data) !== e.crc) throw Object.assign(new Error('CRC mismatch: ' + e.name), { code: 'E_CRC' });
      return data;
    });
  };
  Package.prototype.readJson = function (name) {
    var e = this.entry(name);
    if (e && e.usize > this.limits.maxJsonBytes) return Promise.reject(Object.assign(new Error('JSON too large: ' + name), { code: 'E_TOO_LARGE' }));
    return this.read(name, { maxBytes: this.limits.maxJsonBytes }).then(function (b) { return { bytes: b, json: parseJson(b) }; });
  };
  /* first n bytes without needing the whole entry when possible */
  Package.prototype._head = function (e, n) {
    var self = this;
    if (e.usize === 0) return Promise.resolve(new Uint8Array(0));
    if (e.method === 0) return this._source.read(e.dataStart, Math.min(n, e.usize));
    if (e.csize > 8 * 1024 * 1024) return Promise.resolve(null);
    return this.read(e).then(function (b) { return b.subarray(0, n); }, function () { return null; });
  };
  Package.prototype.fingerprint = function () {
    return { size: this._cd.fileSize, cdCrc: this._cd.cdCrc, cdSize: this._cd.cdSize, entries: this.entries.length };
  };

  /* Populates modules, manifest, issues, level */
  Package.prototype._load = function (issues) {
    var self = this, schemas = this._schemas;
    var mEntry = this.entry('manifest.json');
    if (!mEntry) return failure('CORRUPTED', 'E_NO_MANIFEST', 'manifest.json is missing', issues);
    return this.readJson('manifest.json').then(function (m) {
      var manifest = m.json;
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return failure('CORRUPTED', 'E_MANIFEST_INVALID', 'manifest.json is not an object', issues);
      if (manifest.format !== 'sp-system') return failure('CORRUPTED', 'E_MANIFEST_INVALID', 'manifest.format is not "sp-system"', issues);
      if (typeof manifest.formatVersion === 'number' && manifest.formatVersion > FORMAT_VERSION_SUPPORTED)
        return failure('UNSUPPORTED_VERSION', 'E_UNSUPPORTED_VERSION', 'This package uses formatVersion ' + manifest.formatVersion + '; this version of DROP supports ' + FORMAT_VERSION_SUPPORTED, issues, { manifest: manifest });
      var dropped = stripDangerous(manifest);
      if (dropped) issues.add('warning', 'W_PROTO_KEY_DROPPED', dropped + ' unsafe key(s) removed from manifest.json', 'manifest.json');
      var errs = SPValidate.validate(schemas, 'manifest.schema.json', manifest);
      if (errs.length) {
        errs.slice(0, 20).forEach(function (er) { issues.add('error', 'E_MANIFEST_INVALID', 'manifest' + er.path + ': ' + er.message, 'manifest.json'); });
        return { level: 'CORRUPTED', ok: false, code: 'E_MANIFEST_INVALID', message: 'manifest.json does not match the schema', issues: issues.list, manifest: null, entries: [], modules: {}, fingerprint: null };
      }
      return self._loadModules(manifest, m.bytes, issues);
    }, function (e) {
      return failure('CORRUPTED', e.code === 'E_TOO_LARGE' ? 'E_TOO_LARGE' : (e.code === 'E_CRC' ? 'E_CRC' : 'E_MANIFEST_INVALID'),
        e.code === 'E_TOO_LARGE' ? TOO_LARGE_MESSAGE : 'manifest.json cannot be read: ' + e.message, issues);
    });
  };

  Package.prototype._loadModules = function (manifest, manifestBytes, issues) {
    var self = this, schemas = this._schemas, names = Object.keys(MODULES), modules = {}, unsupported = false;
    var declared = manifest.modules || {};
    var work = names.map(function (n) {
      var def = MODULES[n];
      var decl = hasOwn(declared, n) && declared[n] && typeof declared[n] === 'object' ? declared[n] : null;
      var path = decl && typeof decl.path === 'string' ? decl.path : def.path;
      var mod = { name: n, path: path, owner: def.owner, status: 'absent', data: null, raw: null, schemaFile: def.schema };
      modules[n] = mod;
      var e = self.entry(path);
      if (!e) {
        if (decl) issues.add('warning', 'W_MISSING_FILE', 'manifest lists module "' + n + '" at ' + path + ' but the file is missing', path);
        return Promise.resolve();
      }
      mod.entry = e;
      return self.readJson(path).then(function (r) {
        mod.raw = r.bytes; mod.data = r.json;
        var ver = r.json && typeof r.json === 'object' ? r.json[def.ver] : undefined;
        if (typeof ver === 'number' && ver > MODULE_VERSION_SUPPORTED) {
          mod.status = 'newer';
          if (def.owner === 'sp404-drop') { unsupported = true; issues.add('error', 'E_UNSUPPORTED_VERSION', path + ' uses ' + def.ver + ' ' + ver + '; supported: ' + MODULE_VERSION_SUPPORTED, path); }
          else issues.add('warning', 'W_MODULE_NEWER', path + ' is from a newer version (' + ver + '); preserved untouched', path);
          return;
        }
        var errs = SPValidate.validate(schemas, def.schema, r.json);
        if (errs.length) {
          mod.status = 'invalid'; mod.errors = errs;
          issues.add('warning', 'W_MODULE_INVALID', path + ' does not match its schema (' + errs[0].path + ': ' + errs[0].message + '); kept read-only and byte-identical', path);
          return;
        }
        mod.status = 'ok';
        if (def.owner === 'sp404-drop') {
          var d = stripDangerous(r.json);
          if (d) { mod.dropped = d; issues.add('warning', 'W_PROTO_KEY_DROPPED', d + ' unsafe key(s) removed from ' + path, path); }
        }
      }, function (er) {
        mod.status = 'invalid'; mod.errors = [{ path: '/', message: er.message }];
        if (er.code === 'E_TOO_LARGE') { issues.add('error', 'E_TOO_LARGE', TOO_LARGE_MESSAGE, path); mod.fatal = true; }
        else issues.add('warning', 'W_MODULE_INVALID', path + ' cannot be parsed (' + er.message + '); kept read-only and byte-identical', path);
      });
    });
    return Promise.all(work).then(function () {
      var fatal = names.some(function (n) { return modules[n].fatal; });
      if (fatal) return { level: 'CORRUPTED', ok: false, code: 'E_TOO_LARGE', message: TOO_LARGE_MESSAGE, issues: issues.list, manifest: null, entries: [], modules: {}, fingerprint: null };
      var known = {}; names.forEach(function (n) { known[modules[n].path] = 1; });
      self.entries.forEach(function (e) {
        if (e.dir || e.name === 'manifest.json' || known[e.name]) return;
        if (e.name.indexOf('samples/') === 0 || e.name.indexOf('audio/') === 0) return;
        issues.add('warning', 'W_UNKNOWN_FILE', 'Unknown file preserved untouched: ' + e.name, e.name);
      });
      return self._semantic(manifest, modules, issues).then(function () {
        return self._sniff(manifest, issues);
      }).then(function (bad) {
        if (bad) return { level: 'CORRUPTED', ok: false, code: bad.code, message: bad.message, issues: issues.list, manifest: null, entries: [], modules: {}, fingerprint: null };
        var level = unsupported ? 'UNSUPPORTED_VERSION' : issues.list.some(function (i) { return i.severity === 'warning'; }) ? 'VALID_WITH_WARNINGS' : 'VALID';
        return { level: level, ok: !unsupported, code: unsupported ? 'E_UNSUPPORTED_VERSION' : null, issues: issues.list,
                 package: self, manifest: manifest, manifestRaw: manifestBytes, modules: modules, entries: self.entries, fingerprint: self.fingerprint() };
      });
    });
  };

  /* cross-file consistency: warnings only (data is kept as is) */
  Package.prototype._semantic = function (manifest, modules, issues) {
    var self = this;
    function ok(n) { return modules[n] && modules[n].status === 'ok' ? modules[n].data : null; }
    function dupIds(list, label, path) {
      var seen = {};
      list.forEach(function (x) {
        if (!x || typeof x.id !== 'string') return;
        if (seen[x.id]) issues.add('warning', 'W_DUP_ID', 'duplicate ' + label + ' id "' + x.id + '"', path);
        seen[x.id] = 1;
      });
    }
    var chops = ok('chops'), samples = ok('samples'), pads = ok('pads'), loops = ok('loops'), analysis = ok('analysis');
    var chopIds = {}, sampleIds = {};
    if (chops) {
      dupIds(chops.chops, 'chop', modules.chops.path);
      chops.chops.forEach(function (c) {
        chopIds[c.id] = 1;
        if (!(c.endSeconds > c.startSeconds)) issues.add('warning', 'W_BAD_RANGE', 'chop "' + c.id + '" has end <= start', modules.chops.path);
      });
    }
    if (loops) {
      dupIds(loops.loops, 'loop', modules.loops.path);
      loops.loops.forEach(function (l) { if (!(l.endSeconds > l.startSeconds)) issues.add('warning', 'W_BAD_RANGE', 'loop "' + l.id + '" has end <= start', modules.loops.path); });
    }
    if (samples) {
      dupIds(samples.samples, 'sample', modules.samples.path);
      samples.samples.forEach(function (s) {
        sampleIds[s.id] = 1;
        if (!self.entry(s.file)) issues.add('warning', 'W_MISSING_FILE', 'sample "' + s.id + '" refers to missing file ' + s.file, modules.samples.path);
        if (chops && s.sourceChopId && !chopIds[s.sourceChopId]) issues.add('warning', 'W_DANGLING_REF', 'sample "' + s.id + '" refers to unknown chop "' + s.sourceChopId + '"', modules.samples.path);
      });
    }
    if (pads && samples) {
      var slots = {};
      pads.assignments.forEach(function (a) {
        var k = a.bank + ':' + a.pad;
        if (slots[k]) issues.add('warning', 'W_DUP_PAD', 'pad ' + k + ' is assigned more than once', modules.pads.path);
        slots[k] = 1;
        if (a.sampleId && !sampleIds[a.sampleId]) issues.add('warning', 'W_DANGLING_REF', 'pad ' + k + ' refers to unknown sample "' + a.sampleId + '"', modules.pads.path);
      });
    }
    var src = manifest.source;
    if (src && src.mode === 'portable') {
      if (!src.audio || !self.entry(src.audio)) issues.add('warning', 'W_MISSING_FILE', 'source.mode is portable but the audio file is missing', src.audio || 'manifest.json');
    }
    if (analysis && src && typeof src.sha256 === 'string' && typeof analysis.audioSha256 === 'string') {
      var n = Math.min(src.sha256.length, analysis.audioSha256.length);
      if (src.sha256.slice(0, n) !== analysis.audioSha256.slice(0, n)) issues.add('warning', 'W_STALE_ANALYSIS', 'analysis/track.json describes different audio than the source (stale analysis, kept)', modules.analysis.path);
    }
    if (src && src.mode === 'lightweight' && !(src.externalSource && src.externalSource.path)) issues.add('warning', 'W_SOURCE_MOVED', 'source.mode is lightweight but externalSource.path is missing', 'manifest.json');
    return Promise.resolve();
  };

  /* content sniffing: audio entries must look like their extension; nothing may look executable */
  Package.prototype._sniff = function (manifest, issues) {
    var self = this, list = this.entries.filter(function (e) { return !e.dir && e.usize > 0 && (e.name.indexOf('samples/') === 0 || e.name.indexOf('audio/') === 0); });
    var i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve(null);
      var e = list[i++];
      return self._head(e, 16).then(function (h) {
        if (!h) return next();
        if (looksExecutable(h)) return { code: 'E_FORBIDDEN_TYPE', message: 'Entry looks like an executable: ' + e.name };
        var m = /\.([A-Za-z0-9]+)$/.exec(e.name), ext = m ? m[1].toLowerCase() : '';
        if (!sniffAudio(h, ext)) return { code: 'E_SNIFF_MISMATCH', message: 'Entry content does not match its extension: ' + e.name };
        return next();
      });
    }
    return next();
  };

  /* verify the portable source against manifest.source.sha256 (streaming-free; bounded by limits) */
  Package.prototype.sourceBytes = function (manifest) {
    var a = manifest.source && manifest.source.audio;
    return a && this.entry(a) ? this.read(a) : Promise.resolve(null);
  };

  /* ---- writer ---------------------------------------------------- */
  function memorySink() {
    var chunks = [];
    return { write: function (u8) { chunks.push(u8); return Promise.resolve(); }, bytes: function () { return concat(chunks); } };
  }

  /* assemble(pkgOrNull, plan, sink, opts) -> Promise<{entries:[{name,crc,usize,csize,method,raw}], size}>
     plan: { replace: {name: Uint8Array}, add: {name: Uint8Array}, remove: [names] }
     Existing entries not replaced/removed are copied raw. manifest.json first. */
  function assemble(pkg, plan, sink, opts) {
    opts = opts || {};
    plan = plan || {};
    var codecs = opts.codecs || (pkg && pkg._codecs) || defaultCodecs();
    var now = opts.now ? new Date(opts.now) : new Date();
    var dt = dosTime(now);
    var replace = plan.replace || {}, add = plan.add || {}, remove = {};
    (plan.remove || []).forEach(function (n) { remove[n] = 1; });
    var jobs = [], seen = {};

    function pushNew(name, data) {
      var bad = vetName(name, utf8(name).length, DEFAULT_LIMITS);
      if (bad || (FORBIDDEN_EXT.test(name))) throw Object.assign(new Error('refusing to write unsafe entry name: ' + name), { code: 'E_PATH_UNSAFE' });
      jobs.push({ kind: 'new', name: name, data: data });
    }
    if (hasOwn(replace, 'manifest.json') || hasOwn(add, 'manifest.json')) {
      pushNew('manifest.json', hasOwn(replace, 'manifest.json') ? replace['manifest.json'] : add['manifest.json']);
      seen['manifest.json'] = 1;
    } else if (pkg && pkg.entry('manifest.json')) {
      jobs.push({ kind: 'raw', entry: pkg.entry('manifest.json') }); seen['manifest.json'] = 1;
    } else throw new Error('assemble: a manifest.json is required');
    if (pkg) pkg.entries.forEach(function (e) {
      if (seen[e.name] || remove[e.name]) return;
      seen[e.name] = 1;
      if (hasOwn(replace, e.name)) pushNew(e.name, replace[e.name]);
      else jobs.push({ kind: 'raw', entry: e });
    });
    Object.keys(replace).concat(Object.keys(add)).forEach(function (n) {
      if (seen[n]) return; seen[n] = 1;
      pushNew(n, hasOwn(replace, n) ? replace[n] : add[n]);
    });

    var offset = 0, central = [], out = [];
    function emit(u8) { offset += u8.length; return Promise.resolve(sink.write(u8)); }

    function entryRecord(j, hdr) { /* hdr: {name bytes, flags, method, time,date, crc, csize, usize, versionMade, extAttr, comment, versionNeeded} */
      var a = [];
      put32(a, 0x04034b50); put16(a, hdr.versionNeeded); put16(a, hdr.flags); put16(a, hdr.method);
      put16(a, hdr.time); put16(a, hdr.date); put32(a, hdr.crc); put32(a, hdr.csize); put32(a, hdr.usize);
      put16(a, hdr.nameBytes.length); put16(a, 0);
      var head = concat([new Uint8Array(a), hdr.nameBytes]);
      central.push({ hdr: hdr, off: offset });
      return head;
    }
    function step(i) {
      if (i >= jobs.length) return Promise.resolve();
      var j = jobs[i], p;
      if (j.kind === 'raw') {
        var e = j.entry;
        p = pkg.readRaw(e).then(function (raw) {
          var hdr = { nameBytes: e.nameBytes, flags: e.flags & ~8, method: e.method, time: e.time, date: e.date, crc: e.crc, csize: e.csize, usize: e.usize,
                      versionMade: e.versionMade, versionNeeded: e.versionNeeded, extAttr: e.extAttr, intAttr: e.intAttr, comment: e.comment, raw: true };
          return emit(entryRecord(j, hdr)).then(function () { return emit(raw); });
        });
      } else {
        var data = j.data, crc = crc32(data), want = opts.deflate && data.length > 64 && !/\.(wav|flac|mp3|ogg|m4a|aiff?)$/i.test(j.name);
        p = (want ? Promise.resolve(codecs.deflateRaw(data)) : Promise.resolve(null)).then(function (def) {
          var useDef = def && def.length < data.length, body = useDef ? def : data;
          var nb = utf8(j.name);
          var ascii = /^[\x20-\x7e]*$/.test(j.name);
          var hdr = { nameBytes: nb, flags: ascii ? 0 : 0x800, method: useDef ? 8 : 0, time: dt.time, date: dt.date, crc: crc, csize: body.length, usize: data.length,
                      versionMade: (3 << 8) | 20, versionNeeded: 20, extAttr: ((0o100644) << 16) >>> 0, intAttr: 0, comment: new Uint8Array(0) };
          return emit(entryRecord(j, hdr)).then(function () { return emit(body); });
        });
      }
      return p.then(function () { return step(i + 1); });
    }
    return step(0).then(function () {
      var cdStart = offset, cdBytes = [];
      central.forEach(function (c) {
        var h = c.hdr, a = [];
        put32(a, 0x02014b50); put16(a, h.versionMade); put16(a, h.versionNeeded); put16(a, h.flags); put16(a, h.method);
        put16(a, h.time); put16(a, h.date); put32(a, h.crc); put32(a, h.csize); put32(a, h.usize);
        put16(a, h.nameBytes.length); put16(a, 0); put16(a, h.comment.length); put16(a, 0); put16(a, h.intAttr || 0); put32(a, h.extAttr || 0); put32(a, c.off);
        cdBytes.push(concat([new Uint8Array(a), h.nameBytes, h.comment]));
      });
      var cd = concat(cdBytes), e2 = [];
      put32(e2, 0x06054b50); put16(e2, 0); put16(e2, 0); put16(e2, central.length); put16(e2, central.length); put32(e2, cd.length); put32(e2, cdStart); put16(e2, 0);
      return emit(cd).then(function () { return emit(new Uint8Array(e2)); }).then(function () {
        return { size: offset, entries: central.map(function (c) { return { name: decodeName(c.hdr), crc: c.hdr.crc, usize: c.hdr.usize, csize: c.hdr.csize, method: c.hdr.method, raw: !!c.hdr.raw }; }) };
      });
    });
  }
  function decodeName(h) { try { return utf8Strict(h.nameBytes); } catch (e) { return latin1(h.nameBytes); } }

  return {
    FORMAT_VERSION_SUPPORTED: FORMAT_VERSION_SUPPORTED, MODULE_VERSION_SUPPORTED: MODULE_VERSION_SUPPORTED,
    TOO_LARGE_MESSAGE: TOO_LARGE_MESSAGE, DEFAULT_LIMITS: DEFAULT_LIMITS, MODULES: MODULES,
    open: open, assemble: assemble, fromBytes: fromBytes, memorySink: memorySink, defaultCodecs: defaultCodecs,
    crc32: crc32, stringify: stringify, parseJson: parseJson, vetName: function (n) { return vetName(n, utf8(n).length, DEFAULT_LIMITS); },
    concat: concat, stripDangerous: stripDangerous
  };
});
