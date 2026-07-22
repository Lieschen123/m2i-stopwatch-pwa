import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceEnvelopes } from '../prototypes/holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../prototypes/holepunch-sync/sample-envelopes.js';
import { createRoomStatusProjection } from '../prototypes/nostr-coordination/private-room-projection.js';
import { createRoomStatusEvent, isRoomStatusEvent, roomStatusFromEvent } from '../prototypes/nostr-coordination/room-status-events.js';

function sampleStatus() {
  const state = reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
  return createRoomStatusProjection(state, { createdAt: Date.UTC(2026, 6, 22, 7, 30, 0) });
}

test('room status wraps into a signed Nostr event and unwraps unchanged', () => {
  const status = sampleStatus();
  const event = createRoomStatusEvent({ status });
  assert.equal(isRoomStatusEvent(event), true);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'm2i_room_status'), ['m2i_room_status', 'v1']);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'status_hash'), ['status_hash', status.status_hash]);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'privacy'), ['privacy', 'bot-safe-redacted']);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'challenge_code'), ['challenge_code', 'RUNNER2-DAILY-BURPEES']);
  const unwrapped = roomStatusFromEvent(event);
  assert.deepEqual(unwrapped, status);
});

test('room status event rejects tampered content by event id/signature check', () => {
  const event = createRoomStatusEvent({ status: sampleStatus() });
  const tampered = { ...event, content: event.content.replace('Runner 2', 'Runner X') };
  assert.throws(() => roomStatusFromEvent(tampered), /signature is invalid/);
});

test('room status event rejects tag/content status hash mismatch', () => {
  const event = createRoomStatusEvent({ status: sampleStatus() });
  const tampered = {
    ...event,
    tags: event.tags.map((tag) => tag[0] === 'status_hash' ? ['status_hash', '0'.repeat(64)] : tag)
  };
  assert.throws(() => roomStatusFromEvent(tampered, { verify: false }), /status_hash tag does not match/);
});

test('room status event rejects private data in content even with verification disabled', () => {
  const status = { ...sampleStatus(), payment: { invoice: 'lnbc...' } };
  assert.throws(() => createRoomStatusEvent({ status }), /leaked forbidden fields/);
});
