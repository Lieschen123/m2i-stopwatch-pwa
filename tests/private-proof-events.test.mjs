import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventHash } from 'nostr-tools/pure';
import { reduceEnvelopes } from '../prototypes/holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../prototypes/holepunch-sync/sample-envelopes.js';
import { createPrivateProofEvent, createRoomKey, decryptPrivateProofEvent, isPrivateProofEvent, reducePrivateProofEvents } from '../prototypes/nostr-coordination/private-proof-events.js';
import { createRoomStatusProjection, assertBotSafeRoomStatus } from '../prototypes/nostr-coordination/private-room-projection.js';

const CHANNEL_ID = '11111111-1111-4111-8111-111111111111';

function sampleEvents() {
  const roomKey = createRoomKey('runner-2-room-key');
  const envelopes = [...peerAEnvelopes(), ...peerBEnvelopes()];
  const events = envelopes.map((envelope, index) => createPrivateProofEvent({
    envelope,
    roomKey,
    channelId: CHANNEL_ID,
    roomId: CHANNEL_ID,
    challengeCode: 'RUNNER2-DAILY-BURPEES',
    senderAlias: index < 3 ? 'Nono' : 'Runner 2',
    createdAt: 1784709420 + index
  }));
  return { roomKey, envelopes, events };
}

test('wraps private proof envelope in encrypted room event', () => {
  const { roomKey, envelopes, events } = sampleEvents();
  const event = events[0];
  assert.equal(isPrivateProofEvent(event), true);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'h'), ['h', CHANNEL_ID]);
  assert.equal(event.content.includes(envelopes[0].envelope_hash), false);
  assert.equal(event.content.includes('historyEntry'), false);
  assert.equal(event.content.includes('sender_alias'), false);
  assert.equal(event.content.includes('envelope_type'), false);
  assert.equal(event.content.includes('Nono'), false);
  assert.equal(event.content.includes('Runner 2'), false);
  const decrypted = decryptPrivateProofEvent(event, { roomKey });
  assert.equal(decrypted.envelope.envelope_hash, envelopes[0].envelope_hash);
});

test('non-member or bot without room key cannot decrypt private proof', () => {
  const { events } = sampleEvents();
  const wrongKey = createRoomKey('bot-does-not-have-this-key');
  assert.throws(() => decryptPrivateProofEvent(events[0], { roomKey: wrongKey }), /could not be decrypted/);
});

test('decrypted private proof events reduce to same board state as raw envelopes', () => {
  const { roomKey, envelopes, events } = sampleEvents();
  const rawState = reduceEnvelopes(envelopes);
  const privateRoomState = reducePrivateProofEvents(events, { roomKey });
  assert.deepEqual(privateRoomState, rawState);
});

test('redacted status after private proof import is bot safe', () => {
  const { roomKey, events } = sampleEvents();
  const state = reducePrivateProofEvents(events, { roomKey });
  const status = createRoomStatusProjection(state, { createdAt: Date.UTC(2026, 6, 22, 8, 37, 0) });
  assertBotSafeRoomStatus(status);
  assert.equal(status.participants.length, 2);
  assert.equal(JSON.stringify(status).includes('envelope_hash'), false);
});

test('tampered private proof event is rejected before decrypting', () => {
  const { roomKey, events } = sampleEvents();
  const event = events[0];
  const tampered = { ...event, content: event.content.replace('xchacha20poly1305-v1', 'xchacha20poly1305-v2') };
  assert.notEqual(getEventHash(tampered), tampered.id);
  assert.throws(() => decryptPrivateProofEvent(tampered, { roomKey }), /signature is invalid/);
});
