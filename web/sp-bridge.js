/* SP SYSTEM — DROP runtime state -> project model. Pure data (no DOM, no file system), shared by the browser
   (download a .spsystem) and the Electron main process (save + Open in LEARN).

   payload: { fileName, mode: 'transient'|'beats'|'equal'|'manual', duration, sampleRate, channels,
              markers: [{time}], grid: {bpm, offset, div, show, detected},
              sourceBytes: Uint8Array, sourceExt, slices: [{start, end, wav: Uint8Array}], version, now } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sp-project.js'), require('./sp-package.js'));
  else root.SPBridge = factory(root.SPProject, root.SPPackage);
})(typeof self !== 'undefined' ? self : this, function (SPProject, SPPackage) {
  'use strict';

  var MODE = { transient: 'transient', beats: 'beat', beat: 'beat', equal: 'equal', manual: 'manual' };

  function titleOf(fileName) { return String(fileName || 'Untitled').replace(/\.[^.\/]+$/, '').slice(0, 120) || 'Untitled'; }

  /* New portable project from the loaded track (async: hashes the source). */
  function create(payload) {
    return SPProject.sha256(payload.sourceBytes).then(function (h) {
      return SPProject.create({ title: titleOf(payload.fileName), filename: payload.fileName, durationSeconds: payload.duration, sampleRate: payload.sampleRate,
        channels: payload.channels, mode: 'portable', audio: payload.sourceBytes, audioExt: payload.sourceExt, sha256: h, version: payload.version, now: payload.now });
    });
  }

  /* Apply the current DROP state to a project (new or earlier-created). Returns {ok, ...} or {ok:false, code}. */
  function sync(project, payload) {
    var g = payload.grid || {};
    if (g.bpm > 0) {
      project.applyTempo({ bpm: g.bpm, beatOffsetSeconds: g.offset || 0, userSet: !g.detected, now: payload.now });
      project.setGrid({ div: g.div, show: g.show });
    }
    var r = project.syncChopsFromMarkers(payload.markers, payload.duration, { mode: MODE[payload.mode] || 'manual', now: payload.now });
    if (!r.ok) return r;
    var chops = project.list('chops'), chain = Promise.resolve();
    if (chops.length !== payload.slices.length) return { ok: false, code: 'E_SLICE_MISMATCH' };
    chops.forEach(function (chop, i) {
      var sl = payload.slices[i];
      if (!project.needsRender(chop, payload.renderKey)) return;
      chain = chain.then(function () {
        return project.putSample({ chop: chop, wav: sl.wav, name: chop.name || (titleOf(payload.fileName) + ' ' + (i + 1)), renderKey: payload.renderKey });
      });
    });
    return chain.then(function () {
      project.pruneOrphanSamples();
      project.ensurePads();
      return { ok: true, chops: chops.length, added: r.added, removed: r.removed };
    });
  }

  return { create: create, sync: sync, titleOf: titleOf };
});
