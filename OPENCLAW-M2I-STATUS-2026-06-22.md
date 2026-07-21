# M2I Stopwatch PWA Status - 2026-06-22

## Verdict

FAIL for "ready for tomorrow manual verification" because the USDt stake request is generated but not retained in the signed-claim entry shown to the user. Automated checks pass.

## Commands Run

### Repository Location

```text
pwd
/Users/lieschen/Projects/m2i-stopwatch-pwa

git rev-parse --show-toplevel
/Users/lieschen/Projects/m2i-stopwatch-pwa
```

### Git Status

```text
 M BUILD-REPORT.md
 M scripts/dev-server.mjs
?? .openclaw/
?? AGENTS.md
?? HEARTBEAT.md
?? IDENTITY.md
?? OPENCLAW-M2I-STATUS-2026-06-22.md
?? SOUL.md
?? TOOLS.md
?? USER.md
```

### Recent Commits

```text
e97612c feat: add local movement verification and usdt stake request
0eb2abe feat: build m2i stopwatch pwa (Codex Phase A-J)
```

### Tests

```text
npm test

> m2i-stopwatch-pwa@0.1.0 test
> node --test tests/*.test.mjs

1..10
# tests 10
# suites 0
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 83.258333
```

Result: PASS.

### Build

```text
npm run build

> m2i-stopwatch-pwa@0.1.0 build
> node scripts/build.mjs

dist/assets/main.js 98304 bytes (35239 gzip bytes)
```

Result: PASS.

## Changed And Untracked Files

Intended M2I work appears committed in `e97612c feat: add local movement verification and usdt stake request`.

Committed files in `e97612c`:

```text
A PLAN-2026-06-20-PRIVACY-GPS.md
M README.md
M dist/assets/main.css
M dist/assets/main.js
M src/claim.js
A src/gps.js
M src/main.js
M src/nostr.js
A src/payment.js
M src/stopwatch.js
M src/styles.css
M tests/core.test.mjs
```

Current dirty files that look related to local verification/workflow:

- `BUILD-REPORT.md`: adds first live iPhone/Safari test results and follow-up issues.
- `scripts/dev-server.mjs`: changes dev server bind address from `127.0.0.1` to `0.0.0.0` for LAN access.
- `OPENCLAW-M2I-STATUS-2026-06-22.md`: this audit report.

Current dirty/untracked files that look unrelated to product source and should not be included in an app commit without review:

- `.openclaw/workspace-state.json`
- `AGENTS.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `SOUL.md`
- `TOOLS.md`
- `USER.md`

## Implementation Summary

`src/payment.js`:

- Adds `createUsdtPaymentRequest`.
- Supports `ton`, `tron`, and `ethereum`.
- Normalizes positive amounts to two decimals.
- Returns a user-paid, no-custody payment request with instruction text, memo/reference, and wallet-style URI.

`src/claim.js`:

- Creates canonical signed claims with optional GPS aggregate fields.
- Public projection redacts claimant, counterpart, note, GPS accuracy details, route-like data, and payment fields.
- Issue: `createHistoryEntry({ claim, event, published = [] })` ignores `paymentRequest`, so callers cannot display/copy the generated USDt request through `entry.paymentRequest`.

`src/main.js`:

- Home form includes optional GPS aggregate and optional USDt stake request fields.
- Workout start can enable in-memory GPS aggregate tracking.
- Finish flow creates claim, signs event, creates payment request, stores history, and renders claim screen.
- Public sharing is explicit and uses redacted public projection.
- NIP-17 DM path remains available when a counterpart npub exists.
- Issue: `finishWorkout()` passes `paymentRequest` into `createHistoryEntry`, but the returned entry drops it, so `renderPaymentRequest(entry.paymentRequest)` receives `undefined`.

`src/stopwatch.js`:

- Persists workout metadata including GPS enabled flag and USDt stake fields.
- Keeps timestamp-based elapsed/target calculations and wake-lock request helper.

`src/gps.js`:

- Adds Haversine distance calculation.
- Tracks GPS in memory only.
- Rejects missing/low-accuracy samples over 75m.
- Rejects implausible segments over 8.5 m/s.
- Summary returns aggregate distance, accepted/rejected sample counts, accuracy summary, method marker, and route-discarded flag.

`README.md`:

- Documents browser-only app, local key storage, private settlement claims, opt-in redacted public sharing, optional GPS aggregate, PWA behavior, build/test/deploy notes, and privacy checklist.
- README test summary is slightly stale because tests now also cover GPS aggregate, public projection, USDt request, and public event signing.

`PLAN-2026-06-20-PRIVACY-GPS.md`:

- Captures the decision set: GPS off by default, no route storage, public Nostr as separate opt-in share, PWA creates claims only, and wording should avoid "GPS proof".

`tests/core.test.mjs`:

- Covers canonical JSON, claim hash stability, key generation/sign/verify, GPS aggregate claim fields, public redaction, USDt payment request creation, public claim event signing, GPS distance sanity, localStorage history, and NIP-17 helper wrapping.
- Missing integration coverage for `createHistoryEntry` retaining `paymentRequest`.

## Highest-Priority Next Steps

1. Fix `createHistoryEntry` to retain `paymentRequest` when present, and add a test proving USDt requests survive finish/history entry creation.
2. Manually test the full iPhone/Safari flow tomorrow over HTTPS or a LAN URL: generate/import key, start workout, finish, confirm private JSON, confirm payment request card appears, copy payment text/URI, and reopen from history.
3. Manually test GPS opt-in outdoors or with realistic simulator data: route points should never be persisted; signed private claim should include only aggregate distance/sample fields.
4. Confirm public share warning and redaction: public event must exclude private note, counterpart, payment recipient/amount, GPS accuracy/sample details, and any route/coordinate fields.
5. Clean up before commit: decide whether to commit `BUILD-REPORT.md` and LAN dev-server change; exclude `.openclaw/`, identity/memory workspace files, and this status report unless intentionally wanted.

## Report Copy

Requested external copy target:

```text
/Users/lieschen/clawd/reports/m2i-review/status-next-steps-2026-06-22.md
```

Copy attempt failed:

```text
cp: /Users/lieschen/clawd/reports/m2i-review/status-next-steps-2026-06-22.md: Operation not permitted
```

The repo report remains available at:

```text
/Users/lieschen/Projects/m2i-stopwatch-pwa/OPENCLAW-M2I-STATUS-2026-06-22.md
```
