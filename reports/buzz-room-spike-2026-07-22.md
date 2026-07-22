# BUZZ Room Spike — 2026-07-22

Status: completed

Goal: Determine whether M2I can post bot-safe status events and/or private proof events into a real BUZZ room, and what integration adapter is needed.

## Tooling note
- Attempted to delegate the spike to Codex CLI, but local Codex binary failed with `ENOENT` for its vendor binary path.
- Continuing spike directly in this session to avoid blocking.

## Source spike findings

Inspected `https://github.com/block/buzz` locally.

Relevant files/findings:

- `ARCHITECTURE.md`
  - BUZZ has NIP-01 / NIP-42 auth, channel/DM/media/workflow/git REST, audit log.
  - Channel-scoped events are membership-gated.
  - Global subscriptions are excluded from private channel fanout.
  - REQ handling checks channel access before registering channel subscriptions.
- `crates/buzz-core/src/kind.rs`
  - `KIND_STREAM_MESSAGE = 9`.
  - `KIND_STREAM_MESSAGE_V2 = 40002`.
- `crates/buzz-sdk/src/builders.rs`
  - `build_message(channel_id, content, ...)` creates `kind:9` with `['h', channel_id]`.
- `crates/buzz-relay/src/handlers/ingest.rs`
  - Ingest maps allowed known kinds to scopes and rejects unknown kinds.
  - Practical implication: do not assume raw M2I `kind:30316` events can be posted directly into BUZZ.
- `crates/buzz-pair-relay/src/lib.rs`
  - Contains NIP-44 validation for pair relay frames, but this is not the same as proving group-private channel payloads for M2I proof automation.

## Conclusion

BUZZ is a plausible host shell for the M2I room, but the correct first integration shape is not raw M2I `kind:30316`.

Use BUZZ-native stream messages:

- event kind: `9`
- channel tag: `['h', '<channel_uuid>']`
- M2I adapter tags: `m2i`, `m2i_buzz_adapter`, `m2i_message_type`, `status_hash`, `challenge_code`
- content: canonical JSON containing the signed M2I status event or starter pack.

Membership-gated private channels protect room visibility from non-members, but do not prove cryptographic secrecy from the relay/operator or an in-room bot/agent. For bot-blind proof automation, M2I must encrypt private proof payloads before posting, or use a proven BUZZ encrypted-room API if/when available.

## Prototype added

Added:

- `prototypes/nostr-coordination/buzz-room-adapter.js`
- `prototypes/nostr-coordination/demo-buzz-room-adapter.mjs`
- `tests/buzz-room-adapter.test.mjs`

Script:

```bash
npm run prototype:nostr:buzz-adapter
```

Result:

```text
✅ BUZZ room adapter passed: M2I starter pack wrapped as kind:9 channel message with h tag.
```

Tests:

```text
npm test → 84/84 passing
npm run build → passed, generated dist reverted because this was prototype/spec-only
```

## Next step

Build `private-proof-events.js` next:

- encrypt full M2I proof envelope for room members before putting it into BUZZ/Nostr content
- prove member can decrypt and reduce
- prove bot/non-member cannot read the payload
- emit signed redacted status after local reduce

This keeps BUZZ as an adapter, not the source of M2I truth.
