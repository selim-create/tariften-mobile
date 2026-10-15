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
| `decode-uri-component@0.2.2` | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | `expo-router` → `query-string` → URI decoder. Attacker-controlled percent-encoded URL data can cause CPU exhaustion. | Patched in decoder 0.5.0, but this changes the version used by `query-string@7`; evaluate routing and deep-link parsing compatibility separately before an override. Bound untrusted deep-link/query input where application-owned code parses it. |
| `sprintf-js` | [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | React Native → Babel/Jest → `js-yaml` / `argparse` dependency chain. | Mostly tooling exposure; monitor compatible upstream Jest/React Native releases. |
| `uuid@7.0.3` | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Expo `@expo/config-plugins` → `xcode`; affected code is specific `uuid` versions when a caller supplies a buffer. | Build tooling dependency; avoid forcing `uuid@11` through `xcode` without compatibility tests. |

## Firebase Analytics decision

- Before PR #34, `lib/analytics.ts` imported the official Firebase **modular** API from `firebase/app` and `firebase/analytics`; `app/_layout.tsx` invoked `logScreenView`. PR #34 removes this unsupported native-app web analytics setup, its unused configuration files and its transitive dependencies.
- The Firebase Web Analytics SDK is intended for browser environments and its `isSupported()` checks web capabilities. Do not assume this provides working native iOS/Android analytics; a separate analytics instrumentation strategy would need a deliberate product/platform decision.
- Direct `@firebase/app` / `@firebase/analytics` npm packages explicitly state they are **not intended for direct use**. Do not swap to internal unsupported packages just to remove Firestore from `npm audit` or reduce the count.
- The appropriate long-term route is to confirm actual analytics requirements, then use an official supported SDK or backend instrumentation with iOS/Android test coverage.

## CI security gate

- `npm ci` must pass and `CI=1 npx expo install --check` is now blocking to prevent SDK 55 drift.
- CI writes and uploads `npm-audit-production.json` even while known high/moderate findings remain.
- A final audit gate rejects incomplete/missing reports or **any critical advisory**, including advisory records that disagree with summary totals.
- High and moderate advisories are visible in logs and artifact but do not fail CI **yet**; they are *not resolved, dismissed or accepted as risk-free*.
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
