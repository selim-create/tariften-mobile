# Mobile security advisory triage — 2026-10-16

## Baseline and scope

- Baseline: `main` at `9de2ea266cd809900a611b9aceca7105de63e165`, Expo SDK 55.0.31, Expo Router 55.0.18, React Native 0.83.10.
- Evidence: GitHub Actions job [38808883703](https://github.com/selim-create/tariften-mobile/actions/runs/38808883703), archived `mobile-production-npm-audit` JSON.
- `npm audit --omit=dev` snapshot: **39 vulnerability entries** (0 critical, 25 high, 14 moderate). This counts *dependency nodes*, not 39 separately proven exploitable app paths.
- Vulnerability entries trace back to **six directly vulnerable transitive packages / seven advisories**, with secondary entries propagated through dependent packages.
- `--omit=dev` audits the production dependency **installation tree**, NOT only JavaScript reachable in an iOS/Android release bundle. Expo CLI, Metro, React Native Jest and iOS build tooling can appear in this scan because they are depended on through production-listed Expo/React Native packages.
- This is a snapshot, not a guarantee that the app is free of vulnerabilities. CI blocks **new critical** findings but intentionally reports, rather than ignores, current high/moderate advisories.

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

- `lib/analytics.ts` imports the official supported Firebase **modular** API from `firebase/app` and `firebase/analytics`; `app/_layout.tsx` invokes `logScreenView`.
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
