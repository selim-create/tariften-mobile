'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { inspectAdvisories, REVIEWED } = require('./check-known-advisories.cjs');

function report() {
  const vulnerabilities = {};
  for (const [id, name] of Object.entries(REVIEWED)) {
    vulnerabilities[name] = {
      name,
      severity: name === 'braces' || name === 'node-forge' ? 'high' : 'moderate',
      via: [{
        source: 1234,
        name,
        severity: name === 'braces' || name === 'node-forge' ? 'high' : 'moderate',
        url: 'https://github.com/advisories/' + id,
      }],
    };
  }
  vulnerabilities['metro-file-map'] = { name: 'metro-file-map', severity: 'high', via: ['braces'] };
  return {
    metadata: { vulnerabilities: { critical: 0, high: 3, moderate: 2 } },
    vulnerabilities,
  };
}

test('allows only reviewed direct GHSA IDs and inherited package-name entries', () => {
  const result = inspectAdvisories(report());
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.ids.length, Object.keys(REVIEWED).length);
});

test('rejects a new advisory on an existing high-risk package without changing counts', () => {
  const input = report();
  input.vulnerabilities.braces.via.push({
    source: 7890,
    name: 'braces',
    severity: 'high',
    url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
  });
  const result = inspectAdvisories(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /NEW UNREVIEWED ADVISORY GHSA-aaaa-bbbb-cccc/);
});

test('rejects a new moderate advisory even when the total stays unchanged', () => {
  const input = report();
  input.vulnerabilities['sprintf-js'].via = [{
    source: 987,
    name: 'sprintf-js',
    url: 'https://github.com/advisories/GHSA-abcd-efgh-ijkl',
  }];
  assert.equal(inspectAdvisories(input).ok, false);
});

test('rejects missing root details and non-GHSA advisory links', () => {
  const noVia = report();
  noVia.vulnerabilities.braces.via = [];
  assert.match(inspectAdvisories(noVia).errors.join('; '), /missing advisory details/);

  const unknownUrl = report();
  unknownUrl.vulnerabilities['node-forge'].via[0].url = 'https://example.invalid/advisory';
  assert.equal(inspectAdvisories(unknownUrl).ok, false);
});

test('does not silently accept a GHSA assigned to the wrong package', () => {
  const input = report();
  input.vulnerabilities.braces.via[0].name = 'another-package';
  assert.match(inspectAdvisories(input).errors.join('; '), /unexpected root/);
});

test('fails closed on missing or invalid npm audit evidence', () => {
  assert.equal(inspectAdvisories(null).ok, false);
  assert.equal(inspectAdvisories({ metadata: { vulnerabilities: {} }, vulnerabilities: {} }).ok, false);
  const noAdvisories = {
    metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 0 } },
    vulnerabilities: { newPackage: { severity: 'high', via: ['other-package'] } },
  };
  assert.equal(inspectAdvisories(noAdvisories).ok, false);
});

test('accepts a fully patched/clean dependency tree without advisory records', () => {
  const clean = { metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 0 } }, vulnerabilities: {} };
  assert.equal(inspectAdvisories(clean).ok, true);
});
