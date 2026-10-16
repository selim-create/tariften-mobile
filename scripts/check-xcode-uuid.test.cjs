'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

test('xcode uses the patched CommonJS-compatible uuid release', () => {
  const xcodeDirectory = path.dirname(require.resolve('xcode'));
  const uuidPackagePath = require.resolve('uuid/package.json', { paths: [xcodeDirectory] });
  const uuidPackage = require(uuidPackagePath);
  assert.equal(uuidPackage.version, '11.1.1');

  const uuid = require(require.resolve('uuid', { paths: [xcodeDirectory] }));
  assert.equal(typeof uuid.v4, 'function');

  const v4 = uuid.v4();
  assert.match(v4, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
});

test('xcode@3 generates valid unique 24-character uppercase PBX identifiers', () => {
  const xcode = require('xcode');
  const project = xcode.project(path.join(__dirname, 'does-not-exist.pbxproj'));
  project.hash = { project: { objects: {} } };

  const first = project.generateUuid();
  const second = project.generateUuid();
  assert.match(first, /^[A-F0-9]{24}$/);
  assert.match(second, /^[A-F0-9]{24}$/);
  assert.notEqual(first, second);

  // Exercise the collision branch without creating a real Xcode project.
  project.hash.project.objects = { PBXFileReference: { [first]: { isa: 'PBXFileReference' } } };
  assert.notEqual(project.generateUuid(), first);
});

test('patched uuid rejects out-of-range caller-supplied output buffers', () => {
  const uuid = require('uuid');
  const buffer = new Uint8Array(8);
  assert.throws(
    () => uuid.v5('tariften', uuid.v5.DNS, buffer, 4),
    RangeError
  );
});
