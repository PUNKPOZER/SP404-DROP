/* SP SYSTEM — minimal JSON-Schema validator (the subset the canonical schemas use).
   Supported: $ref (relative "<file>#/json/pointer"), type (string|array; integer), enum, const,
   pattern, minimum/maximum/exclusiveMinimum, minLength/maxLength, required, properties, items,
   additionalProperties (bool|schema), allOf, anyOf, format "date-time". Unknown keywords are ignored
   (annotations: description, title, $schema, $id, $defs). Dependency-free, ES5 style. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SPValidate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATE_TIME = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
  function isType(v, t) {
    var a = typeOf(v);
    if (t === 'integer') return a === 'number' && isFinite(v) && Math.floor(v) === v;
    if (t === 'number') return a === 'number' && isFinite(v);
    return a === t;
  }
  function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function resolve(schemas, ref, baseFile) {
    var hash = ref.indexOf('#');
    var file = hash < 0 ? ref : ref.slice(0, hash);
    var ptr = hash < 0 ? '' : ref.slice(hash + 1);
    var name = file || baseFile;
    var node = schemas[name];
    if (!node) throw new Error('unresolved $ref: ' + ref);
    if (ptr) {
      var parts = ptr.split('/').slice(1);
      for (var i = 0; i < parts.length; i++) {
        node = node && node[parts[i].replace(/~1/g, '/').replace(/~0/g, '~')];
        if (node === undefined) throw new Error('unresolved $ref: ' + ref);
      }
    }
    return { node: node, file: name };
  }

  /* validate(schemas, rootName, data) -> [{path, keyword, message}] */
  function validate(schemas, rootName, data) {
    var errors = [];
    function err(path, keyword, message) { errors.push({ path: path || '/', keyword: keyword, message: message }); }

    function check(schema, v, path, file) {
      if (schema === true || schema === undefined) return true;
      if (schema === false) { err(path, 'false', 'not allowed'); return false; }
      var before = errors.length;
      if (schema.$ref) {
        var r = resolve(schemas, schema.$ref, file);
        check(r.node, v, path, r.file);
      }
      if (schema.allOf) schema.allOf.forEach(function (s) { check(s, v, path, file); });
      if (schema.anyOf) {
        var ok = schema.anyOf.some(function (s) {
          var save = errors.length; check(s, v, path, file);
          if (errors.length === save) return true;
          errors.length = save; return false;
        });
        if (!ok) err(path, 'anyOf', 'matches none of the allowed alternatives');
      }
      if (schema.type !== undefined) {
        var types = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (!types.some(function (t) { return isType(v, t); })) {
          err(path, 'type', 'expected ' + types.join('|') + ', got ' + typeOf(v));
          return false;
        }
      }
      if (schema.const !== undefined && !deepEq(v, schema.const)) err(path, 'const', 'must equal ' + JSON.stringify(schema.const));
      if (schema.enum && !schema.enum.some(function (e) { return deepEq(e, v); })) err(path, 'enum', 'must be one of ' + JSON.stringify(schema.enum));
      var t = typeOf(v);
      if (t === 'string') {
        if (schema.minLength !== undefined && v.length < schema.minLength) err(path, 'minLength', 'shorter than ' + schema.minLength);
        if (schema.maxLength !== undefined && v.length > schema.maxLength) err(path, 'maxLength', 'longer than ' + schema.maxLength);
        if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(v)) err(path, 'pattern', 'does not match ' + schema.pattern);
        if (schema.format === 'date-time' && (!DATE_TIME.test(v) || isNaN(Date.parse(v.replace(' ', 'T'))))) err(path, 'format', 'not an RFC 3339 date-time');
      } else if (t === 'number') {
        if (schema.minimum !== undefined && v < schema.minimum) err(path, 'minimum', 'below ' + schema.minimum);
        if (schema.maximum !== undefined && v > schema.maximum) err(path, 'maximum', 'above ' + schema.maximum);
        if (schema.exclusiveMinimum !== undefined && v <= schema.exclusiveMinimum) err(path, 'exclusiveMinimum', 'must be above ' + schema.exclusiveMinimum);
      } else if (t === 'array') {
        if (schema.items) for (var i = 0; i < v.length; i++) check(schema.items, v[i], path + '/' + i, file);
      } else if (t === 'object') {
        if (schema.required) schema.required.forEach(function (k) {
          if (!Object.prototype.hasOwnProperty.call(v, k)) err(path + '/' + k, 'required', 'missing required property "' + k + '"');
        });
        var props = schema.properties || {};
        Object.keys(v).forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(props, k)) check(props[k], v[k], path + '/' + k, file);
          else if (schema.additionalProperties === false) err(path + '/' + k, 'additionalProperties', 'unexpected property "' + k + '"');
          else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') check(schema.additionalProperties, v[k], path + '/' + k, file);
        });
      }
      return errors.length === before;
    }

    var top = schemas[rootName];
    if (!top) throw new Error('unknown schema: ' + rootName);
    check(top, data, '', rootName);
    return errors;
  }

  return { validate: validate };
});
