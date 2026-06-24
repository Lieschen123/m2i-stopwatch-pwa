# M2I GitHub Pages + Sats Status - 2026-06-24

## Stub
- Report created first per task rule.
- Working directory, git state, feature state, patches, and verification will be filled in as sections complete.

## Workspace Verification
- `pwd`: `/Users/lieschen/Projects/m2i-stopwatch-pwa`
- `git rev-parse --show-toplevel`: `/Users/lieschen/Projects/m2i-stopwatch-pwa`
- Result: workspace matches the requested repo path.

## Git State And Recent Diff
- Working tree has existing modified tracked files: `BUILD-REPORT.md`, `dist/_headers`, `dist/assets/main.css`, `dist/assets/main.js`, `package.json`, `public/sw.js`, `scripts/build.mjs`, `scripts/dev-server.mjs`, `src/claim.js`, `src/gps.js`, `src/main.js`, `src/payment.js`, `src/stopwatch.js`, `src/styles.css`, `tests/core.test.mjs`.
- Untracked files include local OpenClaw/context docs, prior reports, this report, and `deploy/`.
- Diff stat before my inspection edits beyond this report: 15 files changed, 498 insertions, 77 deletions.
- Observed diffs already include sats payment request additions, GitHub Pages build script/base-path handling, and GPS diagnostics changes. Source/tests/docs were inspected before deciding patch scope.

## Feature Inspection
- Manual sats/Lightning support is implemented in `src/payment.js`, `src/stopwatch.js`, `src/main.js`, `src/claim.js`, and `tests/core.test.mjs`.
- Sats request model is manual-only: user-provided invoice/address/URI/instructions; request text explicitly says M2I does not custody funds, connect to wallets, monitor settlement, or initiate payment.
- Both USDt and sats requests can be retained in private local history via `paymentRequests`; backwards-compatible `paymentRequest` points to the first request.
- Public Nostr projection in `src/claim.js` excludes payment details, claimant/counterpart private identifiers, notes, and GPS sample diagnostics. Tests assert redaction for `paymentRequests`, `payment_uri`, and `amount_sats`.
- GPS/route privacy model remains route-discarding and aggregate-only; no route points are included in claims or public shares.

## Patch Applied
- Updated `README.md` with GitHub Pages build/deploy documentation for `https://lieschen123.github.io/m2i-stopwatch-pwa/`.
- No code patch was needed for sats or base-path support because it was already present.

## GitHub Pages Support
- `package.json` has `npm run build:github-pages`, setting `GITHUB_PAGES_BASE=/m2i-stopwatch-pwa/`.
- `scripts/build.mjs` rewrites `index.html` asset links, manifest `start_url`, manifest `scope`, and icon paths for the configured base path.
- `src/main.js` registers the service worker relative to the bundled module URL, so `/m2i-stopwatch-pwa/assets/main.js` resolves registration to `/m2i-stopwatch-pwa/sw.js`.
- `public/sw.js` derives cache shell and offline fallback paths from `self.registration.scope`, so the service worker works under `/m2i-stopwatch-pwa/`.
- After `npm run build:github-pages`, verified `dist/index.html` links to `/m2i-stopwatch-pwa/manifest.webmanifest`, `/m2i-stopwatch-pwa/icon.svg`, `/m2i-stopwatch-pwa/assets/main.css`, and `/m2i-stopwatch-pwa/assets/main.js`.
- Verified `dist/manifest.webmanifest` has `start_url` and `scope` set to `/m2i-stopwatch-pwa/`.

## Verification Results
- `npm test`: passed, 17/17 tests.
- `npm run build`: passed, base path `/`, bundle `103940` bytes / `36751` gzip bytes.
- `npm run build:github-pages`: passed, base path `/m2i-stopwatch-pwa/`, bundle `103940` bytes / `36751` gzip bytes.
- Final `dist/` currently reflects the GitHub Pages build because `npm run build:github-pages` was run after the normal build for subpath verification.

## Deployment Commands
- GitHub Pages build: `npm run build:github-pages`
- Manual publish option: `npx gh-pages -d dist`
- GitHub Actions option: run `npm install`, then `npm run build:github-pages`, then publish `dist/` to Pages.

## Privacy Notes
- Sats/Lightning support is payment-request-only and manual; no NWC, wallet connection, custody, auto-pay, or settlement polling was introduced.
- Private claim/history can retain payment requests locally for USDt and sats.
- Public Nostr shares are separate redacted events and exclude payment details, counterpart details, private note data, and route data.
- GPS/route privacy remains unchanged: route points are memory-only and discarded; only aggregate distance can appear when accepted GPS samples exist.

## Ready For Commit
- Ready for review/commit from a feature standpoint.
- I did not commit or push.
- Files I changed in this subagent run: `README.md` and this report. Build verification also regenerated `dist/` with the GitHub Pages base path.
