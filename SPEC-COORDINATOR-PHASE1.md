# M2I Coordinator Phase 1 Spec

## Scope

Phase 1 adds the smallest useful connected-layer foundation while staying local-first:

- Transport-neutral M2I envelopes for challenges, joins, and claims.
- Transport-neutral M2I envelopes for challenge outcomes, manual payment requests, and manual receipts.
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
- `createOutcomeEnvelope({ settlement, createdAt? })`
- `createPaymentRequestEnvelope({ settlement, request?, createdAt? })`
- `createReceiptEnvelope({ settlement, paymentRequestEnvelope?, markedBy, createdAt?, note? })`
- `parseEnvelope(input)`

Each envelope must include:

- `version`
- `type`
- `created_at`
- `payload`
- canonical JSON for the hash payload
- deterministic SHA-256 hash

The hash is over the transport-neutral envelope fields, not over a Nostr event ID, Hypercore sequence number, Keet room, or external wallet/payment state.

Outcome and payment coordination envelopes use the same canonical envelope hashing. They are coordination records only:

- `m2i.outcome.v1` carries the final manual group settlement snapshot.
- `m2i.payment_request.v1` carries a missed-challenge settlement and optional selected manual request.
- `m2i.receipt.v1` records that a person manually marked payment as handled and can link the payment request envelope hash.

Payment request envelopes are only valid when `settlement.payment_due === true`. Complete challenges and open challenges must not produce payment request envelopes. Receipts require a marker with a display name/name or npub. These records do not initiate payments, custody funds, hold escrow, monitor wallets, or verify settlement on-chain.

## Outcome and Payment Behavior

After final review:

- Open challenges remain pending final review and have no payment request envelope.
- Complete challenges produce an outcome with `payment_due: false`; no payment is due and payment request creation is rejected.
- Missed challenges produce an outcome with `payment_due: true`; a manual payment request envelope can be copied for the configured stake request.
- Any payment is performed outside M2I by the user in their own wallet.
- A receipt envelope is a manual bookkeeping record only. It can reference the payment request envelope hash, but it is not proof of automated wallet settlement.

On the closed challenge screen:

- The user can copy a final outcome envelope.
- If `settlement.payment_due === true`, the user can copy a manual payment request envelope for each configured missed-challenge stake request.
- If `settlement.payment_due === true`, the user can copy a manual receipt envelope. The receipt is marked by the local profile display name and/or local key npub and links the generated payment request envelope when one is available.
- UI copy must remain manual-only: no wallet automation, escrow, custody, or settlement monitoring.

## Join Behavior

On a challenge screen:

- A user must choose a listed participant or enter a display name before joining.
- The app stores joined state locally with display name, local participant id, and local npub when available.
- Challenge workouts are blocked until this device has joined with a display name, so copied proofs can be matched to a person in the group chat.
- The UI shows a compact plain-language joined state.
- Protocol wording should stay out of user-facing copy.

## Proof Import Behavior

On a challenge screen:

- A user can paste a copied M2I envelope or existing copied challenge proof JSON.
- The app parses and validates the input.
- Accepted imports are stored locally.
- The status area shows imported proof count/list and distinguishes imported proofs from local claims.
- Imported proof rows should identify outcome, payment request, receipt, join, challenge, and claim envelopes in plain language instead of displaying only a generic envelope label.
- Existing local history remains unchanged.

## GPS Permission Preflight

On an open challenge screen before starting a workout:

- The start-workout area must show a visible Location/GPS readiness section.
- The user can click `Enable / test GPS` before starting.
- The test calls `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true` so the browser can trigger the Location permission prompt.
- Success copy confirms GPS permission is ready for the page and can include the reported accuracy.
- Denied, unavailable, insecure-context, unsupported, or timed-out states must show practical recovery instructions, including iPhone Settings > Safari > Location, allow While Using, enable Precise Location, and browser page permissions where applicable.
- The existing `Add local GPS aggregate distance` checkbox remains visible.
- Privacy copy must remain clear: no route is stored or uploaded; only aggregate distance is kept for the local workout claim, and route points are discarded at finish.
- Challenge validity must not be granted by duration alone. Distance-goal challenges require the configured aggregate distance, and no-distance challenges require accepted GPS aggregate movement of at least `max(10m, 5m per required minute)`.

## Test Criteria

Focused tests should cover:

- Deterministic envelope hashes.
- Envelope parsing from JSON strings and objects.
- Clear parse failures for invalid input.
- Missed challenge outcome, payment request, and receipt envelopes.
- Rejection of payment request envelopes for complete challenges.
- Useful imported proof summaries for outcome, payment request, and receipt envelopes.
- Local join state storage.
- Imported proof storage and challenge filtering.
- No-distance challenge validity rejects duration-only claims, accepts claims with enough accepted aggregate GPS movement, and rejects too-small aggregate movement.

## Build Criteria

The phase is complete when these commands pass or blockers are recorded:

- `npm test`
- `npm run build`
- `npm run build:github-pages`

Deploy should be attempted through the documented GitHub Pages path, preferably `npx gh-pages -d dist` after the GitHub Pages build. Credential, network, keychain, or git permission failures must be recorded as blockers rather than treated as success.
