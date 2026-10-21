'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

// xcode@4 (Expo SDK 55.0.32+) generates ids with node:crypto and has no uuid
// dependency; xcode@3 must resolve the patched uuid 11.1.1 (package.json override).
const xcodePackage = require('xcode/package.json');
const xcodeUsesUuid = Boolean(xcodePackage.dependencies && xcodePackage.dependencies.uuid);

test('xcode has no uuid dependency, or uses the patched CommonJS-compatible release', () => {
  if (!xcodeUsesUuid) {
    assert.ok(Number(xcodePackage.version.split('.')[0]) >= 4, 'only xcode@4+ may drop uuid');
    return;
  }
  const xcodeDirectory = path.dirname(require.resolve('xcode'));
  const uuidPackagePath = require.resolve('uuid/package.json', { paths: [xcodeDirectory] });
  const uuidPackage = require(uuidPackagePath);
  assert.equal(uuidPackage.version, '11.1.1');

  const uuid = require(require.resolve('uuid', { paths: [xcodeDirectory] }));
  assert.equal(typeof uuid.v4, 'function');

  const v4 = uuid.v4();
  assert.match(v4, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
});

test('xcode generates valid unique 24-character uppercase PBX identifiers', () => {
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

test('patched uuid rejects out-of-range caller-supplied output buffers', { skip: !xcodeUsesUuid && 'xcode no longer depends on uuid' }, () => {
  const xcodeDirectory = path.dirname(require.resolve('xcode'));
  const uuid = require(require.resolve('uuid', { paths: [xcodeDirectory] }));
  const buffer = new Uint8Array(8);
  assert.throws(
    () => uuid.v5('tariften', uuid.v5.DNS, buffer, 4),
    RangeError
  );
});
