# M2I Payment History Fix - 2026-06-22

Status: completed

Milestones:
- [x] Inspect current payment request/history flow
- [x] Implement minimal fix
- [x] Add/adjust focused tests
- [x] Run required verification

Verification:
- `git diff -- src/claim.js tests/core.test.mjs`: reviewed expected source/test changes.
- `npm test`: PASS (11 tests, 11 passed).
- `npm run build`: PASS (`dist/assets/main.js` 98359 bytes, 35256 gzip bytes).
- `git status --short`: source/test/report changes present; build refreshed `dist/assets/main.js`; pre-existing unrelated dirty files remain (`BUILD-REPORT.md`, `scripts/dev-server.mjs`, plus existing untracked workspace files).

Outcome:
- PASS. Claim history entries now retain local USDt payment requests so the claim screen and reopened history can render/copy them.

Remaining risks:
- No browser/UI automation was run; verification is unit tests plus production build.


Notes:
- Report stub created before edits.
- `createHistoryEntry()` now accepts and preserves a local `paymentRequest` when one is present.
- Added a focused unit test proving history entries retain the USDt request text/reference.
