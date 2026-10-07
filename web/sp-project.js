/* SP SYSTEM — DROP's project model for .spsystem packages (pure data layer, no DOM, no file system).

   Pipeline kept as four distinct states (never conflated):
     candidate (analysis/track.json, LEARN-owned)  ->  confirmed region (project/chops.json | loops.json)
       ->  rendered sample (samples/*.wav + project/samples.json)  ->  pad assignment (project/pads.json).
   Canonical chain: PAD -> sampleId -> sample -> sourceChopId -> chop.

   Rules enforced here (spec §Merge, owner decisions D1–D9):
   - DROP edits only its own modules, in place on the parsed JSON, so unknown fields survive.
   - LEARN-owned files, unknown files, and DROP-owned modules that are invalid/newer are never rewritten
     (the package writer copies them through byte-for-byte).
   - Stable ids come from per-collection high-water counters and are never reused or regenerated.
   - User data wins over derived state: existing pads/chop objects are left as they are.
   - Chops are independent time regions (gaps, overlaps, nesting, any order, any length are legal). If the
     DROP chop editor (markers = a contiguous partition) cannot represent them, the project is LIMITED:
     the data is shown/kept as is and chop edits through markers are refused, never normalised. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sp-package.js'), require('./sp-core.js'), require('./sp-validate.js'), require('./sp-schemas.js'));
  else root.SPProject = factory(root.SPPackage, root.SPCore, root.SPValidate, root.SPSchemas);
})(typeof self !== 'undefined' ? self : this, function (SPPackage, SPCore, SPValidate, SPSchemas) {
  'use strict';

  var APP = 'sp404-drop';
  var EXT_KEY = 'x-sp404-drop';
  var EPS = 1e-6;                       /* region identity tolerance: 1 microsecond */
  var COLLECTIONS = { chop: 'chops', sample: 'samples', loop: 'loops' };
  var PREFIX = { chop: 'chop', sample: 'sample', loop: 'loop' };
  var DROP_MODULES = ['chops', 'samples', 'pads', 'loops'];

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function iso(now) { return new Date(now || Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function uuid4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else if (typeof require === 'function') b = new Uint8Array(require('crypto').randomBytes(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function sha256(u8) {
    if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof require === 'function')
      return Promise.resolve(require('crypto').createHash('sha256').update(u8).digest('hex'));
    return crypto.subtle.digest('SHA-256', u8).then(hex);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function same(a, b) { return Math.abs(a - b) <= EPS; }

  /* ---- WAV header -> sample metadata ---------------------------------------------------- */
  function wavInfo(u8) {
    if (u8.length < 44 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'RIFF' || String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) !== 'WAVE') return null;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), p = 12, fmt = null, dataSize = null;
    while (p + 8 <= u8.length) {
      var id = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]), sz = dv.getUint32(p + 4, true);
      if (id === 'fmt ' && sz >= 16) fmt = { format: dv.getUint16(p + 8, true), channels: dv.getUint16(p + 10, true), sampleRate: dv.getUint32(p + 12, true), bits: dv.getUint16(p + 22, true) };
      else if (id === 'data') { dataSize = Math.min(sz, u8.length - (p + 8)); break; }
      p += 8 + sz + (sz & 1);
    }
    if (!fmt || dataSize === null || !fmt.channels || !fmt.sampleRate || !fmt.bits) return null;
    return { sampleRate: fmt.sampleRate, channels: fmt.channels, bitDepth: fmt.bits, float: fmt.format === 3,
             durationSeconds: dataSize / (fmt.sampleRate * fmt.channels * (fmt.bits / 8)) };
  }
  function round6(x) { return Math.round(x * 1e6) / 1e6; }

  /* ---- Project ---------------------------------------------------- */
  function Project(manifest, modules) {
    this.manifest = manifest;
    this.modules = modules;               /* name -> {name,path,status,data,raw,dirty,...} */
    this.pkg = null;                      /* opened Package this was loaded from (null for a new project) */
    this.baseRevision = null;             /* revision on disk when opened (null: never saved) */
    this.baseFingerprint = null;
    this.newFiles = {};                   /* entry name -> Uint8Array (audio/source.*, samples/*.wav) */
    this.removeFiles = [];
    this.manifestDirty = true;
    this.issues = [];
    this.level = 'VALID';
  }
  function dropExt(m) {
    if (!m.extensions || typeof m.extensions !== 'object') m.extensions = {};
    if (!m.extensions[EXT_KEY] || typeof m.extensions[EXT_KEY] !== 'object') m.extensions[EXT_KEY] = {};
    return m.extensions[EXT_KEY];
  }
  Project.prototype._ext = function () { this.manifestDirty = true; return dropExt(this.manifest); };

  function emptyModule(name, def) {
    var key = name === 'chops' ? 'chops' : name;
    var data = { schemaVersion: 1 };
    data[key === 'pads' ? 'assignments' : key] = [];
    return { name: name, path: def.path, status: 'ok', data: data, raw: null, dirty: true, created: true, owner: def.owner };
  }

  /* create(opts) -> Project (new, in memory)
     opts: { title, filename, durationSeconds, sampleRate, channels, mode: portable|lightweight|none,
             audio: Uint8Array (portable), audioExt, sha256 (hex of source), externalSource: {path,hash,sizeBytes},
             now, version, id } */
  function create(opts) {
    opts = opts || {};
    var now = iso(opts.now);
    var m = { format: 'sp-system', formatVersion: SPPackage.FORMAT_VERSION_SUPPORTED, id: opts.id || uuid4(),
              createdBy: APP, createdByVersion: opts.version || '', createdAt: now, modifiedAt: now, modifiedBy: APP, modifiedByVersion: opts.version || '',
              revision: 0 };
    if (!m.createdByVersion) { delete m.createdByVersion; delete m.modifiedByVersion; }
    if (opts.title) m.title = opts.title;
    var mods = {};
    DROP_MODULES.forEach(function (n) { mods[n] = emptyModule(n, SPPackage.MODULES[n]); });
    ['analysis', 'recipe', 'progress', 'requirements'].forEach(function (n) { mods[n] = { name: n, path: SPPackage.MODULES[n].path, status: 'absent', data: null, raw: null, owner: SPPackage.MODULES[n].owner }; });
    var p = new Project(m, mods);
    p.setSource(opts);
    return p;
  }

  /* ---- source (three modes) ---------------------------------------------------- */
  Project.prototype.setSource = function (o) {
    var mode = o.mode || 'portable';
    if (mode !== 'portable' && mode !== 'lightweight' && mode !== 'none') throw new Error('unknown source mode: ' + mode);
    var src = {};
    if (o.title || this.manifest.title) src.title = o.title || this.manifest.title;
    if (o.filename) src.originalFilename = o.filename;
    if (typeof o.durationSeconds === 'number') src.durationSeconds = round6(o.durationSeconds);
    if (o.sampleRate) src.sampleRate = o.sampleRate;
    if (o.channels) src.channels = o.channels;
    src.mode = mode;
    if (mode === 'portable') {
      var ext = String(o.audioExt || (o.filename && /\.([A-Za-z0-9]+)$/.exec(o.filename) ? /\.([A-Za-z0-9]+)$/.exec(o.filename)[1] : 'wav')).toLowerCase();
      var name = 'audio/source.' + ext;
      if (o.audio) { this.newFiles[name] = o.audio; }
      src.audio = name;
      if (o.sha256) src.sha256 = o.sha256;
    } else if (mode === 'lightweight') {
      if (!o.externalSource || !o.externalSource.path || !o.externalSource.hash) throw new Error('lightweight source needs externalSource {path, hash}');
      src.externalSource = clone(o.externalSource);
      if (!src.externalSource.lastSeenAt) src.externalSource.lastSeenAt = iso(o.now);
      if (o.sha256) src.sha256 = o.sha256;
    }
    /* keep unknown fields of an existing source block */
    var prev = this.manifest.source;
    if (prev && typeof prev === 'object') Object.keys(prev).forEach(function (k) { if (!hasOwn(src, k) && ['audio', 'externalSource', 'sha256', 'mode'].indexOf(k) < 0) src[k] = prev[k]; });
    this.manifest.source = src;
    this.manifestDirty = true;
  };
  /* where chops/loops point: only meaningful for portable (S6) */
  Project.prototype._sourceRef = function () {
    var s = this.manifest.source;
    return s && s.mode === 'portable' && s.audio ? s.audio : null;
  };

  /* ---- helpers on modules ---------------------------------------------------- */
  Project.prototype.isReadOnly = function (name) {
    var m = this.modules[name];
    /* LEARN-owned modules (analysis, recipe, progress, requirements) are never edited by DROP, whatever their state */
    return !m || m.owner !== APP || (m.status !== 'ok' && m.status !== 'absent');
  };
  Project.prototype._mod = function (name) {
    var m = this.modules[name];
    if (this.isReadOnly(name)) { var e = new Error('module "' + name + '" is read-only (invalid or from a newer version)'); e.code = 'E_READONLY_MODULE'; throw e; }
    if (m.status === 'absent') { var fresh = emptyModule(name, SPPackage.MODULES[name]); fresh.owner = m.owner; this.modules[name] = fresh; m = fresh; }
    m.dirty = true;
    return m;
  };
  function listOf(mod, key) { return mod && mod.data && Array.isArray(mod.data[key]) ? mod.data[key] : []; }
  Project.prototype.list = function (name) {
    var key = name === 'pads' ? 'assignments' : name;
    return listOf(this.modules[name], key);
  };

  /* ---- stable ids (S23: high-water counters, never reused) ---------------------------------------------------- */
  Project.prototype._counter = function (kind) {
    var ids = dropExt(this.manifest).ids;
    var stored = ids && typeof ids[kind] === 'number' ? ids[kind] : 0;
    var re = new RegExp('^' + PREFIX[kind] + '-(\\d+)$'), hi = stored;
    this.list(COLLECTIONS[kind]).forEach(function (x) {
      var m = x && typeof x.id === 'string' ? re.exec(x.id) : null;
      if (m) hi = Math.max(hi, parseInt(m[1], 10));
    });
    if (kind === 'chop') {                                  /* ids kept alive by samples/candidates still count */
      this.list('samples').forEach(function (s) { var m = s && s.sourceChopId ? re.exec(s.sourceChopId) : null; if (m) hi = Math.max(hi, parseInt(m[1], 10)); });
    }
    return hi;
  };
  Project.prototype.allocId = function (kind) {
    var n = this._counter(kind) + 1, ext = this._ext();
    if (!ext.ids || typeof ext.ids !== 'object') ext.ids = {};
    ext.ids[kind] = n;
    return PREFIX[kind] + '-' + (n < 10 ? '0' : '') + n;
  };

  /* ---- chops <-> markers ---------------------------------------------------- */
  /* chopTypeFor: DROP chop modes -> canonical type (+ method for Equal, D4/S1) */
  function typeFor(mode) {
    if (mode === 'equal') return { type: 'manual', method: 'equal' };
    if (mode === 'transient' || mode === 'beat' || mode === 'manual') return { type: mode };
    return { type: 'manual' };
  }
  function regionsFromMarkers(markers, duration) {
    var t = markers.map(function (m) { return m.time; }).filter(function (x) { return x > EPS && x < duration - EPS; }).sort(function (a, b) { return a - b; });
    var pts = [0].concat(t, [duration]), out = [];
    for (var i = 0; i < pts.length - 1; i++) if (pts[i + 1] - pts[i] > EPS) out.push({ startSeconds: round6(pts[i]), endSeconds: round6(pts[i + 1]) });
    return out;
  }

  /* representable(durationSeconds) -> {ok, reason, markers}
     The DROP editor models chops as marker positions = a contiguous, ordered partition of [0, duration]. */
  Project.prototype.chopsRepresentable = function (duration) {
    var chops = this.list('chops');
    if (this.isReadOnly('chops')) return { ok: false, reason: 'module-read-only' };
    if (!chops.length) return { ok: true, markers: [] };
    var prevEnd = 0;
    for (var i = 0; i < chops.length; i++) {
      var c = chops[i];
      if (!same(c.startSeconds, prevEnd)) return { ok: false, reason: i === 0 && c.startSeconds > prevEnd ? 'gap-at-start' : (c.startSeconds < prevEnd ? 'overlap-or-out-of-order' : 'gap') };
      if (!(c.endSeconds > c.startSeconds)) return { ok: false, reason: 'empty-region' };
      prevEnd = c.endSeconds;
    }
    if (typeof duration === 'number' && !same(prevEnd, duration)) return { ok: false, reason: 'does-not-cover-source' };
    var markers = chops.slice(0, -1).map(function (c) { return c.endSeconds; });
    return { ok: true, markers: markers };
  };
  Project.prototype.isLimited = function (duration) {
    var r = this.chopsRepresentable(duration);
    return !r.ok && this.list('chops').length > 0;
  };

  /* syncChopsFromMarkers(markers, duration, {mode}) -> {ok, added, removed, kept} | {ok:false, code}
     Existing chop objects whose region is unchanged are kept untouched (id, name, extra fields, createdAt…). */
  Project.prototype.syncChopsFromMarkers = function (markers, duration, o) {
    o = o || {};
    var rep = this.chopsRepresentable(duration);
    if (!rep.ok && this.list('chops').length) return { ok: false, code: 'E_LIMITED_EDITING', reason: rep.reason };
    var regions = regionsFromMarkers(markers, duration), mod = this._mod('chops'), old = mod.data.chops;
    var self = this, kept = 0, added = 0, used = {}, tf = typeFor(o.mode), ref = this._sourceRef(), now = iso(o.now);
    var next = regions.map(function (r) {
      for (var i = 0; i < old.length; i++) {
        if (!used[i] && same(old[i].startSeconds, r.startSeconds) && same(old[i].endSeconds, r.endSeconds)) { used[i] = 1; kept++; return old[i]; }
      }
      added++;
      var c = { id: self.allocId('chop'), name: o.namePrefix ? o.namePrefix + ' ' + (next_index(regions, r)) : undefined, startSeconds: r.startSeconds, endSeconds: r.endSeconds, type: tf.type };
      if (!c.name) delete c.name;
      if (ref) c.source = ref;
      if (self.manifest.source && self.manifest.source.sha256) c.sourceSha256 = self.manifest.source.sha256;
      if (tf.method) c.method = tf.method;
      c.confidence = null; c.createdBy = APP; c.createdAt = now;
      return c;
    });
    var removed = old.length - kept;
    mod.data.chops = next;
    return { ok: true, added: added, removed: removed, kept: kept };
  };
  function next_index(regions, r) { return regions.indexOf(r) + 1; }

  /* Chops as DROP shows them: [{id, start, end, name, type, method}] */
  Project.prototype.chopView = function () {
    return this.list('chops').map(function (c) { return { id: c.id, start: c.startSeconds, end: c.endSeconds, name: c.name, type: c.type, method: c.method }; });
  };

  /* ---- loops ---------------------------------------------------- */
  /* syncLoops(list [{startSeconds,endSeconds,bars,bpm,name}]) — same keep-unchanged rule as chops. */
  Project.prototype.syncLoops = function (list, o) {
    o = o || {};
    var mod = this._mod('loops'), old = mod.data.loops, self = this, used = {}, ref = this._sourceRef();
    mod.data.loops = list.map(function (l) {
      for (var i = 0; i < old.length; i++)
        if (!used[i] && same(old[i].startSeconds, l.startSeconds) && same(old[i].endSeconds, l.endSeconds)) { used[i] = 1; return old[i]; }
      var x = { id: self.allocId('loop') };
      if (l.name) x.name = l.name;
      if (ref) x.source = ref;
      x.startSeconds = round6(l.startSeconds); x.endSeconds = round6(l.endSeconds);
      if (l.bars) x.bars = l.bars;
      if (l.bpm) x.bpm = l.bpm;
      x.confidence = l.confidence === undefined ? null : l.confidence;
      return x;
    });
    return { ok: true };
  };

  /* ---- samples (rendered audio) ---------------------------------------------------- */
  Project.prototype.sampleForChop = function (chopId) {
    var l = this.list('samples');
    for (var i = 0; i < l.length; i++) if (l[i].sourceChopId === chopId) return l[i];
    return null;
  };
  /* D7: a sample is reusable when the WAV exists and records the exact chop region it was rendered from (S14). */
  Project.prototype.needsRender = function (chop, renderKey) {
    var s = this.sampleForChop(chop.id);
    if (!s) return true;
    var rf = s[EXT_KEY] && s[EXT_KEY].renderedFrom;
    if (!rf || !same(rf.startSeconds, chop.startSeconds) || !same(rf.endSeconds, chop.endSeconds)) return true;
    if (renderKey !== undefined && rf.key !== undefined && rf.key !== renderKey) return true;   /* a sample rendered without a key is accepted as is */
    var present = this.newFiles[s.file] || (this.pkg && this.pkg.has(s.file) && this.removeFiles.indexOf(s.file) < 0);
    return !present;
  };
  /* addSample({chop, wav:Uint8Array, name, renderKey, category}) -> Promise<sample> */
  Project.prototype.putSample = function (o) {
    var self = this, info = wavInfo(o.wav);
    if (!info) return Promise.reject(Object.assign(new Error('sample is not a readable WAV'), { code: 'E_BAD_WAV' }));
    var existing = this.sampleForChop(o.chop.id);
    return sha256(o.wav).then(function (h) {
      var mod = self._mod('samples'), s = existing;
      if (!s) { s = { id: self.allocId('sample') }; mod.data.samples.push(s); }
      s.file = s.file || ('samples/' + s.id + '.wav');
      if (o.name) s.name = o.name;
      s.sourceChopId = o.chop.id;
      s.durationSeconds = round6(info.durationSeconds); s.sampleRate = info.sampleRate; s.bitDepth = info.bitDepth; s.channels = info.channels;
      if (o.category && !s.category) s.category = o.category;
      s.sha256 = h;
      var x = s[EXT_KEY] && typeof s[EXT_KEY] === 'object' ? s[EXT_KEY] : (s[EXT_KEY] = {});
      x.renderedFrom = { startSeconds: o.chop.startSeconds, endSeconds: o.chop.endSeconds };
      if (o.renderKey !== undefined) x.renderedFrom.key = o.renderKey;
      self.newFiles[s.file] = o.wav;
      return s;
    });
  };

  /* Samples DROP rendered for a chop that no longer exists are removed (file + record); pads that pointed at them
     become empty slots (the slot itself and any label stay). Samples DROP did not render are never touched. */
  Project.prototype.pruneOrphanSamples = function () {
    if (this.isReadOnly('samples')) return { removed: 0 };
    var chopIds = {}, self = this, gone = {}, n = 0;
    this.list('chops').forEach(function (c) { chopIds[c.id] = 1; });
    var mod = this._mod('samples');
    mod.data.samples = mod.data.samples.filter(function (s) {
      var mine = s[EXT_KEY] && s[EXT_KEY].renderedFrom;
      if (!mine || !s.sourceChopId || chopIds[s.sourceChopId]) return true;
      gone[s.id] = 1; n++;
      if (self.newFiles[s.file]) delete self.newFiles[s.file];
      else if (self.pkg && self.pkg.has(s.file) && self.removeFiles.indexOf(s.file) < 0) self.removeFiles.push(s.file);
      return false;
    });
    if (n && !this.isReadOnly('pads')) {
      this._mod('pads').data.assignments.forEach(function (a) { if (a.sampleId && gone[a.sampleId]) a.sampleId = null; });
    }
    return { removed: n };
  };

  /* ---- pads (D1: explicit mapping, separate project state) ---------------------------------------------------- */
  Project.prototype.padLayout = function () {
    var map = {};
    this.list('pads').forEach(function (a) { map[a.bank + ':' + a.pad] = a; });
    return map;
  };
  /* DROP's automatic layout: i-th sample -> SPCore.padOf(i) (bank letter A.., pad 1..16 bottom-left first) */
  Project.prototype.defaultPads = function () {
    return this.list('samples').map(function (s, i) {
      var p = SPCore.padOf(i);
      return { bank: SPCore.bankLetter(p.bank), pad: p.pad, sampleId: s.id };
    });
  };
  /* ensurePads(): serialize the automatic layout once; afterwards the saved mapping wins. New samples that have
     no pad yet are placed in the first free slot (A1..A16, B1..). Existing assignments are never touched. */
  Project.prototype.ensurePads = function () {
    if (this.isReadOnly('pads')) return { ok: false, code: 'E_READONLY_MODULE' };
    var mod = this._mod('pads'), self = this, assigned = {}, taken = {};
    if (!mod.data.assignments.length && mod.created) {
      mod.data.assignments = this.defaultPads();
      return { ok: true, serialized: mod.data.assignments.length };
    }
    mod.data.assignments.forEach(function (a) { if (a.sampleId) assigned[a.sampleId] = 1; taken[a.bank + ':' + a.pad] = a.sampleId ? 1 : 0; });
    var placed = 0, slot = 0;
    this.list('samples').forEach(function (s) {
      if (assigned[s.id]) return;
      for (;; slot++) {
        var p = SPCore.padOf(slot), k = SPCore.bankLetter(p.bank) + ':' + p.pad;
        if (!taken[k]) {
          var existing = null;
          mod.data.assignments.forEach(function (a) { if (a.bank + ':' + a.pad === k) existing = a; });
          if (existing) existing.sampleId = s.id; else mod.data.assignments.push({ bank: SPCore.bankLetter(p.bank), pad: p.pad, sampleId: s.id });
          taken[k] = 1; placed++; slot++; return;
        }
      }
    });
    return { ok: true, placed: placed };
  };
  /* setPad(bank, pad, sampleId|null[, label]) — data layer only; no UI. */
  Project.prototype.setPad = function (bank, pad, sampleId, label) {
    if (!/^[A-Z0-9]{1,4}$/.test(bank) || !(pad >= 1 && pad <= 16 && Math.floor(pad) === pad)) return { ok: false, code: 'E_BAD_PAD' };
    if (sampleId !== null && !this.list('samples').some(function (s) { return s.id === sampleId; })) return { ok: false, code: 'E_NO_SAMPLE' };
    var mod = this._mod('pads'), a = null;
    mod.data.assignments.forEach(function (x) { if (x.bank === bank && x.pad === pad) a = x; });
    if (!a) { a = { bank: bank, pad: pad, sampleId: sampleId }; mod.data.assignments.push(a); }
    else a.sampleId = sampleId;
    if (label !== undefined) a.label = label;
    return { ok: true };
  };

  /* ---- tempo (user data wins over derived state) ---------------------------------------------------- */
  /* applyTempo({bpm, beatOffsetSeconds, userSet, confidence, now}) */
  Project.prototype.applyTempo = function (t) {
    var cur = this.manifest.tempo, now = iso(t.now);
    if (cur && cur.origin === 'user' && !t.userSet) return { ok: true, kept: true };
    if (cur && cur.origin === 'imported' && !t.userSet) return { ok: true, kept: true };
    if (cur && !t.userSet && cur.bpm === t.bpm && (typeof t.beatOffsetSeconds !== 'number' || cur.beatOffsetSeconds === t.beatOffsetSeconds)) return { ok: true, kept: true };   /* nothing new: no noise */
    var n = cur && typeof cur === 'object' ? cur : {};
    n.bpm = t.bpm;
    if (typeof t.beatOffsetSeconds === 'number') n.beatOffsetSeconds = t.beatOffsetSeconds;
    if (t.confidence !== undefined) n.confidence = t.confidence;
    n.origin = t.userSet ? 'user' : 'detected';
    n.setBy = APP; n.setAt = now;
    this.manifest.tempo = n; this.manifestDirty = true;
    return { ok: true, kept: false };
  };
  Project.prototype.setGrid = function (g) { var e = this._ext(); e.grid = { div: g.div, show: !!g.show }; };

  /* ---- candidates (read-only view; analysis is never rewritten by DROP) ---------------------------------------------------- */
  /* A candidate is "accepted" when DROP's own data says so: a chop with fromCandidateId (chops, schema field),
     or a loop with the same region (loops have no candidate link in v1, S7). analysis/track.json is LEARN-owned and not touched. */
  Project.prototype.candidates = function () {
    var a = this.modules.analysis && this.modules.analysis.status === 'ok' ? this.modules.analysis.data : null;
    var accepted = {}, loops = this.list('loops');
    this.list('chops').forEach(function (c) { if (c.fromCandidateId) accepted[c.fromCandidateId] = c.id; });
    var mapC = function (c, kind) { return { id: c.id, kind: kind, label: c.label || null, startSeconds: c.startSeconds, endSeconds: c.endSeconds, confidence: c.confidence === undefined ? null : c.confidence,
                                             reason: c.reason || null, state: c.state || 'suggested', acceptedChopId: accepted[c.id] || c.acceptedChopId || null, accepted: !!accepted[c.id] }; };
    var mapL = function (c) {
      var o = mapC(c, 'loop'); o.bars = c.bars === undefined ? null : c.bars;
      o.accepted = loops.some(function (l) { return same(l.startSeconds, c.startSeconds) && same(l.endSeconds, c.endSeconds); });
      return o;
    };
    return { chops: ((a && a.chopCandidates) || []).map(function (c) { return mapC(c, c.kind); }), loops: ((a && a.loopCandidates) || []).map(mapL) };
  };
  /* acceptCandidate(id) creates a confirmed chop (type analysis-suggestion, fromCandidateId) — never edits analysis. */
  Project.prototype.acceptCandidate = function (id, o) {
    var cand = this.candidates().chops.filter(function (c) { return c.id === id; })[0];
    if (!cand) return { ok: false, code: 'E_NO_CANDIDATE' };
    if (this.list('chops').some(function (c) { return c.fromCandidateId === id; })) return { ok: false, code: 'E_ALREADY_ACCEPTED' };
    if (this.isReadOnly('chops')) return { ok: false, code: 'E_READONLY_MODULE' };
    var mod = this._mod('chops'), c = { id: this.allocId('chop') };
    if (cand.label) c.name = cand.label;
    if (this._sourceRef()) c.source = this._sourceRef();
    if (this.manifest.source && this.manifest.source.sha256) c.sourceSha256 = this.manifest.source.sha256;
    c.startSeconds = cand.startSeconds; c.endSeconds = cand.endSeconds; c.type = 'analysis-suggestion'; c.fromCandidateId = id;
    c.confidence = cand.confidence; c.createdBy = APP; c.createdAt = iso(o && o.now);
    mod.data.chops.push(c);
    return { ok: true, chop: c };
  };
  /* Loop candidates become loops.json entries (no link field exists in v1; the region identifies the candidate). */
  Project.prototype.acceptLoopCandidate = function (id, o) {
    var cand = this.candidates().loops.filter(function (c) { return c.id === id; })[0];
    if (!cand) return { ok: false, code: 'E_NO_CANDIDATE' };
    if (cand.accepted) return { ok: false, code: 'E_ALREADY_ACCEPTED' };
    if (this.isReadOnly('loops')) return { ok: false, code: 'E_READONLY_MODULE' };
    var mod = this._mod('loops'), l = { id: this.allocId('loop') };
    if (cand.label) l.name = cand.label;
    if (this._sourceRef()) l.source = this._sourceRef();
    l.startSeconds = cand.startSeconds; l.endSeconds = cand.endSeconds;
    if (typeof cand.bars === 'number' && cand.bars > 0) l.bars = cand.bars;
    var t = this.manifest.tempo; if (t && t.bpm > 0) l.bpm = t.bpm;
    l.confidence = cand.confidence;
    mod.data.loops.push(l);
    return { ok: true, loop: l };
  };

  /* ---- lesson requirements (learn/requirements.json is read-only for DROP) ---------------------------------------------------- */
  var CAND_CATEGORY = { 'drum-break': 'drum', vocal: 'vocal', 'melodic-loop': 'melodic', texture: 'texture', bass: 'bass' };
  /* requirement type -> sample categories that satisfy it (prose-only in the spec, S15; this is DROP's reading) */
  var NEED_CATEGORIES = { 'drum-chop': ['drum'], 'break-chop': ['drum'], kick: ['kick'], snare: ['snare'], hat: ['hat'], perc: ['perc'], bass: ['bass'],
                          'vocal-chop': ['vocal'], melodic: ['melodic'], texture: ['texture'], loop: ['loop'] };
  /* category of a confirmed chop: its sample's category, else the kind of the candidate it was accepted from */
  Project.prototype.categoryForChop = function (chop) {
    var s = this.sampleForChop(chop.id);
    if (s && s.category && s.category !== 'unknown') return s.category;
    if (chop.fromCandidateId) {
      var k = this.candidates().chops.filter(function (c) { return c.id === chop.fromCandidateId; })[0];
      if (k && CAND_CATEGORY[k.kind]) return CAND_CATEGORY[k.kind];
    }
    return null;
  };
  Project.prototype.requirementsProgress = function () {
    var m = this.modules.requirements;
    if (!m || m.status !== 'ok' || !m.data) return null;
    var self = this, items = [], chopIds = {};
    this.list('chops').forEach(function (c) { chopIds[c.id] = 1; items.push(self.categoryForChop(c)); });
    this.list('samples').forEach(function (s) { if (!s.sourceChopId || !chopIds[s.sourceChopId]) items.push(s.category && s.category !== 'unknown' ? s.category : null); });
    this.list('loops').forEach(function () { items.push('loop'); });
    return { lesson: m.data.lesson, title: m.data.title || null, needs: m.data.needs.map(function (n) {
      var cats = NEED_CATEGORIES[n.type], have = items.filter(function (c) { return n.type === 'any' ? true : (c && cats && cats.indexOf(c) >= 0); }).length;
      return { type: n.type, count: n.count, have: have, note: n.note || null };
    }) };
  };

  /* ---- dirty state: opening never makes a project dirty ---------------------------------------------------- */
  Project.prototype.isDirty = function () {
    var self = this;
    return this.manifestDirty || Object.keys(this.newFiles).length > 0 || this.removeFiles.length > 0 ||
      Object.keys(this.modules).some(function (n) { return self.modules[n].dirty; });
  };

  /* ---- from an opened package ---------------------------------------------------- */
  function fromOpen(res) {
    if (!res || !res.manifest || res.level === 'CORRUPTED' || res.level === 'UNSUPPORTED_VERSION') {
      var e = new Error(res && res.message || 'package cannot be opened'); e.code = res && res.code; e.result = res; throw e;
    }
    var mods = {};
    Object.keys(res.modules).forEach(function (n) { var m = res.modules[n]; mods[n] = { name: n, path: m.path, status: m.status, data: m.data, raw: m.raw, owner: m.owner, dirty: false, errors: m.errors }; });
    var p = new Project(res.manifest, mods);
    p.pkg = res.package; p.issues = res.issues; p.level = res.level;
    p.baseRevision = typeof res.manifest.revision === 'number' ? res.manifest.revision : 0;
    p.hadRevision = typeof res.manifest.revision === 'number';
    p.baseFingerprint = res.fingerprint;
    p.manifestDirty = false;
    return p;
  }

  /* ---- save plan ---------------------------------------------------- */
  /* prepareSave({now, version}) -> {plan, manifest, nextRevision}
     Only dirty DROP-owned modules, the manifest, and new files are written; everything else is copied raw. */
  Project.prototype.prepareSave = function (o) {
    o = o || {};
    var self = this, next = o.copy ? 1 : (typeof this.baseRevision === 'number' ? this.baseRevision : 0) + 1, replace = {}, add = {};
    var m = clone(this.manifest);
    if (o.copy) m.id = uuid4();                     /* "Save a copy" is the ONLY place a project id is regenerated */
    m.revision = next;
    m.modifiedAt = iso(o.now); m.modifiedBy = APP;
    if (o.version) m.modifiedByVersion = o.version;
    if (!m.modules || typeof m.modules !== 'object') m.modules = {};
    DROP_MODULES.forEach(function (n) {
      var mod = self.modules[n];
      if (!mod || mod.status === 'absent') return;
      if (mod.status === 'ok' && (mod.dirty || mod.created)) {
        var errs = SPValidate.validate(SPSchemas.schemas, SPPackage.MODULES[n].schema, mod.data);
        if (errs.length) { var e = new Error('refusing to save invalid ' + mod.path + ': ' + errs[0].path + ' ' + errs[0].message); e.code = 'E_INVALID_MODULE_DATA'; throw e; }
        var bytes = SPPackage.stringify(mod.data);
        (self.pkg && self.pkg.has(mod.path) ? replace : add)[mod.path] = bytes;
      } else if (o.copy && mod.raw && mod.status === 'ok') { /* unchanged owned module in a copy: still copied raw from the source package */ }
      if (mod.status === 'ok') {
        var d = m.modules[n] && typeof m.modules[n] === 'object' ? m.modules[n] : {};
        d.path = mod.path; d.schemaVersion = mod.data.schemaVersion || 1; d.owner = APP; if (d.sha256) delete d.sha256; /* stale informational hash */
        m.modules[n] = d;
      }
    });
    var merr = SPValidate.validate(SPSchemas.schemas, 'manifest.schema.json', m);
    if (merr.length) { var me = new Error('refusing to save invalid manifest: ' + merr[0].path + ' ' + merr[0].message); me.code = 'E_INVALID_MODULE_DATA'; throw me; }
    replace['manifest.json'] = SPPackage.stringify(m);
    Object.keys(this.newFiles).forEach(function (n) { (self.pkg && self.pkg.has(n) ? replace : add)[n] = self.newFiles[n]; });
    return { plan: { replace: replace, add: add, remove: this.removeFiles.slice() }, manifest: m, nextRevision: next };
  };
  /* After a successful, validated save: adopt the new on-disk state as the baseline. */
  Project.prototype.afterSave = function (res) {
    var p = fromOpen(res);
    this.manifest = p.manifest; this.pkg = p.pkg; this.baseRevision = p.baseRevision; this.baseFingerprint = p.baseFingerprint; this.issues = p.issues; this.level = p.level;
    this.newFiles = {}; this.removeFiles = []; this.manifestDirty = false; this.hadRevision = true;
    var mods = this.modules;
    Object.keys(p.modules).forEach(function (n) { mods[n] = p.modules[n]; });
    return this;
  };

  return {
    APP: APP, EXT_KEY: EXT_KEY, create: create, fromOpen: fromOpen, wavInfo: wavInfo, sha256: sha256, uuid4: uuid4,
    regionsFromMarkers: regionsFromMarkers, typeFor: typeFor, Project: Project, CAND_CATEGORY: CAND_CATEGORY, NEED_CATEGORIES: NEED_CATEGORIES
  };
});
