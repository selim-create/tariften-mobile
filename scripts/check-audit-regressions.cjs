'use strict';

const fs = require('node:fs');
const { resolve } = require('node:path');

/**
 * Last reviewed clean npm ci + npm audit --omit=dev --json:
 * https://github.com/selim-create/tariften-mobile/actions/runs/38870826360
 *
 * This is a maximum accepted *regression baseline*, not an assertion that
 * existing vulnerabilities are safe, fixed, or excluded from the mobile app.
 * Review any increase or new high-severity affected package before merging.
 *
 * 2026-10-21 review: expo-share-intent (Paylaş → Tariften) is listed only
 * because npm attributes its peer `expo` advisories to it ("via": ["expo"]).
 * It adds no advisory ID of its own (check-known-advisories still passes).
 *
 * 2026-10-22 review (P25, chore/mobile-security-eas-20261022): fresh npm ci +
 * npm audit --omit=dev still reports 22 high / 8 moderate / 0 critical from the
 * same four GHSA roots. None has a semver-compatible patched release inside
 * Expo SDK 55 (braces, node-forge, sprintf-js: no patch published at all;
 * decode-uri-component: patch is ESM-only, query-string@7 is CommonJS). See
 * MOBILE_SECURITY_ADVISORY_TRIAGE_2026_10_16.md "P25" for the per-advisory
 * table. Moderate affected package NAMES are now allowlisted too, so a new
 * moderate package cannot slip in by replacing a removed one at equal count.
 */
const BASELINE = Object.freeze({
  high: 22,
  moderate: 8,
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
    'expo-share-intent',
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
  moderatePackages: Object.freeze([
    '@istanbuljs/load-nyc-config',
    'argparse',
    'babel-plugin-istanbul',
    'decode-uri-component',
    'expo-router',
    'js-yaml',
    'query-string',
    'sprintf-js',
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
  const acceptedModerate = new Set(BASELINE.moderatePackages);
  const unreviewedModerate = moderateNames.filter((name) => !acceptedModerate.has(name)).sort();
  if (unreviewedModerate.length > 0) {
    errors.push('New/unreviewed moderate-severity affected packages: ' + unreviewedModerate.join(', '));
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
