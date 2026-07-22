# Private Room Flow Bridge — 2026-07-22

Status: completed

## Goal

Connect the M2I private-room primitives into one local V2 loop:

```text
encrypted proof events
→ decrypt/import queue
→ dedupe canonical envelopes
→ deterministic reducer
→ signed redacted room status event
→ human-readable bot-safe status message
→ BUZZ-compatible kind:9 status message
```

## Implementation

Added:

- `prototypes/nostr-coordination/private-room-flow.js`
- `prototypes/nostr-coordination/demo-private-room-flow.mjs`
- `tests/private-room-flow.test.mjs`

Added script:

```bash
npm run prototype:nostr:private-room-flow
```

## Flow behavior

`ingestPrivateProofEvents()`:

- accepts encrypted private proof events
- decrypts them with the room key
- recovers canonical M2I envelopes
- dedupes by `envelope_hash`
- records duplicates separately
- dead-letters undecryptable or non-private-proof events without stopping the flow

`createPrivateRoomUpdate()`:

- runs ingestion
- reduces accepted envelopes with the deterministic reducer
- creates a bot-safe room status projection
- signs the redacted status event
- formats the readable room status message
- optionally wraps that message/status as a BUZZ `kind:9` channel message

## Test coverage

Tests verify:

1. encrypted proof events ingest successfully
2. duplicate encrypted proof events do not duplicate canonical envelopes
3. undecryptable bot/non-member events are rejected/dead-lettered
4. unrelated noise events are rejected/dead-lettered
5. reduced board state produces signed redacted status
6. signed status verifies and unwraps
7. readable message is bot-safe
8. BUZZ status wrapper uses `kind:9` and channel `h` tag
9. bot-visible artifacts do not include raw envelope hash, `historyEntry`, `sender_alias`, payment, heart/body, or GPS terms

## Verification

```text
npm run prototype:nostr:private-room-flow → passed
npm test → 93/93 passing
npm run build → passed, generated dist reverted because this was prototype/spec-only
```

## Decision

This completes the local V2 architecture loop without depending on a live BUZZ relay:

- BUZZ/Nostr/other transport carries encrypted proof events.
- Room members with keys decrypt and reduce.
- Bot/agent sees only signed redacted status and readable summary.
- Canonical truth remains M2I envelopes + deterministic reducer.

## Next options

1. Keep prototype-only and return to Runner 2 alpha observation.
2. Add a coordinator-only PWA export/import UI for private-room updates.
3. Run a live BUZZ local relay spike and try posting the BUZZ `kind:9` status message into a real channel.
