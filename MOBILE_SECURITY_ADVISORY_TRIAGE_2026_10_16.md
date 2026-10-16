# Mobile security advisory triage — 2026-10-16

## Historical baseline (before Firebase removal)

- Baseline: `main` at `9de2ea266cd809900a611b9aceca7105de63e165`, Expo SDK 55.0.31, Expo Router 55.0.18, React Native 0.83.10.
- Evidence: GitHub Actions job [38808883703](https://github.com/selim-create/tariften-mobile/actions/runs/38808883703), archived `mobile-production-npm-audit` JSON.
- `npm audit --omit=dev` snapshot: **39 vulnerability entries** (0 critical, 25 high, 14 moderate). This counts *dependency nodes*, not 39 separately proven exploitable app paths.
- Vulnerability entries trace back to **six directly vulnerable transitive packages / seven advisories**, with secondary entries propagated through dependent packages.
- `--omit=dev` audits the production dependency **installation tree**, NOT only JavaScript reachable in an iOS/Android release bundle. Expo CLI, Metro, React Native Jest and iOS build tooling can appear in this scan because they are depended on through production-listed Expo/React Native packages.
- This historical snapshot is not a guarantee that the app is free of vulnerabilities. CI blocks **new critical** findings but intentionally reports, rather than ignores, high/moderate advisories. See the updated post-removal audit below.

## Root advisories and treatment

| Source package in lockfile | Root advisory | Dependency path / scope | Treatment |
| --- | --- | --- | --- |
| `@grpc/grpc-js@1.9.16` | [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) | `firebase` → `@firebase/firestore` → gRPC; also propagates through `firestore-compat`. The current mobile source imports `firebase/app` and `firebase/analytics`, **not** `firebase/firestore`. | High priority: investigate supported Firebase SDK update or safe, tested dependency adjustment; do not force incompatible gRPC peer/sub-dependency range or downgrade Firebase to 9. |
| `braces@3.0.3` | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `micromatch` → Metro/Jest/build tools; deeply nested attacker-controlled glob patterns can exhaust stack. | No patched release listed on 2026-10-16. Restrict exposure of untrusted patterns in build/CI pipelines; monitor upstream Metro/micromatch. |
| `node-forge@1.4.0` | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Expo `@expo/code-signing-certificates`; RSA signature verification issue. | No patched release listed on 2026-10-16. Monitor upstream advisory and Expo; do not replace crypto module blindly. |
| `decode-uri-component@0.2.2` | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | `expo-router@55.0.18` → `query-string@7.1.3` → decoder 0.2.2. Vulnerability is super-linear decoding of malformed input. | **Do not force 0.5.0:** it is ESM-only while `query-string@7` uses CommonJS `require()`. SDK 55 Expo Router source currently calls `queryString.stringify()` only; its parsing call is commented out. CI regression test tracks this assumption. Advisory remains open; reassess on SDK/Router upgrade or newly reachable decode input. |
| `sprintf-js@1.0.3` | [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | `react-native@0.83.10` → `babel-jest@29.7.0` / `@jest/transform@29.7.0` → `babel-plugin-istanbul@6.1.1` → `@istanbuljs/load-nyc-config@1.1.0` → `js-yaml@3.15.2` → `argparse@1.0.10` → `sprintf-js@1.0.3`. | **No patched version as of 2026-10-16:** advisory affects all published versions through 1.1.3. Code is reached from Jest coverage/test tooling, not known directly called by recipe/account screens. Monitor upstream Jest/React Native; do not force `js-yaml@4` or replace a transitive package without testing. |
| `uuid@7.0.3` (pre-override snapshot) | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | `@expo/config-plugins@55.0.11` → `xcode@3.0.1` → `uuid@^7.0.3` (the only UUID consumer). Upstream xcode 3.0.1 source uses only `uuid.v4()` for generating PBX identifiers; no caller-supplied buffers. | Scoped npm override to patched **`uuid@11.1.1`** for xcode, with exact lockfile integrity and test for valid uppercase PBX UUIDs plus the patched buffer bounds. Do not use ESM-only `uuid@12+` for the CommonJS xcode consumer. |

## Firebase Analytics decision

- Before PR #34, `lib/analytics.ts` imported the official Firebase **modular** API from `firebase/app` and `firebase/analytics`; `app/_layout.tsx` invoked `logScreenView`. PR #34 removes this unsupported native-app web analytics setup, its unused configuration files and its transitive dependencies.
- The Firebase Web Analytics SDK is intended for browser environments and its `isSupported()` checks web capabilities. Do not assume this provides working native iOS/Android analytics; a separate analytics instrumentation strategy would need a deliberate product/platform decision.
- Direct `@firebase/app` / `@firebase/analytics` npm packages explicitly state they are **not intended for direct use**. Do not swap to internal unsupported packages just to remove Firestore from `npm audit` or reduce the count.
- The appropriate long-term route is to confirm actual analytics requirements, then use an official supported SDK or backend instrumentation with iOS/Android test coverage.

## CI security gate

- `npm ci` must pass and `CI=1 npx expo install --check` is now blocking to prevent SDK 55 drift.
- CI writes and uploads `npm-audit-production.json` even while known high/moderate findings remain.
- A final audit gate rejects incomplete/missing reports or **any critical advisory**, including advisory records that disagree with summary totals.
- Existing reviewed high/moderate advisories are visible in logs and artifact; since PR #37, **new affected high package names** or **high/moderate count increases** fail CI. Since PR #39, newly reported **GHSA IDs** also fail CI even if the package names/counts do not change. Existing advisories are *not resolved, dismissed or accepted as risk-free*.
- `npm audit fix --force` is prohibited for this phase: npm currently suggests incompatible downgrades/upgrades such as Expo 44, React Native 0.88, Expo Router 58, Firebase 9.

## Required verification and next review

1. Recheck `npm audit --omit=dev` on every dependency change and follow the GitHub advisory links above for patched upstream versions.
2. Keep supported Expo SDK 55 native module versions; test Android/iOS navigation, user profile and quota display, recipes and pantry before merging any dependency override.
3. Review new upstream patches for `braces` and `node-forge`; prioritize Firebase/gRPC and Expo Router URL/deep-link exposure because they have potential externally influenced inputs.
4. Never claim "zero high risk" until affected versions or package paths are actually removed and verified in a fresh npm install + CI audit.

## Post-removal follow-up — PR #34

- PR: [Remove unsupported Firebase Web Analytics](https://github.com/selim-create/tariften-mobile/pull/34).
- CI: [Actions run 38814928363](https://github.com/selim-create/tariften-mobile/actions/runs/38814928363), full clean `npm ci` + TypeScript + required Expo SDK 55 compatibility + critical-advisory gate: **passed**.
- `npm audit --omit=dev`: **35 entries**, **0 critical**, **21 high**, **14 moderate**. This replaces the earlier 39-entry *snapshot* for this PR.
- Removing the unused `firebase` direct dependency pruned **65 packages** (including Firestore, `@grpc/grpc-js` and `websocket-driver`). The reduction in reported advisories is **4 high vulnerability entries**, not 65 separate security fixes.
- Remaining root advisory groups are from Expo/Metro/React Native/Router tooling and indirect dependencies (`braces`, `node-forge`, `decode-uri-component`, `sprintf-js`, `uuid`). Continue tracking, do not `npm audit fix --force`.
- Firebase native Analytics functionality is intentionally **disabled**: no mobile `screen_view` or event analytics should be expected until a deliberately designed, supported analytics integration is introduced.
- Removal of native Firebase config means a future Google/Firebase native integration will require its own design/build configuration; existing Google login UI is currently only a placeholder.
- User should verify the iPhone simulator's home, profile, recipe detail and pantry screens after merging. iOS/Android signed release builds are not proven by TypeScript/Expo Go checks.

## Expo Router URI advisory verification — PR #36 (follow-up after SafeAreaView PR #35)

- **Reviewed against installed lockfile:** Expo Router `55.0.18` depends on `query-string@7.1.3`, which requires `decode-uri-component@^0.2.2` (installed `0.2.2`). The vulnerable decoder is still installed and reported by `npm audit --omit=dev`.
- **Upstream evidence (SDK 55 sources):** [`getPathFromState.ts`](https://github.com/expo/expo/blob/sdk-55/packages/expo-router/src/fork/getPathFromState.ts) and [`getPathFromState-forks.ts`](https://github.com/expo/expo/blob/sdk-55/packages/expo-router/src/fork/getPathFromState-forks.ts) use `queryString.stringify()`. [`getStateFromPath.ts`](https://github.com/expo/expo/blob/sdk-55/packages/expo-router/src/fork/getStateFromPath.ts) has a commented-out `queryString.parse()` line. These direct Router call sites do **not** exercise the decoder's vulnerable parsing path.
- **Upstream incompatibility:** [`query-string@7.1.3`](https://github.com/sindresorhus/query-string/blob/v7.1.3/index.js) uses CommonJS `require('decode-uri-component')`, whereas [`decode-uri-component@0.5.0`](https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.0/package.json) declares `type: module`. An npm override could break deep-link/query handling. Do not use an untested override or pretend the advisory is fixed.
- **New CI guard:** `node --test scripts/check-router-uri-surface.test.cjs` verifies that installed Expo Router SDK 55 only calls the `stringify()` helper and that the current `query-string` CommonJS stringify/parse contract works on a bounded, trusted sample. It fails closed when detected imports or helper usage change, requiring human review.
- **Residual risk:** This is a targeted reachability assessment, not an end-to-end proof about every third-party library. A direct future import/call to vulnerable decoding code, an SDK/Router upgrade, or novel external URL handling should trigger renewed review. `npm audit` findings remain unchanged unless upstream dependencies are actually patched or removed.
- **Manual smoke test after merge:** check home → recipe detail → profile/navigation and a safe, short URL query. Do not use intentionally malicious or oversized percent-encoded inputs. No paid AI request is needed.

## Follow-up: sprintf-js toolchain and audit regression gate — PR #37

- Installed production-labelled dependency tree includes `sprintf-js@1.0.3` only via `argparse@1.0.10`; its parent is `js-yaml@3.15.2`, pulled by `@istanbuljs/load-nyc-config@1.1.0` for Jest coverage instrumentation. `@expo/xcpretty` separately installs `js-yaml@4.3.2` and `argparse@2.0.1` with **no `sprintf-js` dependency**.
- The [GitHub-reviewed advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) reports a moderate DoS/error when an attacker controls the precision in a format string; patched version: **none** on 2026-10-16. Replacing with `sprintf-js@1.1.3` would **not** resolve the alert.
- Current known call path concerns tooling; `npm audit --omit=dev` counts packages installed under production-labelled roots, including development/build machinery embedded in `react-native`. It does not demonstrate that the vulnerable `sprintf-js` routine is used by native recipe/user screens; absence of such evidence does not prove it impossible.
- The new `scripts/check-audit-regressions.cjs` is a **regression budget**, not a vulnerability suppressor: from the last verified [CI run](https://github.com/selim-create/tariften-mobile/actions/runs/38867798214) baseline (21 high, 14 moderate, 0 critical), it rejects increases to high/moderate totals, unknown affected **high-severity package names**, incomplete data, and critical findings. The existing `npm-audit-production.json` artifact and critical gate stay enabled.
- Scope limitation: the allowlist is by affected package name, **not advisory ID**. A new advisory affecting an already-tracked high package without increasing npm's severity count can evade this new guard; regularly review the uploaded audit JSON, advisory links and dependency changes. Any intentional baseline changes require a reviewed PR. This gate does **not** reduce the existing 35 alerts.
- Tests: `node --test scripts/check-audit-regressions.test.cjs`; actual CI evaluates `node scripts/check-audit-regressions.cjs npm-audit-production.json` after generating the production audit report. No changes to Expo SDK 55, native runtime, lockfile or paid AI requests.

## xcode UUID transitive advisory remediation — scoped override

- Confirmed via `package-lock.json`: `@expo/config-plugins@55.0.11 → xcode@3.0.1 → uuid@7.0.3`. No other npm package in the locked tree lists `uuid` as a dependency. The [xcode 3.0.1 source](https://github.com/apache/cordova-node-xcode/blob/3.0.1/lib/pbxProject.js) requires `uuid` through CommonJS and calls `uuid.v4()` only to produce a 24-character uppercase PBX identifier.
- [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) is fixed in `uuid@11.1.1` (also later patched major lines), but **uuid 12+ has no CommonJS support**. The override is intentionally scoped as `"xcode": { "uuid": "11.1.1" }` rather than a global override. UUID 11 still exports `v4` through its CommonJS entrypoint.
- Both `package.json` and `package-lock.json` are updated; the pinned tarball SRI is `sha512-vIYxrBCC/N/K+Js3qSN88go7kIfNPssr/hHCesKCQNAjmgvYS2oqr69kIufEG+O4+PfezOH4EbIeHCfFov8ZgQ==`. `npm ci` and `npm audit --omit=dev` must confirm that the old vulnerable UUID version is absent before merging.
- Regression test `node --test scripts/check-xcode-uuid.test.cjs` checks `xcode`'s resolved `uuid` version, CommonJS `v4()`, PBX ID generation uniqueness/format and the patched `v5` bounds behavior. The test runs in GitHub CI alongside Expo SDK 55 and TypeScript checks.
- No changes to the native app's runtime logic, React Native or Expo SDK versions, quotas, server APIs or paid AI flows. Native signed build / physical-device testing are separate from Node/CI smoke coverage.
- **Verified fresh CI install/audit:** [PR #38 initial successful run](https://github.com/selim-create/tariften-mobile/actions/runs/38870826360) passed clean `npm ci`, TypeScript, Expo SDK 55, URI guard, xcode/UUID regression tests, audit and critical/high/moderate gates. `npm audit --omit=dev`: **29 entries** (**0 critical, 21 high, 8 moderate**), down from 35 (0/21/14). Removing the UUID transitive advisory reduced **six propagated moderate audit entries**; it does not mean six distinct vulnerable runtime functions were fixed.
- The baseline regression gate's moderate ceiling was tightened from 14 to **8** in this follow-up commit. After the last commit, reverify CI before merging to ensure the tightened budget passes on the installed tree.

- Audit comparisons: the reviewed October 16 prior-to-override 35 count is historical. Post-UUID target/verified on CI is **29 (21 high, 8 moderate, zero critical)**, and future regressions must be assessed against this lower 8-moderate budget. Baseline severity counts do not imply vulnerable application-runtime paths are reachable.

## Final Expo SDK 55 advisory review — PR #39

- Post-PR #38 / October 16 verified installation: **29 affected package entries** (0 critical, 21 high, 8 moderate). The `package-lock.json` contains `braces@3.0.3`, `node-forge@1.4.0`, `decode-uri-component@0.2.2`, `sprintf-js@1.0.3`, while `uuid` is fixed at patched `11.1.1`. The 29 counts represent npm dependency nodes, **not 29 distinct exploits or reachable app paths**.
- As of October 16, upstream GHSA records list **no published patched versions** for [braces: GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge: GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), or [sprintf-js: GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
- [decode-uri-component: GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) is patched in `0.5.0`, but Expo Router SDK 55's `query-string@7` uses a CommonJS import incompatible with the patched ESM-only release. The PR #36 test tracks current Router direct usage. This advisory is **still unresolved**.
- These paths primarily flow through Metro/micromatch, Expo certificate tooling, Jest/coverage tooling, and Expo Router. Build-time reachability does not prove a malicious input is reachable from mobile screens; conversely, build-tool exposure is not automatically harmless (notably certificate handling). Avoid blindly overriding crypto/build dependencies.
- **Defense in depth:** prior CI rejects new high-package names, high/moderate count increases and any critical vulnerability. PR #39 adds a **separate GHSA-identity allowlist** based on the reviewed advisory URLs in npm's structured `via` entries. A new GHSA affecting an already-listed high-risk package will now fail CI even if the npm count is unchanged.
- The `scripts/check-known-advisories.cjs` allowlist is an **explicit review record**, not an npm-audit ignore feature. It does not remove or suppress advisories; CI continues producing `npm-audit-production.json`. Updating the allowlist requires a deliberate reviewed PR to assess severity, affected range, provenance, exploitation conditions and available fixes.
- Scope limit: GitHub advisory IDs are the source of truth for this check. Non-GHSA reporting channels, a new vulnerability inside already-allowed GHSA, and newly malicious code without an advisory remain outside this guard. Manually inspect dependencies and test signed release builds ahead of launch.
- **Go/no-go:** Expo SDK 55, TypeScript, URI/UUID tests and full CI must pass before merging. Physical iOS/Android UX, sign-in, recipe detail, profile, Dolap, deep links, quotas and EAS signed builds have not been verified from GitHub CI. This security phase does not certify an App Store-ready release.
