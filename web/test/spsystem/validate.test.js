'use strict';
var test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), cp = require('child_process');
var S = require('../../sp-schemas.js'), V = require('../../sp-validate.js');
var root = path.join(__dirname, '..', '..', '..');

test('bundled schemas are byte-for-byte the vendored snapshot', function () {
  var dir = path.join(root, 'sp-system-spec', 'schemas');
  fs.readdirSync(dir).forEach(function (f) { assert.deepStrictEqual(S.schemas[f], JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f); });
  assert.strictEqual(Object.keys(S.schemas).length, fs.readdirSync(dir).length);
});
test('SPEC_HASH and generated bundle are current', function () {
  cp.execFileSync('node', [path.join(root, 'scripts', 'sync-spec.js'), '--check']);
  cp.execFileSync('node', [path.join(root, 'scripts', 'gen-schemas.js'), '--check']);
});

var MAP = { 'manifest.json': 'manifest', 'project/chops.json': 'chops', 'project/samples.json': 'samples', 'project/pads.json': 'pads', 'project/loops.json': 'loops',
            'analysis/track.json': 'analysis', 'learn/recipe.json': 'recipe', 'learn/progress.json': 'progress', 'learn/requirements.json': 'requirements' };
test('every JSON file of every canonical example validates', function () {
  var n = 0;
  ['complete-project', 'drop-basic', 'learn-analysis'].forEach(function (ex) {
    Object.keys(MAP).forEach(function (rel) {
      var f = path.join(root, 'sp-system-spec', 'examples', ex, rel);
      if (!fs.existsSync(f)) return;
      var errs = V.validate(S.schemas, MAP[rel] + '.schema.json', JSON.parse(fs.readFileSync(f, 'utf8')));
      assert.deepStrictEqual(errs, [], ex + '/' + rel); n++;
    });
  });
  assert.ok(n >= 12);
});
test('invalid variants are rejected', function () {
  var bad = function (schema, data, kw) { var e = V.validate(S.schemas, schema, data); assert.ok(e.some(function (x) { return x.keyword === kw; }), schema + ' ' + JSON.stringify(e)); };
  bad('pads.schema.json', { schemaVersion: 1, assignments: [{ bank: 'a', pad: 1, sampleId: null }] }, 'pattern');
  bad('pads.schema.json', { schemaVersion: 1, assignments: [{ bank: 'A', pad: 17, sampleId: null }] }, 'maximum');
  bad('pads.schema.json', { schemaVersion: 1, assignments: [{ bank: 'A', pad: 1 }] }, 'required');
  bad('chops.schema.json', { schemaVersion: 1, chops: [{ id: 'chop-01', startSeconds: -1, endSeconds: 1, type: 'manual' }] }, 'minimum');
  bad('chops.schema.json', { schemaVersion: 1, chops: [{ id: 'Chop 1', startSeconds: 0, endSeconds: 1, type: 'manual' }] }, 'pattern');
  bad('chops.schema.json', { schemaVersion: 1, chops: [{ id: 'chop-1', startSeconds: 0, endSeconds: 1, type: 'equal' }] }, 'enum');
  bad('samples.schema.json', { schemaVersion: 1, samples: [{ id: 's', file: '../x.wav', durationSeconds: 1, sampleRate: 48000, bitDepth: 16, channels: 1 }] }, 'pattern');
  bad('samples.schema.json', { schemaVersion: 1, samples: [{ id: 's', file: 'a.wav', durationSeconds: 1, sampleRate: 48000, bitDepth: 12, channels: 1 }] }, 'enum');
  bad('manifest.schema.json', { format: 'x', formatVersion: 1, id: 'nope', createdBy: 'a', createdAt: 'yesterday' }, 'const');
  bad('manifest.schema.json', { format: 'sp-system', formatVersion: 1, id: '6f1c2b9e-3a44-4d0a-9b1e-2c7d5a8f0e11', createdBy: 'a', createdAt: 'yesterday' }, 'format');
  bad('manifest.schema.json', { format: 'sp-system', formatVersion: 1, id: '6f1c2b9e-3a44-4d0a-9b1e-2c7d5a8f0e11', createdBy: 'a', createdAt: '2026-01-01T00:00:00Z', tempo: { bpm: 0 } }, 'exclusiveMinimum');
});
test('additional properties are allowed everywhere (forward compatibility)', function () {
  var m = { format: 'sp-system', formatVersion: 1, id: '6f1c2b9e-3a44-4d0a-9b1e-2c7d5a8f0e11', createdBy: 'a', createdAt: '2026-01-01T00:00:00Z', 'x-future': { a: 1 }, source: { zzz: 1 } };
  assert.deepStrictEqual(V.validate(S.schemas, 'manifest.schema.json', m), []);
});
