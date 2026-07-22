# M2I Holepunch Sync Prototype

Experimental transport prototype for Move2Improve signed envelopes.

## Goal

Two local peers join the same Hyperswarm room, exchange M2I envelopes, and reduce them into the same board state.

## Run

```bash
npm run prototype:holepunch
npm run prototype:holepunch:persistence
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
- `prototype:holepunch:persistence` — deterministic Hypercore persistence/restart/dedupe demo. This is the Phase 2 success path.
- `prototype:holepunch:restart` — experimental live Hyperswarm + Hypercore restart demo. Currently useful for debugging local swarm timing, not a pass/fail release gate.
