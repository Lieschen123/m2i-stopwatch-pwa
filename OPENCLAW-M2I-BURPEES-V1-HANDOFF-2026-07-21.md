# M2I Burpees V1 Handoff

*Created: 2026-07-21 08:20 CEST*

## Decision

Do **not** commit the current working tree as-is.

Burpees V1 is implemented and verified, but the repository has a mixed dirty state with unrelated prior work. A single commit now would bundle Burpees with coordination/board/deploy/local-agent files and generated assets.

## Current verification

Run from `/Users/lieschen/Projects/m2i-stopwatch-pwa` on 2026-07-21:

```bash
npm test
npm run build
```

Result:

- `npm test` ✅ 59/59 passing.
- `npm run build` ✅ completed.
- Latest build asset version printed: `20260721`.

## Burpees V1 product shape

Burpees V1 adds a timed, self-attested rep challenge:

- `activityType: "burpees"`
- `scoringModel: "reps_for_time"`
- `proof_type: "self_attested"`
- `rep_count`
- default duration: 7 minutes / 420 seconds

Core wording preserved:

> Signed self-attestation. The receipt proves who claimed what and when. It does not prove the movement objectively happened.

This is aligned with the M2I privacy thesis: no camera, no video upload, no motion/body surveillance in V1.

## Intended Burpees files

These files are part of the Burpees V1 work:

- `SPEC-BURPEE-V1.md`
- `OPENCLAW-M2I-BURPEES-V1-REPORT-2026-07-18.md`
- `OPENCLAW-M2I-BURPEES-V1-HANDOFF-2026-07-21.md`
- `src/challenge.js`
  - burpee constants
  - challenge schema fields
  - `isBurpeeChallenge`
  - `isBurpeeClaim`
  - burpee validity branch in `workoutMeetsChallenge`
  - `rankBurpeeClaims`
- `src/claim.js`
  - burpee self-attestation claim fields
  - public projection fields
  - history entry fields
- `src/stopwatch.js`
  - `activityType`
  - explicit `targetSeconds`
- `src/main.js`
  - activity picker
  - burpee fields
  - burpee start/finish flow
  - rep prompt before signing
  - burpee claim/history/board display
- `tests/core.test.mjs`
  - burpee challenge creation
  - burpee claim fields
  - validity and ranking tests
- generated build files if committing built artifacts is still desired:
  - `dist/assets/main.js`
  - `dist/assets/main.css`
  - `dist/index.html`
  - `dist/manifest.webmanifest`
  - `dist/sw.js`
  - `public/sw.js`

## Mixed unrelated repo state observed

The working tree contains many changes that are not clearly Burpees-only, including:

- `BUILD-REPORT.md`
- `SPEC-COORDINATOR-PHASE1.md`
- `scripts/dev-server.mjs`
- `src/constants.js`
- `src/envelope.js`
- `src/storage.js`
- `src/styles.css` contains Burpees UI styles but may also include unrelated board/coordination styles.
- untracked board files:
  - `src/board.js`
  - `src/board-share.js`
  - `src/board-view.js`
  - `tests/board.test.mjs`
- untracked deploy/docs/local-agent files:
  - `.openclaw/workspace-state.json`
  - `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `IDENTITY.md`, `HEARTBEAT.md`
  - `deploy/`
  - `docs/`
  - `OPENCLAW-M2I-FIX-PAYMENT-HISTORY-2026-06-22.md`
  - `OPENCLAW-M2I-PROOF-COPY-FIX-2026-06-27.md`
  - `OPENCLAW-M2I-ROSTER-COPY-FIX-2026-06-27.md`
  - `OPENCLAW-M2I-STATUS-2026-06-22.md`
  - `VPS-PRIVACY-DEPLOY-SPEC-2026-06-23.md`

Because `src/main.js`, `src/styles.css`, and `tests/core.test.mjs` also carry broader app/board/coordination context, hunk-staging Burpees without a human code review could accidentally drop dependencies or commit unrelated behavior.

## Recommended next action

### Safe path A, recommended

1. Create a clean branch or worktree from current `HEAD`.
2. Re-apply only Burpees V1 from the spec/report:
   - `src/challenge.js`
   - `src/claim.js`
   - `src/stopwatch.js`
   - minimal `src/main.js` UI flow
   - minimal `src/styles.css` styles
   - `tests/core.test.mjs`
   - `SPEC-BURPEE-V1.md`
3. Run `npm test && npm run build`.
4. Commit as:

```bash
git add SPEC-BURPEE-V1.md OPENCLAW-M2I-BURPEES-V1-REPORT-2026-07-18.md src/challenge.js src/claim.js src/stopwatch.js src/main.js src/styles.css tests/core.test.mjs dist public/sw.js
git commit -m "feat: add burpees self-attested challenge mode"
```

Only include `dist/` and `public/sw.js` if this repo normally commits built assets.

### Safe path B

Keep the current mixed tree, but do not commit. Use this handoff as the exact continuation point and let a coding agent/human separate the patch manually.

## Status

Burpees V1: **built and verified, pending clean commit/separation**.
