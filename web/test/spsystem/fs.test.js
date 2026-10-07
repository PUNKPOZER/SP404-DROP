'use strict';
var test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
var H = require('./helpers.js'), P = H.P, SPProject = require('../../sp-project.js'), FS = require('../../../mac/app/spsystem-fs.js');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'spsys-')); }
function listDir(d) { return fs.readdirSync(d).sort(); }
function newFile(o) {
  var dir = tmpdir(), file = path.join(dir, 'p.spsystem');
  return H.dropProject(o).then(function (p) { return FS.saveFile(p, file, { now: '2026-10-07T09:00:00Z' }).then(function (r) { assert.ok(r.ok, JSON.stringify(r)); return { dir: dir, file: file, p: p }; }); });
}

test('first save creates the file (revision 1); second save increments and writes a .bak of the previous one', function () {
  return newFile().then(function (c) {
    assert.deepStrictEqual(listDir(c.dir), ['p.spsystem']);
    assert.strictEqual(c.p.baseRevision, 1);
    var v1 = fs.readFileSync(c.file);
    c.p.setPad('A', 5, 'sample-01');
    return FS.saveFile(c.p, c.file, { now: '2026-10-07T09:05:00Z' }).then(function (r) {
      assert.ok(r.ok); assert.strictEqual(r.revision, 2);
      assert.deepStrictEqual(listDir(c.dir), ['p.spsystem', 'p.spsystem.bak']);
      assert.deepStrictEqual(fs.readFileSync(c.file + '.bak'), v1);
      return FS.open(c.file);
    }).then(function (o) { assert.strictEqual(o.result.manifest.revision, 2); assert.ok(o.project.list('pads').some(function (a) { return a.pad === 5; })); });
  });
});
test('project id is stable across saves; Save As keeps it, copy changes it', function () {
  return newFile().then(function (c) {
    var id = c.p.manifest.id, f2 = path.join(c.dir, 'b.spsystem'), f3 = path.join(c.dir, 'c.spsystem');
    return FS.saveFile(c.p, f2, { mode: 'saveAs' }).then(function (r) { assert.ok(r.ok, JSON.stringify(r)); return FS.saveFile(c.p, f3, { mode: 'copy' }); })
      .then(function (r) { assert.ok(r.ok); return Promise.all([FS.open(f2), FS.open(f3), FS.open(c.file)]); })
      .then(function (a) { assert.strictEqual(a[0].result.manifest.id, id); assert.notStrictEqual(a[1].result.manifest.id, id); assert.strictEqual(a[1].result.manifest.revision, 1); assert.strictEqual(a[2].result.manifest.id, id); });
  });
});
test('Save As / copy to an existing file requires overwrite', function () {
  return newFile().then(function (c) {
    return FS.saveFile(c.p, c.file, { mode: 'saveAs' }).then(function (r) { assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'E_EXISTS'); });
  });
});

test('CONFLICT: changed on disk after open -> conflict state, nothing overwritten', function () {
  return newFile().then(function (c) {
    return FS.open(c.file).then(function (a) {          /* two sessions open the same revision */
      c.p.setPad('A', 7, 'sample-02');
      return FS.saveFile(c.p, c.file, { now: '2026-10-07T09:10:00Z' }).then(function (r) { assert.ok(r.ok);
        var theirs = fs.readFileSync(c.file);
        a.project.setPad('A', 8, 'sample-03');
        return FS.saveFile(a.project, c.file).then(function (r2) {
          assert.strictEqual(r2.ok, false); assert.strictEqual(r2.conflict, true); assert.strictEqual(r2.code, 'E_CONFLICT'); assert.strictEqual(r2.reason, 'changed');
          assert.strictEqual(r2.disk.revision, 2); assert.strictEqual(r2.base.revision, 1);
          assert.deepStrictEqual(fs.readFileSync(c.file), theirs, 'disk untouched');
          assert.deepStrictEqual(listDir(c.dir), ['p.spsystem', 'p.spsystem.bak']);
        });
      });
    });
  });
});
test('CONFLICT: file deleted, replaced by another project, or edited externally with same revision', function () {
  return newFile().then(function (c) {
    var f = c.file;
    return FS.saveFile(c.p, f + '.x', { mode: 'saveAs' }).then(function () {
      fs.writeFileSync(f, fs.readFileSync(f + '.x'));                 /* same content: no conflict */
      return FS.saveFile(c.p, f);
    }).then(function (r) { assert.ok(r.ok, JSON.stringify(r)); fs.unlinkSync(f); return FS.saveFile(c.p, f); })
      .then(function (r) { assert.strictEqual(r.reason, 'deleted'); assert.ok(!fs.existsSync(f)); return H.dropProject({ id: 'aaaaaaaa-0000-4000-8000-000000000000' }); })
      .then(function (other) { return FS.saveFile(other, f, { now: '2026-10-07T09:00:00Z' }); })
      .then(function (r) { assert.ok(r.ok); return FS.saveFile(c.p, f); })
      .then(function (r) { assert.strictEqual(r.conflict, true); assert.strictEqual(r.reason, 'other-project'); });
  });
});
test('CONFLICT: external edit that keeps the revision but changes content is still detected', function () {
  return newFile().then(function (c) {
    return FS.open(c.file).then(function (o) {
      return H.dropProject({ id: o.result.manifest.id }).then(function (other) {          /* same id + same revision, different bytes */
        other.manifest.title = 'externally changed';
        var tmp = path.join(c.dir, 'ext.spsystem');
        return FS.saveFile(other, tmp).then(function (r) { assert.ok(r.ok); fs.copyFileSync(tmp, c.file); return FS.saveFile(o.project, c.file); });
      });
    }).then(function (r) { assert.strictEqual(r.conflict, true); assert.strictEqual(r.reason, 'changed'); });
  });
});

/* ---- failure injection: original must stay intact and never go missing ---------------------------------------------------- */
['afterWrite', 'afterFsync', 'beforeBackup', 'beforeRename'].forEach(function (hook) {
  test('crash at ' + hook + ': original untouched, canonical path always present, no stray temp', function () {
    return newFile().then(function (c) {
      var orig = fs.readFileSync(c.file), missing = 0, timer = setInterval(function () { if (!fs.existsSync(c.file)) missing++; }, 1);
      c.p.setPad('A', 9, 'sample-01');
      var hooks = {}; hooks[hook] = function () { throw Object.assign(new Error('simulated power loss'), { code: 'E_SIM' }); };
      return FS.saveFile(c.p, c.file, { hooks: hooks }).then(function (r) {
        clearInterval(timer);
        assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'E_SIM');
        assert.deepStrictEqual(fs.readFileSync(c.file), orig); assert.strictEqual(missing, 0);
        assert.ok(listDir(c.dir).every(function (n) { return n === 'p.spsystem' || n === 'p.spsystem.bak'; }), listDir(c.dir).join());
        return FS.saveFile(c.p, c.file);                                 /* retry succeeds, lock was released */
      }).then(function (r) { assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.revision, 2); });
    });
  });
});
test('the canonical path is never missing during a successful save', function () {
  return newFile().then(function (c) {
    var seen = 0, bad = 0, timer = setInterval(function () { seen++; try { var b = fs.readFileSync(c.file); if (b.length < 100) bad++; } catch (e) { bad++; } }, 0);
    c.p.setPad('A', 9, 'sample-01');
    return FS.saveFile(c.p, c.file).then(function (r) { clearInterval(timer); assert.ok(r.ok); assert.strictEqual(bad, 0); });
  });
});
test('corrupt output is rejected by validation and never replaces the original', function () {
  return newFile().then(function (c) {
    var orig = fs.readFileSync(c.file); c.p.setPad('A', 9, 'sample-01');
    return FS.saveFile(c.p, c.file, { hooks: { afterFsync: function (tmp) { var b = fs.readFileSync(tmp); b[b.length - 30] ^= 0xff; b[b.length - 25] ^= 0xff; fs.writeFileSync(tmp, b.subarray(0, b.length - 40)); } } }).then(function (r) {
      assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'E_VALIDATE'); assert.deepStrictEqual(fs.readFileSync(c.file), orig);
    });
  });
});
test('advisory lock: concurrent save is refused; stale lock from a dead process is taken over', function () {
  return newFile().then(function (c) {
    fs.writeFileSync(c.file + '.lock', JSON.stringify({ pid: process.pid, at: Date.now(), host: os.hostname() }));
    c.p.setPad('A', 9, 'sample-01');
    return FS.saveFile(c.p, c.file).then(function (r) {
      assert.strictEqual(r.code, 'E_LOCKED'); assert.ok(fs.existsSync(c.file + '.lock'), 'someone else\'s lock stays');
      fs.writeFileSync(c.file + '.lock', JSON.stringify({ pid: 999999, at: Date.now(), host: os.hostname() }));
      return FS.saveFile(c.p, c.file);
    }).then(function (r) { assert.ok(r.ok); assert.ok(!fs.existsSync(c.file + '.lock')); });
  });
});
test('recover reports leftovers of an interrupted save and cleans them on request', function () {
  return newFile().then(function (c) {
    fs.writeFileSync(path.join(c.dir, '.p.spsystem.abc123.tmp'), 'half'); fs.writeFileSync(c.file + '.bak.tmp', 'half');
    fs.writeFileSync(c.file + '.lock', JSON.stringify({ pid: 999999, at: 1, host: os.hostname() }));
    return FS.recover(c.file).then(function (r) {
      assert.strictEqual(r.temps.length, 2); assert.strictEqual(r.lock.stale, true); assert.strictEqual(r.canonicalMissing, false);
      return FS.recover(c.file, { cleanup: true });
    }).then(function () { assert.deepStrictEqual(listDir(c.dir), ['p.spsystem']); });
  });
});

/* ---- open: size limits & bad files ---------------------------------------------------- */
test('open() reports problems instead of throwing', function () {
  var dir = tmpdir();
  fs.writeFileSync(path.join(dir, 'junk.spsystem'), 'not a zip at all, sorry');
  return FS.open(path.join(dir, 'junk.spsystem')).then(function (o) { assert.strictEqual(o.result.level, 'CORRUPTED'); assert.strictEqual(o.project, null); return FS.open(path.join(dir, 'missing.spsystem')); })
    .then(function (o) { assert.strictEqual(o.result.code, 'E_NO_FILE'); return FS.open(dir); })
    .then(function (o) { assert.strictEqual(o.result.level, 'CORRUPTED'); });
});
test('too-large project: friendly message from the file adapter', function () {
  return newFile().then(function (c) {
    return FS.open(c.file, { limits: { maxPackageBytes: 1000 } }).then(function (o) { assert.strictEqual(o.result.code, 'E_TOO_LARGE'); assert.strictEqual(o.result.message, 'PROJECT TOO LARGE FOR THIS VERSION OF DROP'); });
  });
});
test('safe extraction writes only inside the target, refuses to overwrite', function () {
  return newFile().then(function (c) {
    var out = path.join(c.dir, 'x');
    return FS.open(c.file).then(function (o) { return FS.extractToDir(o.result.package, out).then(function (w) {
      assert.ok(w.indexOf('manifest.json') >= 0 && w.indexOf('samples/sample-01.wav') >= 0);
      assert.ok(fs.existsSync(path.join(out, 'audio', 'source.wav')));
      return FS.extractToDir(o.result.package, out).then(function () { assert.fail('must not overwrite'); }, function (e) { assert.strictEqual(e.code, 'EEXIST'); });
    }); });
  });
});
test('unchanged owned/unknown entries survive a save byte-for-byte (raw copy-through)', function () {
  return newFile().then(function (c) {
    return FS.open(c.file).then(function (o) {
      var before = {}; o.result.package.entries.forEach(function (e) { before[e.name] = [e.crc, e.csize, e.usize, e.method, e.time, e.date]; });
      o.project.setPad('A', 12, 'sample-01');
      return FS.saveFile(o.project, c.file).then(function (r) { assert.ok(r.ok); return FS.open(c.file); }).then(function (o2) {
        o2.result.package.entries.forEach(function (e) {
          if (/^(manifest|project\/pads)\.json$/.test(e.name)) return;
          assert.deepStrictEqual([e.crc, e.csize, e.usize, e.method, e.time, e.date], before[e.name], e.name);
        });
      });
    });
  });
});
