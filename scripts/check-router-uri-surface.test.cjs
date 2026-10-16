'use strict';

/**
 * Expo Router SDK 55 uses query-string@7, which pulls in the vulnerable
 * decode-uri-component@0.2.x. Upgrading the decoder to 0.5.0 is NOT a safe
 * drop-in fix: the patched release is ESM-only, but query-string@7 expects
 * a CommonJS function via require().
 *
 * This test does not mark the advisory as fixed. It fails CI if the installed
 * Expo Router build starts calling query-string's vulnerable parsing helpers
 * or if the current CommonJS integration breaks.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const routerDir = path.join(repoRoot, 'node_modules', 'expo-router');
const forkDir = path.join(routerDir, 'build', 'fork');

function collectJavaScriptFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJavaScriptFiles(fullPath));
    } else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

test('query-string@7 still works with the installed decoder (CJS regression)', () => {
  const router = require(path.join(routerDir, 'package.json'));
  assert.match(router.version, /^55\./, 'Review this guard when upgrading Expo SDK');

  const queryString = require('query-string');
  const encoded = queryString.stringify(
    { recipe: 'mercimek çorbası', page: '2' },
    { sort: false }
  );
  assert.equal(encoded, 'recipe=mercimek%20%C3%A7orbas%C4%B1&page=2');
  const parsed = queryString.parse(encoded);
  assert.equal(parsed.recipe, 'mercimek çorbası');
  assert.equal(parsed.page, '2');
});

test('Expo Router SDK 55 only stringifies query-string; it does not parse it', () => {
  assert.ok(fs.existsSync(forkDir), 'Expo Router built fork sources are missing');
  const files = collectJavaScriptFiles(path.join(routerDir, 'build'));
  let stringifyCalls = 0;
  let importingFiles = 0;

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    const activeLines = code
      .split(/\r?\n/)
      .filter((line) => !/^\s*(?:\/\/|\*|\/\*|\*\/)/.test(line))
      .join('\n');
    const importsQueryString = /(?:require\s*\(\s*['"]query-string['"]|from\s+['"]query-string['"])/.test(activeLines);
    if (!importsQueryString) continue;

    importingFiles++;
    // Fail closed if Expo Router changes its alias or module-loading syntax.
    assert.match(
      activeLines,
      /\bqueryString\s*=.*require\s*\(\s*['"]query-string['"]/,
      `Review query-string import style in ${path.relative(repoRoot, file)}`
    );
    const methods = Array.from(activeLines.matchAll(/\bqueryString\s*\.\s*([a-zA-Z]+)\s*\(/g), (match) => match[1]);
    assert.ok(methods.length > 0, `Unrecognized query-string usage in ${path.relative(repoRoot, file)}`);

    for (const method of methods) {
      assert.equal(method, 'stringify', `Unexpected query-string method ${method} in ${path.relative(repoRoot, file)}: decoder attack surface must be reassessed`);
      stringifyCalls++;
    }
  }

  assert.ok(importingFiles > 0, 'No Expo Router query-string imports found: review SDK/guard');
  assert.ok(stringifyCalls > 0, 'No stringify usage found: review SDK/guard');
});
