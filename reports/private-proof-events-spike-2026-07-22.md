# Private Proof Events Spike — 2026-07-22

Status: completed

## Goal

Prototype the missing bot-blind proof automation boundary for M2I private rooms:

```text
activity finished
→ local signed M2I envelope
→ encrypted room proof event
→ member decrypt/import/reduce
→ redacted status for bot
```

## Implementation

Added:

- `prototypes/nostr-coordination/private-proof-events.js`
- `prototypes/nostr-coordination/demo-private-proof-events.mjs`
- `tests/private-proof-events.test.mjs`

Added script:

```bash
npm run prototype:nostr:private-proof
```

## Event shape

Private proof events are BUZZ/Nostr-room compatible:

- event kind: `9` by default, so they can ride as BUZZ stream messages
- channel tag: `['h', '<channel_uuid>']` when a BUZZ channel id is present
- tags:
  - `['m2i_private_proof', 'v1']`
  - `['m2i', 'v1']`
  - `['m2i_message_type', 'm2i.private_proof_event.v1']`
  - `['privacy', 'room-encrypted']`
  - `['challenge_code', '<code>']`
- content:
  - `alg: xchacha20poly1305-v1`
  - minimal routing metadata only
  - random 24-byte nonce
  - ciphertext
  - ciphertext hash

## Privacy correction made during implementation

Initial implementation exposed `sender_alias` and `envelope_type` in cleartext metadata. That would weaken bot-blindness by revealing proof history and participant activity patterns to a bot/relay observer.

Fixed before commit:

- cleartext metadata now only includes room/channel/challenge routing fields
- `sender_alias` and `envelope_type` are inside encrypted plaintext
- tests assert event content does not include `sender_alias`, `envelope_type`, `Nono`, `Runner 2`, raw `historyEntry`, or the raw `envelope_hash`

## What the prototype proves

1. A full M2I envelope can be encrypted into a private room event.
2. A member with the 32-byte room key can decrypt and recover the exact envelope.
3. A bot/non-member with the wrong key cannot decrypt.
4. Decrypted private proof events reduce to the exact same board state as raw envelopes.
5. After local decrypt/reduce, M2I can emit a bot-safe redacted status projection.
6. Tampered event content is rejected before decrypting via `getEventHash(event) === event.id` plus signature verification.

## Verification

```text
npm run prototype:nostr:private-proof → passed
npm test → 89/89 passing
npm run build → passed, generated dist reverted because this was prototype/spec-only
```

## Decision

This completes the local cryptographic boundary prototype for bot-blind proof automation.

BUZZ, Nostr, Signal, Telegram, files, or QR codes can carry the encrypted proof event. The room member apps/clients hold the key and reduce canonical state. The bot receives only redacted status unless explicitly granted the room key.

## Next step

Build the orchestration bridge:

```text
encrypted proof events → local decrypt/import queue → reduce board → emit signed redacted room status event/message
```

Then expose it as a PWA/UI flow only after alpha friction justifies it.
