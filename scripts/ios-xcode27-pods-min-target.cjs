#!/usr/bin/env node
/**
 * Xcode 27 refuses generated CocoaPods targets with iOS 9/10/etc.
 * Normalize only the local generated Pods project after pod install.
 *
 * Plain Node on purpose: the earlier Ruby version needed the `xcodeproj` gem,
 * which only exists inside CocoaPods' own Ruby (Homebrew/rbenv installs), so
 * `ruby script.rb` failed with "cannot load such file -- xcodeproj".
 * This deliberately does not modify third-party package source, app settings,
 * or an existing production native project.
 */
const fs = require('fs');
const path = require('path');

const MINIMUM = '15.1';
const projectDir = process.argv[2];
if (!projectDir) { console.error('Pods project path missing'); process.exit(1); }
if (!projectDir.replace(/\/+$/, '').endsWith('/ios/Pods/Pods.xcodeproj')) {
  console.error('Only generated ios/Pods project may be changed'); process.exit(1);
}
const pbxproj = path.join(projectDir, 'project.pbxproj');
if (!fs.existsSync(pbxproj)) { console.error(`Pods project not found: ${projectDir}`); process.exit(1); }

/** Numeric compare of dotted versions ("9.0" < "15.1", "15.10" > "15.1"). */
function below(version, minimum) {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0; const y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

const source = fs.readFileSync(pbxproj, 'utf8');
let updated = 0;
const result = source.replace(/(IPHONEOS_DEPLOYMENT_TARGET = )("?)([^";\s]+)\2;/g, (match, key, quote, value) => {
  if (!/^\d+(\.\d+)*$/.test(value)) {
    console.error(`Unknown deployment target '${value}' in Pods project`); process.exit(1);
  }
  if (!below(value, MINIMUM)) return match;
  updated += 1;
  return `${key}${MINIMUM};`;
});

if (updated > 0) fs.writeFileSync(pbxproj, result);
console.log(`Xcode 27 CocoaPods simulator target check: ${updated} configurations updated to iOS ${MINIMUM}`);
