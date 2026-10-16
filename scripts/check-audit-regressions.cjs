'use strict';

const fs = require('node:fs');
const { resolve } = require('node:path');

/**
 * Last reviewed clean npm ci + npm audit --omit=dev --json:
 * https://github.com/selim-create/tariften-mobile/actions/runs/38867798214
 *
 * This is a maximum accepted *regression baseline*, not an assertion that
 * existing vulnerabilities are safe, fixed, or excluded from the mobile app.
 * Review any increase or new high-severity affected package before merging.
 */
const BASELINE = Object.freeze({
  high: 21,
  moderate: 14,
  highPackages: Object.freeze([
    '@expo/cli',
    '@expo/code-signing-certificates',
    '@expo/metro',
    '@expo/metro-config',
    '@jest/environment',
    '@jest/fake-timers',
    '@jest/transform',
    '@react-native/community-cli-plugin',
    'babel-jest',
    'braces',
    'expo',
    'jest-environment-node',
    'jest-haste-map',
    'jest-message-util',
    'metro',
    'metro-config',
    'metro-file-map',
    'metro-transform-worker',
    'micromatch',
    'node-forge',
    'react-native',
  ]),
});

function checkAuditRegression(report) {
  const errors = [];
  const summary = report && report.metadata && report.metadata.vulnerabilities;
  const entries = report && report.vulnerabilities;
  if (
    !summary ||
    !entries ||
    typeof entries !== 'object' ||
    Array.isArray(entries) ||
    !['high', 'moderate', 'critical'].every(
      (key) => Number.isInteger(summary[key]) && summary[key] >= 0
    )
  ) {
    return { ok: false, errors: ['Missing or malformed npm audit vulnerability data.'] };
  }

  const highNames = Object.entries(entries)
    .filter(([, item]) => item && item.severity === 'high')
    .map(([name]) => name)
    .sort();
  const criticalNames = Object.entries(entries)
    .filter(([, item]) => item && item.severity === 'critical')
    .map(([name]) => name)
    .sort();
  const moderateNames = Object.entries(entries)
    .filter(([, item]) => item && item.severity === 'moderate')
    .map(([name]) => name);

  if (highNames.length !== summary.high || moderateNames.length !== summary.moderate || criticalNames.length !== summary.critical) {
    errors.push('npm audit summary and per-package severity counts disagree.');
  }
  if (summary.critical !== 0) {
    errors.push('Critical vulnerabilities detected: ' + criticalNames.join(', '));
  }
  if (summary.high > BASELINE.high) {
    errors.push('High findings increased: ' + summary.high + ' > ' + BASELINE.high);
  }
  if (summary.moderate > BASELINE.moderate) {
    errors.push('Moderate findings increased: ' + summary.moderate + ' > ' + BASELINE.moderate);
  }
  const acceptedNames = new Set(BASELINE.highPackages);
  const unreviewedHigh = highNames.filter((name) => !acceptedNames.has(name));
  if (unreviewedHigh.length > 0) {
    errors.push('New/unreviewed high-severity affected packages: ' + unreviewedHigh.join(', '));
  }

  return {
    ok: errors.length === 0,
    errors,
    current: { critical: summary.critical, high: summary.high, moderate: summary.moderate },
    baseline: { high: BASELINE.high, moderate: BASELINE.moderate },
  };
}

if (require.main === module) {
  const reportFile = process.argv[2];
  if (!reportFile) {
    console.error('Usage: node scripts/check-audit-regressions.cjs npm-audit-production.json');
    process.exitCode = 1;
  } else {
    try {
      const report = JSON.parse(fs.readFileSync(resolve(reportFile), 'utf8'));
      const result = checkAuditRegression(report);
      console.log('Production audit regression review:', JSON.stringify(result));
      if (!result.ok) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error('Cannot evaluate production npm audit:', error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { BASELINE, checkAuditRegression };
