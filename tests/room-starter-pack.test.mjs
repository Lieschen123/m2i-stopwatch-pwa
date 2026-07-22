import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceEnvelopes } from '../prototypes/holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../prototypes/holepunch-sync/sample-envelopes.js';
import { assertRoomStarterPackSafe, createRoomStarterPackFromState, ROOM_STARTER_PACK_TYPE } from '../prototypes/nostr-coordination/room-starter-pack.js';
import { roomStatusFromEvent } from '../prototypes/nostr-coordination/room-status-events.js';

function sampleState() {
  return reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
}

test('room starter pack bundles all safe room startup artifacts', () => {
  const pack = createRoomStarterPackFromState(sampleState(), { createdAt: Date.UTC(2026, 6, 22, 8, 5, 0) });
  assert.equal(pack.type, ROOM_STARTER_PACK_TYPE);
  assert.equal(pack.challenge.code, 'RUNNER2-DAILY-BURPEES');
  assert.match(pack.messages.welcome, /Built for repeated games/);
  assert.match(pack.messages.whatToDo, /Open your M2I challenge/);
  assert.match(pack.messages.repeatedGame, /one valid day counts per calendar day/);
  assert.match(pack.messages.status, /Nono — 1\/14 days/);
  assert.equal(assertRoomStarterPackSafe(pack), true);
});

test('room starter pack signed status event verifies and remains bot safe', () => {
  const pack = createRoomStarterPackFromState(sampleState());
  const status = roomStatusFromEvent(pack.signedStatusEvent);
  assert.equal(status.challenge.code, 'RUNNER2-DAILY-BURPEES');
  assert.equal(status.totals.participantCount, 2);
  assert.equal(status.totals.claimCount, 2);
});

test('room starter pack rejects unsafe messages', () => {
  const pack = createRoomStarterPackFromState(sampleState());
  const unsafe = {
    ...pack,
    messages: { ...pack.messages, status: `${pack.messages.status}\npayment invoice lnbc...` }
  };
  assert.throws(() => assertRoomStarterPackSafe(unsafe), /leaked forbidden words/);
});
