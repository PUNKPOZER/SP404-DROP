/* One application-level pipeline for opening a .spsystem that arrives from outside (macOS "open", LEARN, and later
   File > Open / drag-drop / recent projects): openExternalProject(path). Node-only, no Electron imports, unit-tested.

   - Uses the one SP SYSTEM reader (spsystem-fs.open); never a second parser.
   - Opening is READ-ONLY: nothing is written, revision / modifiedBy / LEARN data are untouched, project is not dirty.
   - The Project object stays here (shared `sessions` map with open-in-learn.js), keyed by a session key the renderer
     uses for Save / Open in LEARN, so uuid, revision and the file path continue seamlessly.
   - analysis/track.json and learn/requirements.json stay in the project for later features; the renderer only gets the
     small views it needs (suggestions, requirement progress). */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var FS = require('./spsystem-fs.js'), OIL = require('./open-in-learn.js');
function shared(name) { try { return require('../../web/' + name); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('./' + name); } }
var SPPackage = shared('sp-package.js'), SPProject = shared('sp-project.js');

var MAX_EXTERNAL = SPPackage.DEFAULT_LIMITS.maxEntryBytes;

function fail(code, message, extra) { var r = { ok: false, code: code, message: message }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
function sameHash(a, b) { if (!a || !b) return true; var n = Math.min(a.length, b.length); return a.slice(0, n).toLowerCase() === b.slice(0, n).toLowerCase(); }
function extOf(name) { var m = /\.([A-Za-z0-9]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : 'wav'; }

/* source -> {state:'ok', bytes, ext, name} | {state:'missing'|'mismatch'|'none'|'error', ...}  (never throws) */
function resolveSource(project) {
  var src = project.manifest.source || {};
  var name = src.originalFilename || (src.audio && path.basename(src.audio)) || (project.manifest.title || 'track');
  if (src.mode === 'none' || (!src.mode && !src.audio && !src.externalSource)) return Promise.resolve({ state: 'none', name: name });
  if (src.mode === 'lightweight') {
    var ext = src.externalSource || {};
    if (!ext.path) return Promise.resolve({ state: 'missing', name: name, path: null });
    return fs.promises.stat(ext.path).then(function (st) {
      if (!st.isFile()) return { state: 'missing', name: name, path: ext.path };
      if (st.size > MAX_EXTERNAL) return { state: 'error', name: name, path: ext.path, message: SPPackage.TOO_LARGE_MESSAGE };
      return fs.promises.readFile(ext.path).then(function (buf) {
        var h = crypto.createHash('sha256').update(buf).digest('hex');
        if (!sameHash(h, ext.hash)) return { state: 'mismatch', name: name, path: ext.path };
        return { state: 'ok', bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), ext: extOf(ext.path), name: name, path: ext.path };
      });
    }, function () { return { state: 'missing', name: name, path: ext.path }; });
  }
  if (!src.audio || !project.pkg || !project.pkg.has(src.audio)) return Promise.resolve({ state: 'missing', name: name, path: src.audio || null, embedded: true });
  return project.pkg.read(src.audio).then(function (b) {
    return { state: 'ok', bytes: b, ext: extOf(src.audio), name: name, path: null, embedded: true };
  }, function (e) { return { state: 'error', name: name, message: e.code === 'E_TOO_LARGE' ? SPPackage.TOO_LARGE_MESSAGE : e.message }; });
}

/* The small, serialisable view the UI needs. Pure read of the project. */
function view(project, key, file, sourceState) {
  var dur = project.manifest.source && project.manifest.source.durationSeconds;
  var rep = project.chopsRepresentable(typeof dur === 'number' ? dur : undefined);
  return {
    key: key, path: file, id: project.manifest.id, revision: typeof project.manifest.revision === 'number' ? project.manifest.revision : null,
    title: project.manifest.title || null, level: project.level, dirty: project.isDirty(),
    issues: project.issues.map(function (i) { return { severity: i.severity, code: i.code, message: i.message, where: i.where }; }),
    tempo: project.manifest.tempo || null, meter: project.manifest.meter || null,
    source: { state: sourceState.state, name: sourceState.name, path: sourceState.path || null, message: sourceState.message || null,
              mode: (project.manifest.source || {}).mode || null, sha256: (project.manifest.source || {}).sha256 || null, duration: dur === undefined ? null : dur, sampleRate: (project.manifest.source || {}).sampleRate || null },
    chops: project.list('chops').map(function (c) { return { id: c.id, start: c.startSeconds, end: c.endSeconds, name: c.name || null, type: c.type, fromCandidateId: c.fromCandidateId || null }; }),
    chopsPartition: rep.ok, chopsReason: rep.ok ? null : rep.reason,
    markers: rep.ok && rep.markers ? rep.markers : [],
    samples: project.list('samples').map(function (s) { return { id: s.id, sourceChopId: s.sourceChopId || null, name: s.name || null, category: s.category || null }; }),
    pads: project.list('pads'), loops: project.list('loops').map(function (l) { return { id: l.id, start: l.startSeconds, end: l.endSeconds, bars: l.bars || null }; }),
    candidates: project.candidates(), requirements: project.requirementsProgress(), hasAnalysis: project.modules.analysis && project.modules.analysis.status === 'ok'
  };
}
function refresh(key) {
  var e = OIL.sessions.get(key);
  return e ? { candidates: e.project.candidates(), requirements: e.project.requirementsProgress(), chops: view(e.project, key, e.file, { state: 'ok' }).chops, dirty: e.project.isDirty(),
               revision: e.project.manifest.revision, loops: e.project.list('loops').map(function (l) { return { id: l.id, start: l.startSeconds, end: l.endSeconds }; }) } : null;
}

/* openExternalProject(file) -> Promise<{ok:true, info, sourceBytes} | {ok:false, code, message, level?, issues?}> */
function openExternalProject(file) {
  if (typeof file !== 'string' || !file) return Promise.resolve(fail('E_NO_FILE', 'no project path'));
  file = path.resolve(file);
  return FS.open(file).then(function (o) {
    var r = o.result;
    if (!o.project) {
      var msg = r.code === 'E_NO_FILE' ? 'The project file does not exist: ' + file
        : r.level === 'UNSUPPORTED_VERSION' ? 'This project needs a newer version of DROP (' + r.message + ')'
        : r.code === 'E_TOO_LARGE' ? SPPackage.TOO_LARGE_MESSAGE : 'This is not a usable SP SYSTEM project: ' + r.message;
      return fail(r.code || 'E_NOT_USABLE', msg, { level: r.level, issues: r.issues || [], path: file });
    }
    var project = o.project;
    return resolveSource(project).then(function (src) {
      var key = crypto.randomUUID();
      OIL.sessions.set(key, { project: project, file: file, opened: true });
      var info = view(project, key, file, src);
      return { ok: true, info: info, sourceBytes: src.state === 'ok' ? src.bytes : null, sourceExt: src.ext || null };
    });
  }).catch(function (e) { return fail(e.code || 'E_IO', e.message, { path: file }); });
}

/* Accept a LEARN suggestion: creates the confirmed chop / loop in the (in-memory) project. Nothing is saved yet. */
function acceptSuggestion(key, id, kind) {
  var e = OIL.sessions.get(key);
  if (!e) return fail('E_NO_SESSION', 'no such open project');
  var r = kind === 'loop' ? e.project.acceptLoopCandidate(id, { now: Date.now() }) : e.project.acceptCandidate(id, { now: Date.now() });
  if (!r.ok) return fail(r.code, r.code);
  return { ok: true, chopId: r.chop ? r.chop.id : null, state: refresh(key) };
}

/* Save a project that is open in the session (no launch): same atomic, conflict-checked path as everything else. */
function saveSession(payload) {
  return OIL.run(payload, { launch: function () { return Promise.resolve({ launched: 'none' }); } }).then(function (r) {
    if (r.ok) r.state = refresh(payload.sessionKey);
    return r;
  });
}

module.exports = { openExternalProject: openExternalProject, acceptSuggestion: acceptSuggestion, saveSession: saveSession, resolveSource: resolveSource, view: view, refresh: refresh };
