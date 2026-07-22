# M2I Holepunch Prototype Build Report

**Date:** 2026-07-22  
**Commit:** `07b87df feat: add holepunch sync prototype`  
**Status:** Phase 1 prototype working and pushed to `main`.

---

## What was built

A separate experimental Node/Hyperswarm prototype under:

`prototypes/holepunch-sync/`

Files:
- `room-topic.js` — derives deterministic 32-byte swarm topic from challenge room id.
- `sample-envelopes.js` — creates sample M2I challenge/join/claim envelopes using existing M2I modules.
- `reducer.js` — materializes simple board state from signed envelopes.
- `peer.js` — joins Hyperswarm, sends/receives envelope JSON lines, deduplicates, persists JSONL log.
- `demo-local.mjs` — runs Peer A and Peer B locally and checks convergence.
- `README.md` — run notes.

Added script:

```bash
npm run prototype:holepunch
```

Added dependencies:
- `hyperswarm@4.17.0`
- `b4a@1.8.1`

Local storage ignored:

`prototypes/holepunch-sync/.data/`

---

## Result

The prototype successfully proved the basic transport loop:

1. Peer A joins room `RUNNER2-DAILY-BURPEES`.
2. Peer B joins same room.
3. Peer A starts with challenge + Nono join/claim envelopes.
4. Peer B starts with Runner 2 join/claim envelopes.
5. Peers exchange envelopes over Hyperswarm.
6. Both reduce to identical board state:
   - challenge: `RUNNER2-DAILY-BURPEES`
   - participants: `Nono`, `Runner 2`
   - claims: 2 total, one per participant
7. Demo exits with:

```text
✅ Holepunch prototype converged: both peers have same board state.
```

---

## Important fix during build

First run failed to converge because joining/flushing the discovery alone was not enough. Adding:

```js
await this.swarm.flush();
```

after `discovery.flushed()` made peer exchange work.

Lesson: for local Hyperswarm demos, explicitly flush the swarm after joining the topic.

---

## Tests

```bash
npm test
```

Result:

```text
60/60 passing
```

---

## Product interpretation

This confirms the architecture direction:

```text
M2I signed envelopes
        ↓
coordination adapter
        ↓
manual share | future Nostr | Holepunch room
        ↓
deterministic board reducer
```

Holepunch can be a transport for signed M2I objects. It should not become canonical truth.

---

## Still not solved

- This is not a browser/iOS Safari solution.
- This is not Pear mobile/desktop packaging.
- This is not Hypercore/Corestore persistence yet.
- This is not multi-device identity/key management.
- This is not production privacy/anonymity.
- NAT/device reliability not tested beyond local demo.

---

## Recommended next step

Phase 2 should add append-only storage:

1. Replace/augment JSONL persistence with Hypercore or Corestore.
2. Keep the same reducer and envelope validation.
3. Add a multi-run test proving dedupe/resume:
   - run peer A and B,
   - stop,
   - restart with same storage,
   - append a new claim,
   - confirm both converge without duplicates.

Only after that should we consider Pear UI/runtime packaging.
