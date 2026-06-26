# M2I Stake Reference Consistency Report - 2026-06-26

## Stub
- Started: 2026-06-26 12:39 Europe/Berlin
- Task: Fix stake/payment reference consistency and deploy.
- Status: Complete.

## Inspection
- Verified report file with `ls -la` and `head` immediately after stub creation.
- `rg` is unavailable in this shell; used `find` and targeted file reads instead.
- Existing unrelated dirty files before this work: `BUILD-REPORT.md`, `scripts/dev-server.mjs`, `.openclaw/`, workspace identity/docs, deploy files, and prior reports.
- Root cause: challenge form created payment requests before challenge `id`/`createdAt` existed, producing references such as `CODE:`. Claim finish then recreated requests with `claim_hash`, producing different claim-level references.
- Relevant files inspected: `src/payment.js`, `src/challenge.js`, `src/main.js`, `src/claim.js`, `src/storage.js`, `src/stopwatch.js`, `tests/core.test.mjs`, `package.json`.

## Implementation
- Added deterministic payment reference normalization in `src/payment.js` using challenge context plus request fields; no render-time randomness.
- `createChallengePlan` now normalizes payment requests after challenge `id`, code, and `createdAt` exist, so new challenge-level requests get non-empty suffixed references immediately.
- `createChallengeSettlement` now normalizes challenge-level requests and signed-claim private settlement requests for copied/displayed proof output, covering legacy/imported `CODE:` references without mutating old stored objects.
- `finishWorkout` now reuses the active challenge's stored payment requests for challenge workouts instead of recreating them with `claim_hash`; standalone fallback behavior remains.
- Imported challenge invites are normalized before saving; copy invite and copy challenge proof also use normalized challenge requests.
- Missed-challenge stake wording and non-custodial/manual settlement text were preserved.
- Added focused tests for new challenge-created request consistency and legacy copied-proof normalization.

## Verification
- `npm test`: passed, 32 tests.
- `npm run build:github-pages`: passed; generated `dist/assets/main.js` for base path `/m2i-stopwatch-pwa/`.
- `git diff --check`: passed with no whitespace errors.
- `git diff --cached --check`: passed before commit after trimming report EOF whitespace.
- Public Nostr payment/stake redaction remains covered by existing public projection tests.

## Commit And Deploy
- Committed: `e0bd89f fix: keep stake references consistent`.
- Pushed: `git push origin main` succeeded (`ec34a6a..e0bd89f main -> main`).
- Deployed: `npx gh-pages -d dist` succeeded with output `Published`.
- Preserved unrelated dirty files by staging only this task's source/test/dist/report files.
