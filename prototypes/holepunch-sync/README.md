# M2I Holepunch Sync Prototype

Experimental transport prototype for Move2Improve signed envelopes.

## Goal

Two local peers join the same Hyperswarm room, exchange M2I envelopes, and reduce them into the same board state.

## Run

```bash
npm run prototype:holepunch
```

## Notes

- This is not the PWA runtime.
- This is not a production sync layer.
- Canonical truth remains signed M2I envelopes.
- `.data/` is local ignored test storage.
