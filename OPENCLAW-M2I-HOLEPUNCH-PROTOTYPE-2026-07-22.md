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

---

## Phase 2 update — Hypercore persistence

Added Hypercore-backed peer storage:

- `prototypes/holepunch-sync/hypercore-peer.js`
- `prototypes/holepunch-sync/demo-persistence.mjs`

Added script:

```bash
npm run prototype:holepunch:persistence
```

Result:

```text
✅ Hypercore persistence passed: reopen, dedupe, append one new envelope, converge.
```

What it proves:

1. Each peer can persist signed M2I envelopes to an append-only Hypercore log.
2. Peers can reopen the same local logs after restart.
3. Existing envelopes are deduped by `envelope_hash`.
4. Appending one new claim after restart adds exactly one new envelope.
5. The deterministic reducer converges to the same board state after sync.

Caveat found:

The live `demo-restart.mjs` path, Hypercore + Hyperswarm after process-level restart, exposed local swarm reconnect timing flakiness. Sometimes peers join the topic but no socket opens quickly enough for live update propagation. This is useful signal: production design needs explicit connection state, retry/backoff, and probably Hypercore replication streams rather than ad-hoc JSON line rebroadcast.

Updated recommendation:

- Phase 2 storage/dedupe is proven.
- Phase 3 should replace ad-hoc JSON-line rebroadcast with proper Hypercore replication over Hyperswarm sockets, plus connection retry/backoff and observable sync status.

---

## Phase 3 update — Corestore replication streams

Added proper Corestore replication peer and real-socket demo:

- `prototypes/holepunch-sync/corestore-replication-peer.js`
- `prototypes/holepunch-sync/demo-corestore-local-socket.mjs`
- `prototypes/holepunch-sync/demo-corestore-replication.mjs`

Added scripts:

```bash
npm run prototype:holepunch:local-socket
npm run prototype:holepunch:replication
```

Result for release-gated path:

```text
✅ Corestore replication over real sockets passed: restart, dedupe, append, converge.
```

What it proves:

1. Each peer owns a local writer core in a Corestore.
2. Peers exchange writer keys over a socket handshake.
3. Corestore replication streams move append-only envelope logs.
4. After restart, both peers reload existing writer keys and logs.
5. Appending one new envelope after restart syncs to the other peer.
6. The reducer converges without duplicate envelopes.

Remaining issue:

The same Corestore replication code wired to live Hyperswarm (`prototype:holepunch:replication`) still exposes local discovery timing flakiness: peers can join the room topic without opening a socket quickly. This is now isolated to discovery/connectivity, not the M2I envelope reducer or Corestore replication model.

Next step:

Build a transport health layer:

- explicit connection state (`disconnected`, `discovering`, `connected`, `syncing`, `synced`, `stale`)
- retry/backoff for Hyperswarm discovery
- periodic reannounce/rejoin
- sync timeout and user-visible status
- later: test on two real devices/networks or Pear runtime, not only two local processes

---

## Phase 4 update — Transport health layer

Added observable sync status to `M2ICorestoreReplicationPeer`:

- `disconnected`
- `discovering`
- `connected`
- `syncing`
- `synced`
- `stale`

Added methods:

- `healthStatus()`
- `refreshHealth({ expectedClaimCount })`
- `stateSummary()`
- `markError(error)`
- `trackSocket(socket)`

Added script:

```bash
npm run prototype:holepunch:health
```

Result:

```text
✅ Transport health passed: disconnected → syncing → synced with observable status.
```

What it proves:

1. Before transport, peers report `disconnected` and expose local reducer state.
2. During socket connection, peers track live socket count and writer-key discovery.
3. After replication, peers report `synced`, matching state hash, writer counts, seen count, participant count, and claim count.
4. This is the minimal status surface needed for a future Pear/local UI: users should see whether sync is disconnected, discovering, syncing, synced, or stale.

Next step:

Add retry/backoff/reannounce around Hyperswarm discovery so the live DHT demo can move from diagnostic to reliable.
