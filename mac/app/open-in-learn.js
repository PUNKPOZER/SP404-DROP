/* "Open in LEARN" for the Electron app (main process; also unit-tested in Node without Electron).
   The renderer sends the current DROP state (source bytes, markers, rendered slices, tempo); this module keeps one
   project per loaded track for the app session, saves it atomically as <Documents>/SP404 DROP/Projects/<name>.spsystem
   (same UUID, revision +1 on every later call) and then opens it with SP-404 LEARN (falls back to revealing it in Finder). */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
function shared(name) { try { return require('./' + name); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('../../web/' + name); } }
var Bridge = shared('sp-bridge.js'), FS = require('./spsystem-fs.js');

var sessions = new Map();     /* sessionKey -> {project, file} */
var LEARN_APPS = ['/Applications/SP-404 LEARN.app', path.join(os.homedir(), 'Applications', 'SP-404 LEARN.app')];

function projectsDir() { return path.join(os.homedir(), 'Documents', 'SP404 DROP', 'Projects'); }
function safeBase(name) {
  var b = Bridge.titleOf(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 80);
  return b || 'Untitled';
}
function uniquePath(dir, base) {
  var f = path.join(dir, base + '.spsystem'), n = 2;
  while (fs.existsSync(f) || fs.existsSync(f + '.lock')) f = path.join(dir, base + ' ' + (n++) + '.spsystem');
  return f;
}
function defaultLaunch(file) {
  return new Promise(function (resolve) {
    var app = LEARN_APPS.filter(function (a) { return fs.existsSync(a); })[0];
    var args = app ? ['-a', app, file] : ['-R', file];
    cp.execFile('open', args, function (err) { resolve({ launched: err ? 'none' : (app ? 'learn' : 'finder'), error: err ? err.message : null }); });
  });
}

/* run(payload, {dir, launch}) -> Promise<{ok, file, revision, launched, ...} | {ok:false, code, message, conflict?}> */
function run(payload, opts) {
  opts = opts || {};
  var launch = opts.launch || defaultLaunch, dir = opts.dir || projectsDir(), key = payload.sessionKey, entry = sessions.get(key), now = payload.now;
  return fs.promises.mkdir(dir, { recursive: true }).then(function () {
    return entry ? { project: entry.project, file: entry.file, fresh: false } : Bridge.create(payload).then(function (p) { return { project: p, file: uniquePath(dir, safeBase(payload.fileName)), fresh: true }; });
  }).then(function (e) {
    return Promise.resolve(Bridge.sync(e.project, payload)).then(function (r) {
      if (!r.ok) return { ok: false, code: r.code, message: r.reason || r.code };
      return FS.saveFile(e.project, e.file, { now: now, version: payload.version }).then(function (s) {
        if (!s.ok) return s;
        sessions.set(key, { project: e.project, file: e.file });
        return launch(e.file).then(function (l) { return { ok: true, file: e.file, revision: s.revision, id: e.project.manifest.id, launched: l.launched, launchError: l.error || null, fresh: e.fresh }; });
      });
    });
  }).catch(function (e) { return { ok: false, code: e.code || 'E_IO', message: e.message }; });
}

module.exports = { run: run, projectsDir: projectsDir, sessions: sessions, safeBase: safeBase };
