# M2I Coordinator Phase 1 Spec

## Scope

Phase 1 adds the smallest useful connected-layer foundation while staying local-first:

- Transport-neutral M2I envelopes for challenges, joins, and claims.
- Local joined state for a challenge.
- Local proof import on the challenge screen.
- Challenge status that shows local claims and imported proofs.
- Existing copy buttons and manual fallback remain available.

No Nostr coordinator sync, Hypercore sync, payment automation, custody, escrow, or settlement monitoring is included.

## Envelope Requirements

Envelope helpers live in source and must provide:

- `createChallengeEnvelope(challenge)`
- `createJoinEnvelope({ challenge, participant, createdAt? })`
- `createClaimEnvelope({ historyEntry, challenge? })`
- `parseEnvelope(input)`

Each envelope must include:

- `version`
- `type`
- `created_at`
- `payload`
- canonical JSON for the hash payload
- deterministic SHA-256 hash

The hash is over the transport-neutral envelope fields, not over a Nostr event ID, Hypercore sequence number, Keet room, or payment state.

## Join Behavior

On a challenge screen:

- A user can click `Join challenge`.
- The app stores joined state locally.
- The UI shows a compact plain-language joined state.
- Protocol wording should stay out of user-facing copy.

## Proof Import Behavior

On a challenge screen:

- A user can paste a copied M2I envelope or existing copied challenge proof JSON.
- The app parses and validates the input.
- Accepted imports are stored locally.
- The status area shows imported proof count/list and distinguishes imported proofs from local claims.
- Existing local history remains unchanged.

## Test Criteria

Focused tests should cover:

- Deterministic envelope hashes.
- Envelope parsing from JSON strings and objects.
- Clear parse failures for invalid input.
- Local join state storage.
- Imported proof storage and challenge filtering.

## Build Criteria

The phase is complete when these commands pass or blockers are recorded:

- `npm test`
- `npm run build`
- `npm run build:github-pages`

Deploy should be attempted through the documented GitHub Pages path, preferably `npx gh-pages -d dist` after the GitHub Pages build. Credential, network, keychain, or git permission failures must be recorded as blockers rather than treated as success.
