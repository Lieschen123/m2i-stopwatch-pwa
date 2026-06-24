# M2I Payment Visibility Report - 2026-06-24

Status: source fix and verification passed locally; commit/push/deploy blocked by sandbox git metadata write restriction

Task: Fix/verify private visibility of manual USDt/sats payment requests while keeping public share/payment projection redacted.

Initial verification:
- Report file was created before inspection and verified with `ls -la` and `head`.

Findings:
- Payment request data was already retained on local history entries as `paymentRequests` / `paymentRequest`.
- The visibility gap was that the final/private settlement JSON shown and copied on the claim screen used only the signed Nostr event (`entry.event`), so manual payment requests were outside the copied private settlement payload.
- Public projection in `createPublicClaimProjection()` was already allowlisted and did not include payment fields; tests now also cover the new private settlement wrapper staying out of public projection.

Changes:
- `src/claim.js`: `createHistoryEntry()` now adds `privateSettlement` containing `settlement_model: manual-private-settlement`, the `signed_event`, and any local `paymentRequests`.
- `src/main.js`: final/history claim screen now displays and copies `privateSettlement` JSON instead of only the signed event, with backward-compatible fallback for old history entries.
- `src/main.js`: payment request cards now explicitly show asset, amount, network, recipient, payment URI, reference, instructions, and `Manual request only. Not automatic payment.`
- `tests/core.test.mjs`: added coverage that a 2 USDt manual request remains visible in private settlement JSON, USDt/sats requests remain retained together, and public projection redacts `privateSettlement`.
- `dist/assets/main.js`: rebuilt via GitHub Pages build.

Verification:
- `npm test` passed: 18 tests, 18 pass.
- `npm run build:github-pages` passed and rebuilt `dist/assets/main.js`.

Dirty worktree note:
- Pre-existing unrelated changes/untracked files were preserved and not staged intentionally, including `BUILD-REPORT.md`, `scripts/dev-server.mjs`, `.openclaw/`, local identity/memory docs, deploy docs, and older reports.

Commit/deploy status:
- `git add ... && git commit ...` was attempted and failed before staging with: `fatal: Unable to create '/Users/lieschen/Projects/m2i-stopwatch-pwa/.git/index.lock': Operation not permitted`.
- No commit, push, or gh-pages redeploy was possible from this subagent sandbox because writing git metadata is blocked.

Exact commands to run from a session with git metadata/network permission:
```sh
git add src/claim.js src/main.js tests/core.test.mjs dist/assets/main.js OPENCLAW-M2I-PAYMENT-VISIBILITY-2026-06-24.md
git commit -m "Show manual payment requests in private settlement"
git push origin main
npm run build:github-pages
git subtree push --prefix dist origin gh-pages
```
