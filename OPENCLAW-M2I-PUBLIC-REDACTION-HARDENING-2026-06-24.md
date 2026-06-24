# M2I Public Redaction Hardening - 2026-06-24

## Status

Implemented and verified locally. Commit/deploy blocked by environment permissions/network.

## Task

Harden public claim/share privacy so public event content excludes precise timing metadata, detailed GPS diagnostics, and payment details while preserving coarse proof fields and private local diagnostics.

## Changed Files

- `src/claim.js` - public projection now includes only coarse GPS public state (`gps_used`, aggregate distance, verification method, and `gps_summary: movement aggregate included`) while continuing to omit precise timestamps and diagnostics.
- `tests/core.test.mjs` - expanded public projection tests to assert precise timestamps, GPS diagnostics, and USDt/sats/Lightning payment fields and strings do not appear in the public object or canonical JSON.
- `dist/assets/main.js` - regenerated GitHub Pages build artifact.
- `OPENCLAW-M2I-PUBLIC-REDACTION-HARDENING-2026-06-24.md` - this report.

Unrelated pre-existing working tree changes were left unstaged/untouched: `BUILD-REPORT.md`, `scripts/dev-server.mjs`, plus unrelated untracked workspace files/directories.

## Verification

- `ls -la OPENCLAW-M2I-PUBLIC-REDACTION-HARDENING-2026-06-24.md` - PASS, report stub existed before code inspection.
- `head -40 OPENCLAW-M2I-PUBLIC-REDACTION-HARDENING-2026-06-24.md` - PASS, report stub verified.
- `npm test` - PASS, 17/17 tests.
- `npm run build:github-pages` - PASS, generated `/m2i-stopwatch-pwa/` build.

## Commit

Blocked in this subagent environment.

Attempted command:

```sh
git add src/claim.js tests/core.test.mjs dist/assets/main.js OPENCLAW-M2I-PUBLIC-REDACTION-HARDENING-2026-06-24.md && git commit -m "Harden public claim redaction"
```

Failure:

```text
fatal: Unable to create '/Users/lieschen/Projects/m2i-stopwatch-pwa/.git/index.lock': Operation not permitted
```

## Deployment

Blocked in this subagent environment.

- No local `gh-pages` branch was present when checked.
- Remote check/push path is unavailable because DNS/network access failed:

```text
fatal: unable to access 'https://github.com/Lieschen123/m2i-stopwatch-pwa.git/': Could not resolve host: github.com
```

Expected deploy URL after publishing GitHub Pages remains:

```text
https://lieschen123.github.io/m2i-stopwatch-pwa/
```

Suggested publish commands from a session with Git write and network access:

```sh
git add src/claim.js tests/core.test.mjs dist/assets/main.js OPENCLAW-M2I-PUBLIC-REDACTION-HARDENING-2026-06-24.md
git commit -m "Harden public claim redaction"
git push origin main
git subtree split --prefix dist -b gh-pages
git push -f origin gh-pages:gh-pages
git branch -D gh-pages
```

## Privacy Verdict

PASS locally. Public claim projection excludes `started_at`, `stopped_at`, `created_at`, `duration_ms`, `gps_last_error`, `gps_sample_count`, `gps_rejected_sample_count`, detailed `gps_accuracy_summary`, raw route/coordinate fields, and USDt/sats/Lightning payment details. Public output keeps only coarse proof fields: challenge code, duration, aggregate distance when accepted, `gps_used`, `local_verification`, `verification_method`, spec/client, and a coarse `gps_summary`. Private claim/history diagnostics are unchanged.
