# M2I PWA Privacy GPS Plan — 2026-06-20

## Goal

Implement the June 20 decision: local signed aggregate claims, optional GPS distance, private settlement by default, and explicit redacted public Nostr sharing.

## Decisions

| Question | Decision |
|---|---|
| GPS default | Off. User opts in per workout. |
| Route storage | Never. Points stay in memory and are discarded at stop. |
| Public Nostr | Separate opt-in share, never the settlement default. |
| Settlement | PWA creates claims only. Bot/payment flow remains separate. |
| Wording | "Signed self-attestation" and "local distance estimate", not "GPS proof". |

## Test Criteria

- Existing private claim signing still verifies.
- GPS aggregates are included only when supplied.
- Public share projection omits private fields.
- Public event signing verifies.
- Distance calculation has a stable sanity check.

