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

## Additional BUZZ launch-post notes from Nono (2026-07-22)

Nono shared a longer BUZZ launch/article excerpt with several details beyond the initial source scan.

Important additions:

- BUZZ verifies agent signatures instead of trusting network addresses.
- Agents have their own keys; owner authorization does not erase agent authorship.
- Agent authorization is narrowly scoped and revocable.
- Removing the owner prevents the agent from reconnecting; immediate risk can terminate active sessions too.
- Agent model requests can run on another community member's machine.
- BUZZ introduces authorized peers, then encrypted model traffic travels directly between them, avoiding prompt transit through the BUZZ server.
- Live telemetry and cancellation are ephemeral encrypted messages.
- Memory and cost records are encrypted but durable.
- Server sees routing metadata, not those encrypted payloads.
- BUZZ includes Git hosting / early forge UI, not just chat and agents.
- Repositories are stored as immutable content-addressed packfiles plus one mutable manifest pointer.
- Pushes write objects first, then advance the pointer via conditional compare-and-swap; that pointer update is the commit point.
- Workspace events announce Git changes but do not define them.
- BUZZ specified the Git object-storage protocol in TLA+ and model-checked durability, reconstruction, and concurrent pushes.
- Device pairing uses encrypted exchange over BUZZ, started by QR secret and confirmed by matching six-digit codes.
- Intended workflow: feature/bug gets a short-lived channel; lead agent delegates to cheaper/faster workers; discussion, patches, CI, review, and signed merge decision share one record; channel closes when work closes, and the reason survives.

Strategic update:

BUZZ is more ambitious than “Slack with agents.” It is closer to a sovereign project/workspace substrate:

```text
room + signed identities + agents + durable memory + Git + workflow + audit trail
```

For M2I this increases strategic alignment for future workrooms, but does not change the current Runner 2 conclusion: BUZZ is still too heavy/early for immediate alpha onboarding. Our local M2I private-room architecture remains valuable because it defines the private proof boundary independently of BUZZ.

M2I implication:

- BUZZ could eventually host a full M2I repeated-game workspace: room, agent, signed status, encrypted proof payloads, project history, code/workflow state.
- BUZZ's own encrypted telemetry/model traffic pattern supports our bot-blind direction conceptually.
- But we still need to verify whether ordinary channel payloads can provide group-private proof secrecy, or whether M2I-encrypted proof events remain necessary.
