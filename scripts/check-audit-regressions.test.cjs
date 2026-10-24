'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BASELINE, checkAuditRegression } = require('./check-audit-regressions.cjs');

function baselineReport() {
  const vulnerabilities = {};
  for (const name of BASELINE.highPackages) {
    vulnerabilities[name] = { severity: 'high', via: [] };
  }
  for (const name of BASELINE.moderatePackages) {
    vulnerabilities[name] = { severity: 'moderate', via: [] };
  }
  return {
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: BASELINE.moderate,
        high: BASELINE.high,
        critical: 0,
        total: BASELINE.high + BASELINE.moderate,
      },
    },
    vulnerabilities,
  };
}

test('accepts the reviewed high / moderate baseline (23 / 8, zod added 2026-10-24)', () => {
  assert.equal(checkAuditRegression(baselineReport()).ok, true);
});

test('accepts improvements when a previously known high finding disappears', () => {
  const report = baselineReport();
  delete report.vulnerabilities.braces;
  report.metadata.vulnerabilities.high--;
  assert.equal(checkAuditRegression(report).ok, true);
});

test('rejects a new high package even if an old high was removed', () => {
  const report = baselineReport();
  delete report.vulnerabilities.braces;
  report.vulnerabilities['unknown-risk-package'] = { severity: 'high', via: [] };
  const result = checkAuditRegression(report);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /unknown-risk-package/);
});

test('baseline lists exactly as many moderate packages as the moderate budget', () => {
  assert.equal(BASELINE.moderatePackages.length, BASELINE.moderate);
  assert.equal(BASELINE.highPackages.length, BASELINE.high);
});

test('rejects a new moderate package even if an old moderate was removed', () => {
  const report = baselineReport();
  delete report.vulnerabilities['sprintf-js'];
  report.vulnerabilities['unknown-moderate-package'] = { severity: 'moderate', via: [] };
  const result = checkAuditRegression(report);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /moderate-severity affected packages: unknown-moderate-package/);
});

test('rejects growth in high or moderate counts', () => {
  const high = baselineReport();
  high.vulnerabilities['new-high'] = { severity: 'high', via: [] };
  high.metadata.vulnerabilities.high++;
  assert.match(checkAuditRegression(high).errors.join(' '), /High findings increased/);

  const moderate = baselineReport();
  moderate.vulnerabilities['new-moderate'] = { severity: 'moderate', via: [] };
  moderate.metadata.vulnerabilities.moderate++;
  assert.match(checkAuditRegression(moderate).errors.join(' '), /Moderate findings increased/);
});

test('rejects critical vulnerabilities and summary tampering', () => {
  const critical = baselineReport();
  critical.vulnerabilities['new-critical'] = { severity: 'critical', via: [] };
  critical.metadata.vulnerabilities.critical++;
  assert.equal(checkAuditRegression(critical).ok, false);

  const mismatch = baselineReport();
  mismatch.metadata.vulnerabilities.high = 0;
  assert.match(checkAuditRegression(mismatch).errors.join(' '), /disagree/);
});

test('fails closed for missing or malformed audit report', () => {
  assert.equal(checkAuditRegression(null).ok, false);
  assert.equal(checkAuditRegression({ metadata: { vulnerabilities: {} } }).ok, false);
  assert.equal(checkAuditRegression({ metadata: { vulnerabilities: { high: 0, moderate: 0, critical: 0 } }, vulnerabilities: [] }).ok, false);
});
