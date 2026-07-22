import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceEnvelopes } from '../prototypes/holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../prototypes/holepunch-sync/sample-envelopes.js';
import { assertBotSafeRoomStatus, createRoomStatusProjection, ROOM_STATUS_TYPE } from '../prototypes/nostr-coordination/private-room-projection.js';

test('private room projection exposes shared status without raw proof data', () => {
  const state = reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
  const projection = createRoomStatusProjection(state, { createdAt: Date.UTC(2026, 6, 22, 7, 20, 0) });
  assert.equal(projection.type, ROOM_STATUS_TYPE);
  assert.equal(projection.privacy, 'bot-safe-redacted');
  assert.equal(projection.challenge.code, 'RUNNER2-DAILY-BURPEES');
  assert.equal(projection.challenge.activityType, 'burpees');
  assert.equal(projection.totals.participantCount, 2);
  assert.equal(projection.totals.claimCount, 2);
  assert.deepEqual(projection.participants.map((participant) => participant.alias).sort(), ['Nono', 'Runner 2']);
  assert.equal(projection.participants.find((participant) => participant.alias === 'Nono').validDayCount, 1);
  assert.equal(projection.participants.find((participant) => participant.alias === 'Runner 2').validDayCount, 1);
  assert.equal(assertBotSafeRoomStatus(projection), true);
});

test('private room projection rejects accidental private data leakage', () => {
  const state = reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
  const projection = createRoomStatusProjection(state);
  assert.throws(() => assertBotSafeRoomStatus({ ...projection, payment: { invoice: 'lnbc...' } }), /leaked forbidden fields/);
  assert.throws(() => assertBotSafeRoomStatus({ ...projection, raw: { envelope_hash: 'abc' } }), /leaked forbidden fields/);
});

test('room status hash is stable for equivalent projection input', () => {
  const state = reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
  const a = createRoomStatusProjection(state, { createdAt: 12345 });
  const b = createRoomStatusProjection(JSON.parse(JSON.stringify(state)), { createdAt: 12345 });
  assert.equal(a.status_hash, b.status_hash);
});
