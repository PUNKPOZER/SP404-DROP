/* SP SYSTEM — Node-only file adapter for .spsystem (Electron main process / tests). CommonJS.

   Atomic save strategy (owner decision D9) — the canonical project path is NEVER missing:
     1. conflict check: re-open the file on disk, compare (revision, central-directory fingerprint) with the
        baseline the project was opened from. Different  ->  {ok:false, conflict:true}; nothing is written.
     2. advisory lock  <file>.lock  (O_EXCL; stale after 10 min or when the pid is gone).
     3. write the new package to a temp file in the SAME directory (same file system => rename is atomic),
        flush + fsync + close.
     4. validate the temp file: opens as non-CORRUPTED, same project id, expected revision, every entry that
        was copied through is byte-for-byte (CRC/size/method) identical to the old one.
     5. backup (extra protection, not the mechanism): COPY current -> <file>.bak.tmp, fsync, rename -> <file>.bak.
        The original is never renamed or deleted, so there is no original->.bak / temp->original window.
     6. rename(temp, file): POSIX rename(2) atomically replaces the destination (macOS/Linux). On Windows
        fs.rename maps to MoveFileEx(MOVEFILE_REPLACE_EXISTING), which replaces atomically at the file-system
        level; transient EPERM/EBUSY/EACCES (antivirus, indexer) are retried with short back-off and, if still
        failing, the save fails with the original untouched.
     7. fsync the directory (best effort; not available on Windows).
     8. re-open the saved file and adopt it as the project's new baseline.
   Any failure removes the temp file and leaves the original as it was. */
'use strict';
var fs = require('fs'), fsp = fs.promises, path = require('path'), os = require('os'), crypto = require('crypto');
/* In the repo the shared modules live in ../../web; mac/build.sh copies them next to this file for the packaged app. */
function shared(name) { try { return require('./' + name); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('../../web/' + name); } }
var SPPackage = shared('sp-package.js');
var SPProject = shared('sp-project.js');

var LOCK_STALE_MS = 10 * 60 * 1000;

function limitsFor(extra) {
  var l = {};
  /* S16: keep any single buffered entry below ~60% of currently free memory (and never above the entry cap). */
  l.memoryBudgetBytes = Math.max(64 * 1024 * 1024, Math.floor(os.freemem() * 0.6));
  if (extra) for (var k in extra) l[k] = extra[k];
  return l;
}

/* Random-access source that opens the file per read (no descriptor is kept between calls, so a Package can be
   used lazily after open() returns and a replaced file is never held open). */
function lazySource(file, size) {
  return {
    size: size,
    read: function (off, len) {
      return fsp.open(file, 'r').then(function (fh) {
        var buf = Buffer.alloc(len);
        return fh.read(buf, 0, len, off).then(function (r) { return fh.close().then(function () { return new Uint8Array(buf.buffer, buf.byteOffset, r.bytesRead); }); },
          function (e) { return fh.close().then(function () { throw e; }); });
      });
    }
  };
}
function open(file, opts) {
  opts = opts || {};
  return fsp.stat(file).then(function (st) {
    if (!st.isFile()) return { result: { level: 'CORRUPTED', ok: false, code: 'E_NOT_ZIP', message: 'not a regular file', issues: [] }, project: null };
    return SPPackage.open(lazySource(file, st.size), { limits: limitsFor(opts.limits), codecs: opts.codecs }).then(function (res) {
      var project = null;
      if (res.level === 'VALID' || res.level === 'VALID_WITH_WARNINGS') project = SPProject.fromOpen(res);
      return { result: res, project: project };
    });
  }, function (e) {
    return { result: { level: 'CORRUPTED', ok: false, code: e.code === 'ENOENT' ? 'E_NO_FILE' : 'E_IO', message: e.message, issues: [] }, project: null };
  });
}

function readLock(lockPath) {
  try { return JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch (e) { return null; }
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function acquireLock(file) {
  var lockPath = file + '.lock', body = JSON.stringify({ pid: process.pid, at: Date.now(), host: os.hostname() });
  function tryOnce(again) {
    return fsp.open(lockPath, 'wx').then(function (fh) { return fh.writeFile(body).then(function () { return fh.close(); }).then(function () { return lockPath; }); }, function (e) {
      if (e.code !== 'EEXIST') throw e;
      var cur = readLock(lockPath);
      var stale = !cur || (Date.now() - cur.at > LOCK_STALE_MS) || (cur.host === os.hostname() && !pidAlive(cur.pid));
      if (stale && again) { try { fs.unlinkSync(lockPath); } catch (x) {} return tryOnce(false); }
      var er = new Error('project is being saved by another process'); er.code = 'E_LOCKED'; throw er;
    });
  }
  return tryOnce(true);
}
function releaseLock(lockPath) { try { fs.unlinkSync(lockPath); } catch (e) {} }

function fileSink(fh) {
  return { write: function (u8) { return fh.write(u8).then(function () {}); } };
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function renameReplace(from, to) {
  var tries = 0;
  function go() {
    return fsp.rename(from, to).catch(function (e) {
      if (process.platform === 'win32' && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES') && ++tries < 8) return sleep(25 * tries).then(go);
      throw e;
    });
  }
  return go();
}
function fsyncDir(dir) {
  if (process.platform === 'win32') return Promise.resolve();
  return fsp.open(dir, 'r').then(function (fh) { return fh.sync().catch(function () {}).then(function () { return fh.close(); }); }, function () {});
}
function copyFileSynced(from, to) {
  return fsp.open(from, 'r').then(function (src) {
    return fsp.open(to, 'w', 0o644).then(function (dst) {
      var buf = Buffer.alloc(1024 * 1024), pos = 0;
      function pump() {
        return src.read(buf, 0, buf.length, pos).then(function (r) {
          if (!r.bytesRead) return;
          pos += r.bytesRead;
          return dst.write(buf, 0, r.bytesRead).then(pump);
        });
      }
      return pump().then(function () { return dst.sync(); }).then(function () { return dst.close(); }).then(function () { return src.close(); }, function (e) { return dst.close().then(function () { return src.close(); }).then(function () { throw e; }); });
    }, function (e) { return src.close().then(function () { throw e; }); });
  });
}
function rmQuiet(f) { return fsp.unlink(f).catch(function () {}); }

/* saveFile(project, file, {mode: 'save'|'saveAs'|'copy', overwrite, now, version, hooks, codecs, deflate})
   -> Promise<{ok:true, revision, backup} | {ok:false, conflict:true, ...} | {ok:false, code, message}> */
function saveFile(project, file, opts) {
  opts = opts || {};
  var hooks = opts.hooks || {}, mode = opts.mode || 'save', dir = path.dirname(file), base = path.basename(file);
  var tmp = path.join(dir, '.' + base + '.' + crypto.randomBytes(6).toString('hex') + '.tmp'), bakTmp = file + '.bak.tmp', bak = file + '.bak';
  var lock = null, prepared, existed = false, diskOpen = null, fh = null;

  function fail(code, message, extra) { var r = { ok: false, code: code, message: message }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
  function cleanup(r) {
    var p = fh ? fh.close().catch(function () {}) : Promise.resolve();
    return p.then(function () { return rmQuiet(tmp); }).then(function () { return rmQuiet(bakTmp); }).then(function () { if (lock) releaseLock(lock); return r; });
  }

  return Promise.resolve().then(function () {
    return acquireLock(file);
  }).then(function (l) {
    lock = l;
    return fsp.stat(file).then(function () { existed = true; }, function () { existed = false; });
  }).then(function () {
    if (mode === 'save' && !existed && project.baseFingerprint) return fail('E_CONFLICT', 'The project file was removed from disk after it was opened', { conflict: true, reason: 'deleted' });
    if ((mode === 'saveAs' || mode === 'copy' || !project.baseFingerprint) && existed && !opts.overwrite) return fail('E_EXISTS', 'A file with this name already exists', { conflict: true, reason: 'exists' });
    if (mode !== 'save' || !existed) return null;
    return open(file, opts).then(function (d) {
      diskOpen = d;
      var res = d.result;
      if (res.level === 'CORRUPTED' || res.level === 'UNSUPPORTED_VERSION') return fail('E_CONFLICT', 'The file on disk changed and can no longer be read: ' + res.message, { conflict: true, reason: 'unreadable', disk: { level: res.level } });
      var fp = res.fingerprint, b = project.baseFingerprint;
      var diskRev = typeof res.manifest.revision === 'number' ? res.manifest.revision : 0;
      if (res.manifest.id !== project.manifest.id) return fail('E_CONFLICT', 'The file on disk is a different project', { conflict: true, reason: 'other-project' });
      if (diskRev !== project.baseRevision || fp.cdCrc !== b.cdCrc || fp.size !== b.size || fp.entries !== b.entries)
        return fail('E_CONFLICT', 'The project was changed on disk after it was opened', { conflict: true, reason: 'changed',
          disk: { revision: diskRev, modifiedAt: res.manifest.modifiedAt, modifiedBy: res.manifest.modifiedBy }, base: { revision: project.baseRevision } });
      return null;
    });
  }).then(function (early) {
    if (early) return early;
    prepared = project.prepareSave({ now: opts.now, version: opts.version, copy: mode === 'copy' });
    var pkg = (mode === 'save' || mode === 'copy' || mode === 'saveAs') ? project.pkg : null;
    /* the old package is read lazily from its own file: for Save As / copy that is the original path (unchanged). */
    return fsp.open(tmp, 'wx', 0o644).then(function (h) {
      fh = h;
      return SPPackage.assemble(pkg, prepared.plan, fileSink(fh), { codecs: opts.codecs, now: opts.now, deflate: opts.deflate !== false });
    }).then(function (written) {
      if (hooks.afterWrite) hooks.afterWrite(tmp);
      return fh.sync().then(function () { return fh.close(); }).then(function () { fh = null; return written; });
    }).then(function (written) {
      if (hooks.afterFsync) hooks.afterFsync(tmp);
      return validateTemp(tmp, project, prepared, pkg, written, opts);
    }).then(function (bad) {
      if (bad) return fail('E_VALIDATE', bad);
      if (hooks.beforeBackup) hooks.beforeBackup(tmp);
      var step = existed && mode === 'save' ? copyFileSynced(file, bakTmp).then(function () { return renameReplace(bakTmp, bak); }) : Promise.resolve();
      return step.then(function () {
        if (hooks.beforeRename) hooks.beforeRename(tmp);
        return renameReplace(tmp, file);
      }).then(function () {
        return fsyncDir(dir);
      }).then(function () {
        if (mode === 'copy') return { ok: true, copy: true, revision: prepared.nextRevision, id: prepared.manifest.id };
        return open(file, opts).then(function (d) {
          if (!d.project) return fail('E_VALIDATE', 'saved file did not re-open: ' + (d.result && d.result.message));
          project.afterSave(d.result);
          return { ok: true, revision: prepared.nextRevision, backup: existed && mode === 'save' ? bak : null, level: d.result.level };
        });
      });
    });
  }).then(cleanup, function (e) {
    return cleanup(fail(e.code || 'E_IO', e.message));
  });
}

/* Every entry copied through must be identical to the old package; the new package must be what we meant to write. */
function validateTemp(tmp, project, prepared, oldPkg, written, opts) {
  return open(tmp, opts).then(function (d) {
    var res = d.result;
    if (res.level === 'CORRUPTED' || res.level === 'UNSUPPORTED_VERSION') return 'written file failed validation: ' + res.message;
    if (res.manifest.id !== prepared.manifest.id) return 'project id changed';
    if (res.manifest.revision !== prepared.nextRevision) return 'unexpected revision';
    for (var i = 0; i < written.entries.length; i++) {
      var w = written.entries[i];
      if (!w.raw) continue;
      var o = oldPkg && oldPkg.entry(w.name);
      if (!o || o.crc !== w.crc || o.usize !== w.usize || o.csize !== w.csize || o.method !== w.method) return 'copied entry differs from the original: ' + w.name;
    }
    var names = {}; res.entries.forEach(function (e) { names[e.name] = 1; });
    if (oldPkg) for (var j = 0; j < oldPkg.entries.length; j++) {
      var oe = oldPkg.entries[j];
      if (project.removeFiles.indexOf(oe.name) < 0 && !names[oe.name]) return 'entry lost: ' + oe.name;
    }
    return null;
  });
}

/* Leftovers of an interrupted save. cleanup:true removes temp files and stale locks. */
function recover(file, opts) {
  opts = opts || {};
  var dir = path.dirname(file), base = path.basename(file), out = { temps: [], lock: null, canonicalMissing: false, backup: null };
  return fsp.readdir(dir).then(function (names) {
    names.forEach(function (n) { if (n.indexOf('.' + base + '.') === 0 && /\.tmp$/.test(n)) out.temps.push(path.join(dir, n)); });
    if (names.indexOf(base + '.bak.tmp') >= 0) out.temps.push(path.join(dir, base + '.bak.tmp'));
    out.canonicalMissing = names.indexOf(base) < 0;
    if (names.indexOf(base + '.bak') >= 0) out.backup = path.join(dir, base + '.bak');
    var l = readLock(file + '.lock');
    if (names.indexOf(base + '.lock') >= 0) out.lock = { stale: !l || Date.now() - l.at > LOCK_STALE_MS || (l.host === os.hostname() && !pidAlive(l.pid)), info: l };
    if (opts.cleanup) {
      out.temps.forEach(function (t) { try { fs.unlinkSync(t); } catch (e) {} });
      if (out.lock && out.lock.stale) releaseLock(file + '.lock');
    }
    return out;
  });
}

/* Safe extraction of a project into a directory (for tools that need loose files). Names were vetted by the
   reader; this additionally re-checks containment, refuses to follow/overwrite anything existing, writes 0644. */
function extractToDir(pkg, dir) {
  var root = path.resolve(dir), written = [];
  return fsp.mkdir(root, { recursive: true }).then(function () { return fsp.realpath(root); }).then(function (realRoot) {
    var list = pkg.entries.filter(function (e) { return !e.dir; }), i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve(written);
      var e = list[i++], target = path.resolve(realRoot, e.name);
      if (target.indexOf(realRoot + path.sep) !== 0) throw Object.assign(new Error('entry escapes the target directory: ' + e.name), { code: 'E_PATH_UNSAFE' });
      return fsp.mkdir(path.dirname(target), { recursive: true }).then(function () { return fsp.realpath(path.dirname(target)); }).then(function (rp) {
        if (rp !== realRoot && rp.indexOf(realRoot + path.sep) !== 0) throw Object.assign(new Error('entry escapes the target directory: ' + e.name), { code: 'E_PATH_UNSAFE' });
        return pkg.read(e);
      }).then(function (data) {
        return fsp.writeFile(target, data, { flag: 'wx', mode: 0o644 });
      }).then(function () { written.push(e.name); return next(); });
    }
    return next();
  });
}

/* open(file, {limits}) -> Promise<{result, project|null}>; never throws for bad input */
module.exports = { open: open, saveFile: saveFile, recover: recover, extractToDir: extractToDir, lazySource: lazySource, limitsFor: limitsFor };
