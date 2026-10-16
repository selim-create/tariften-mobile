'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Reviewed GHSA IDs for the post-UUID (PR #38) Expo SDK 55 npm audit baseline.
 * This is a REGRESSION ALLOWLIST, not a vulnerability suppression mechanism:
 * all existing findings still appear in the full npm audit JSON artifact.
 *
 * When a new advisory affects a package that was already high-risk, the
 * package-name/count gate cannot necessarily detect it. This checker can.
 * Only add a GHSA after reviewing its affected range, exposure and mitigation.
 */
const REVIEWED = Object.freeze({
  'GHSA-vfj7-8cjw-p6xm': 'braces',
  'GHSA-86w9-cpqp-85rv': 'node-forge',
  'GHSA-vcc3-ghjq-m6fr': 'decode-uri-component',
  'GHSA-hp3w-g68c-fv3c': 'sprintf-js',
});

function inspectAdvisories(report) {
  const errors = [];
  const vulnerabilities = report?.vulnerabilities;
  const totals = report?.metadata?.vulnerabilities;
  if (
    !vulnerabilities ||
    typeof vulnerabilities !== 'object' ||
    Array.isArray(vulnerabilities) ||
    !totals ||
    !['critical', 'high', 'moderate'].every(
      (key) => Number.isInteger(totals[key]) && totals[key] >= 0
    )
  ) {
    return { ok: false, errors: ['Invalid or incomplete npm audit report.'], ids: [] };
  }

  const seen = new Set();
  for (const [affectedPackage, entry] of Object.entries(vulnerabilities)) {
    if (!entry || !Array.isArray(entry.via)) {
      errors.push('Invalid advisory chain for ' + affectedPackage);
      continue;
    }
    let directAdvisories = 0;
    for (const via of entry.via) {
      if (typeof via === 'string') continue; // npm: inherited advisory via another package.
      if (!via || typeof via !== 'object') {
        errors.push('Unrecognized advisory entry for ' + affectedPackage);
        continue;
      }

      // The npm audit JSON schema supplies one GitHub advisory URL per root via.
      const match = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+)\/?$/i.exec(via.url || '');
      if (!match) {
        errors.push('Unreviewed/missing advisory URL in ' + affectedPackage + ': ' + String(via.url));
        continue;
      }

      const id = match[1];
      seen.add(id);
      directAdvisories++;
      if (!Object.hasOwn(REVIEWED, id)) {
        errors.push('NEW UNREVIEWED ADVISORY ' + id + ' in ' + affectedPackage);
        continue;
      }
      if (via.name && via.name !== REVIEWED[id]) {
        errors.push('Advisory ' + id + ' moved to unexpected root ' + via.name);
      }
    }

    // Do not silently accept a direct root with an empty/missing advisory chain.
    if (Object.values(REVIEWED).includes(affectedPackage) && directAdvisories === 0) {
      errors.push('Known vulnerable root missing advisory details: ' + affectedPackage);
    }
  }

  if (totals.high + totals.moderate + totals.critical > 0 && seen.size === 0) {
    errors.push('No GHSA advisory records found despite npm audit vulnerability counts.');
  }

  return { ok: errors.length === 0, errors, ids: [...seen].sort() };
}

if (require.main === module) {
  const file = process.argv[2];
  try {
    if (!file) throw new Error('Usage: node scripts/check-known-advisories.cjs npm-audit-production.json');
    const report = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const result = inspectAdvisories(report);
    console.log('Reviewed npm advisory identities:', JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error('Cannot validate npm advisory identities:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { REVIEWED, inspectAdvisories };
