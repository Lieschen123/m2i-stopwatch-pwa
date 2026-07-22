# M2I Holepunch Sync Prototype

Experimental transport prototype for Move2Improve signed envelopes.

## Goal

Two local peers join the same Hyperswarm room, exchange M2I envelopes, and reduce them into the same board state.

## Run

```bash
npm run prototype:holepunch
npm run prototype:holepunch:persistence
npm run prototype:holepunch:local-socket
npm run prototype:holepunch:health
npm run prototype:holepunch:replication
npm run prototype:holepunch:restart
```

## Notes

- This is not the PWA runtime.
- This is not a production sync layer.
- Canonical truth remains signed M2I envelopes.
- `.data/` is local ignored test storage.

## Phase 2

`demo-persistence.mjs` uses Hypercore append-only local storage, restarts both peers with the same storage, appends one new claim, and verifies convergence without duplicate envelopes. `demo-restart.mjs` attempts the same over live Hyperswarm and currently exposes local reconnect timing flakiness.

## Scripts

- `prototype:holepunch` — real local Hyperswarm transport demo.
- `prototype:holepunch:persistence` — deterministic Hypercore persistence/restart/dedupe demo.
- `prototype:holepunch:local-socket` — Corestore replication over real local TCP sockets. This is the Phase 3 replication success path.
- `prototype:holepunch:health` — observable transport health demo: disconnected → syncing → synced.
- `prototype:holepunch:replication` — experimental live Hyperswarm + Corestore replication demo. Currently useful for debugging local swarm discovery timing.
- `prototype:holepunch:restart` — older experimental live Hyperswarm + Hypercore JSON-line restart demo. Not a pass/fail release gate.

## Phase 3

`demo-corestore-local-socket.mjs` proves proper Corestore replication streams over real sockets. It reopens both peers, exchanges writer keys, replicates append-only logs, appends one new envelope after restart, and converges without duplicates. Live Hyperswarm discovery remains the flaky part on this machine, so `demo-corestore-replication.mjs` is currently diagnostic rather than release-gating.

## Transport health

`demo-transport-health.mjs` adds the first observable sync layer. Peers now expose `healthStatus()` / `refreshHealth()` with status, connection count, writer counts, sync timestamps, last error, and reducer state hash. This is the shape needed before a Pear or PWA-facing sync UI.
