# M2I Coordinator Layer Strategy

## Decision

M2I's canonical truth is transport-neutral signed objects. The PWA creates and stores challenge rules, join acknowledgements, workout claims, and imported proofs as local data first. Transport systems can mirror or carry those objects, but they do not define truth.

Non-canonical identifiers include:

- Nostr event IDs
- Hypercore sequence numbers
- Keet room identity
- Payment state

Those identifiers can help locate or relay data later. They must not replace signed M2I object hashes or local verification.

## Stages

### Stage 1: PWA Foundation

The current build path is the local-first PWA:

- Create challenge rules locally.
- Join a challenge locally.
- Create signed workout claims.
- Copy challenge invites and proofs manually.
- Import copied proofs locally.
- Show local claims and imported proofs in challenge status.

This stage avoids network sync and keeps the manual fallback intact.

### Stage 2: Invisible Nostr Adapter

The next main-path coordinator is an adapter that can carry the same signed M2I objects over Nostr without changing the product model:

- Publish or receive signed M2I envelopes.
- Keep Nostr event IDs as transport metadata only.
- Avoid making relay availability part of correctness.
- Keep public sharing separate and redacted.

The user-facing model should remain simple: joined state, local claims, imported proofs, and challenge status.

### Stage 3: Hypercore / Pear Mirror Spike

Holepunch, Pear, Tether, Keet, and Hypercore are a v2 sidecar spike, not the main path. The spike can test whether peer-to-peer mirroring improves group sharing, but it must mirror the same signed M2I objects.

Acceptable spike outcomes:

- A Hypercore feed mirrors challenge envelopes.
- A Pear sidecar imports or exports local proof files.
- A Keet room points users to signed payloads.

Rejected outcomes:

- Treating Hypercore sequence numbers as canonical truth.
- Making a Pear app required for the PWA.
- Moving settlement or payment logic into the transport layer.

## Payment Boundary

M2I is not a custody, escrow, auto-payment, or settlement-monitoring system.

The coordinator layer must not:

- Hold funds.
- Initiate payments.
- Request wallet spend authority.
- Monitor whether settlement happened.
- Infer final payment state from a chain, wallet, relay, or room.

Payment instructions remain manual context attached to private challenge review. If a challenge is missed, participants settle from their own wallets outside M2I.
