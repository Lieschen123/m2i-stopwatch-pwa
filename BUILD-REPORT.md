# M2I PWA Stopwatch — Build Report

**Started:** 2026-06-18 10:58 GMT+2
**Spec:** ~/Projects/move2improve/PWA-STOPWATCH-SPEC-2026-06-18.md
**Builder:** Codex subagent (gpt-5.5)
**Orchestrator:** Lieschen (Opus, main Telegram session)

## Status: BLOCKED — sandbox blocks localhost dev-server listen; Vite registry fetch unavailable

## Progress Log
- [x] Phase A: Skeleton + tooling (Vite scaffold, local build tooling, nostr-tools structure)
- [x] Phase B: Nostr key management (gen, import, store)
- [x] Phase C: Stopwatch core (start, stop, timer, wake lock)
- [x] Phase D: Claim creation + signing (canonical JSON, sha256, Schnorr)
- [x] Phase E: Nostr event publishing (relays, NIP-17 DM)
- [x] Phase F: UI/UX polish + history view
- [x] Phase G: Service Worker / PWA install
- [x] Phase H: Build production bundle
- [ ] Phase I: Local test on real iPhone (defer to Nono)
- [x] Phase J: Documentation (README, deploy notes)

## Build Log
(Updated by subagent as it works)


### 2026-06-18 11:01 CEST — Intake
- Read source spec and existing report stub as mandatory first two tool calls.
- Confirmed repo is empty except `.git` and `BUILD-REPORT.md`; no pre-existing app code to preserve.

### 2026-06-18 11:02 CEST — Phase A skeleton started
- Added Vite package skeleton, strict local dev/preview hosts, `.gitignore`, and `index.html`.
- App will be a static browser bundle with no runtime CDN scripts.

### 2026-06-18 11:09 CEST — Phases B-G implementation pass
- Added localStorage persistence, Nostr key generation/import/npub display, timestamp stopwatch, Wake Lock request, claim canonicalization/hash/signing, relay publish, optional NIP-17 DM flow, local history, settings, manifest, icon, and service worker.
- Design kept mobile-first and app-like; no external scripts or analytics added.

### 2026-06-18 11:13 CEST — Offline dependency workaround
- Registry access failed with DNS `ENOTFOUND`; documented as environment constraint.
- Reworked package install to use local `file:` dependencies from existing Move2Improve `node_modules` for `nostr-tools` 2.23.3 and related Nostr crypto packages.
- Added local esbuild-based build/dev scripts because Vite could not be fetched in this network-restricted session; `vite.config.js` remains as scaffold documentation, but executable gates use local scripts.

### 2026-06-18 11:16 CEST — Verification pass
- Verified NIP collision: GitHub search showed `kind:30315` is assigned to NIP-38 User Status. Chose `kind:30316`; search for `kind:30316` in nostr-protocol/nips returned no results.
- `npm install`: PASS using local `file:` dependencies because registry DNS is blocked in this environment.
- `npm test`: PASS, 5 smoke tests.
- `npm run build`: PASS, `dist/assets/main.js` 90,680 bytes / 32,751 gzip bytes.
- Runtime network scan: no analytics/cookies/XHR/sendBeacon. Production bundle no longer contains unused HTTP fetch helpers from `nostr-tools`; service worker fetch is same-origin cache-only behavior; relay publishing uses WebSocket relay URLs.
- `npm run dev`: BLOCKED in this sandbox by `listen EPERM 127.0.0.1:5173`. Script builds first and should listen in a normal local terminal.

## Status: BLOCKED — sandbox blocks localhost dev-server listen; Vite registry fetch unavailable

The PWA source, tests, production build, README, and local dependency workaround are complete. Remaining blocker is environmental: OpenClaw denied binding a local dev server, and DNS to `registry.npmjs.org` is unavailable, so the Vite dependency from the decided stack could not be installed here. Before public deploy on a normal machine, replace local `file:` dependencies with registry versions and run `npm install && npm test && npm run build && npm run dev`.

### 2026-06-18 11:17 CEST — Git handoff note
- Attempted `git add . && git commit -m "feat: build m2i stopwatch pwa"`.
- Commit is blocked by filesystem permission: Git cannot create `.git/index.lock` (`Operation not permitted`). No stale lock exists; the sandbox denies writing inside `.git`.
- Working tree contains the full deliverable set but remains uncommitted due to this environment permission issue.

## First Live Test Results — 2026-06-19 10:00-10:30 GMT+2

**Tester:** Lieschen, iPhone, Safari, LAN URL http://192.168.178.131:5173
**Outcome:** ✅ SUCCESS end-to-end. First public M2I claim published.

### What worked
- Key generation flow OK
- Stopwatch UI clean, mobile-first layout, target countdown correct
- Wake Lock requested (display stayed on during workout)
- Schnorr signing produced valid event (verified on relay)
- "Send to relays" → published to both wss://relay.damus.io + wss://relay.primal.net
- Tags (`duration`, `client`, `t=m2i`, `d=CHALLENGE_CODE`) all present and queryable
- Privacy promise held: nsec stayed on device

### Public verification (from third-party script)
- Event ID: 1f4b871bd701d079...
- Pubkey: a70098a4c186ffcb... (test-key, throwaway)
- Challenge: TEST-RUN-001
- Duration: 66s
- Client: m2i-stopwatch-v1
- Created: 2026-06-19T08:17:03Z (UTC)
- Both Damus and Primal returned the event when filtering `kinds:[30316], #t:m2i`

### Known issues to fix before production
1. **Copy event JSON button not tappable on Safari/LAN HTTP**
   - Likely Safari floating URL-bar covers tap area, or `navigator.clipboard.writeText` blocked on non-HTTPS
   - Fix: HTTPS deploy + `viewport-fit=cover` + safe-area-inset-bottom padding
2. **No "Copied" fallback for non-HTTPS** — show JSON in a `<textarea>` for manual selection on insecure context
3. **No PWA install hint** — should detect Safari-on-iOS and surface "Add to Home Screen" guidance after first claim
4. **No Settings screen tested** — relay-list edit UX not yet validated

### Decisions emerging from live test
- Add "show JSON inline" as fallback to Copy
- Surface "Add to Home Screen" hint after first successful claim
- Consider hiding "Send to relays" by default until user opts in (privacy-by-default)
