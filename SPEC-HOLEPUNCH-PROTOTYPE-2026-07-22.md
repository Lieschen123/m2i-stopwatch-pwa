# M2I Holepunch Prototype Spec

**Date:** 2026-07-22  
**Status:** Build plan  
**Goal:** prove whether M2I signed envelopes can sync privately over a Holepunch-style room without changing PWA truth model.

---

## Decision

Build a **separate Node CLI prototype** first, not a PWA rewrite.

Reason:
- Current M2I alpha works as browser PWA with manual proof sharing.
- Holepunch/Pear is not a normal iOS Safari sync layer.
- The useful question is smaller: can two peers exchange M2I envelopes and reduce them into the same board state?

---

## Non-goals

- No production UI.
- No Pear desktop/mobile app yet.
- No custody, payments, escrow, wallets, or private keys beyond local test data.
- No replacing the current PWA/manual alpha.
- No raw health/GPS/body data.
- No claim that sync is anonymous or metadata-free.

---

## Architecture

```text
M2I signed envelopes
        ↓
coordination adapter interface
        ↓
manual copy/paste | future Nostr | Holepunch prototype
        ↓
deterministic board reducer
```

The canonical truth remains M2I’s signed envelope/claim schema.
Holepunch is only a transport/log.

---

## Prototype shape

Use Node scripts under `prototypes/holepunch-sync/`.

### Components

1. `room-topic.js`
   - derives a deterministic swarm topic from challenge id/code.

2. `sample-envelopes.js`
   - creates or loads test challenge/join/claim envelopes using existing M2I modules where practical.

3. `reducer.js`
   - materializes simple state from received envelopes:
     - challenge id/code
     - participants
     - claims by participant
     - counts per participant/day

4. `peer.js`
   - CLI peer:
     - has local storage dir
     - joins room topic
     - appends/sends envelopes
     - receives peer envelopes
     - deduplicates by hash/id
     - writes a local log file
     - prints board state

5. `demo-local.mjs`
   - starts Peer A + Peer B locally:
     - Peer A emits challenge + Nono claim
     - Peer B emits Runner 2 claim
     - both converge to same reducer state

---

## Privacy/Security constraints

- Only signed envelopes should be exchanged.
- Do not transmit raw GPS route, body data, health data, or private keys.
- Storage lives under ignored local dirs.
- Treat room topic as semi-private coordination secret, not strong anonymity.
- Deduplicate records and validate envelope shape before applying.

---

## Success criteria

Prototype passes if:

- [ ] Peer A and Peer B connect locally over Hyperswarm.
- [ ] Peer A sends a challenge envelope.
- [ ] Peer B receives and stores it.
- [ ] Peer B sends a burpee claim/proof envelope.
- [ ] Peer A receives and stores it.
- [ ] Both peers print the same reduced board state.
- [ ] Re-running does not duplicate already-seen envelopes.
- [ ] Existing PWA tests still pass.

---

## Dependencies verified 2026-07-22

- `hyperswarm` latest: 4.17.0
- `hypercore` latest: 11.34.1
- `corestore` latest: 7.11.1
- `b4a` latest: 1.8.1

First prototype may use raw `hyperswarm` socket exchange and local JSONL log before introducing Hypercore/Corestore. If raw swarm transport works, next step is append-only Hypercore-backed storage.

---

## Build steps

1. Add ignored prototype storage paths.
2. Create prototype folder and README.
3. Build deterministic topic + envelope validation + reducer.
4. Build two-peer socket exchange.
5. Build local demo script.
6. Test demo and `npm test`.
7. Commit as experimental prototype.

---

## Open question

If Hyperswarm connectivity is flaky on local Mac/network, fallback is to prove the adapter/reducer with an in-process mock transport first, then retry real swarm.
