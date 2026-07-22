import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceEnvelopes } from '../prototypes/holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../prototypes/holepunch-sync/sample-envelopes.js';
import { createRoomStarterPackFromState } from '../prototypes/nostr-coordination/room-starter-pack.js';
import { createBuzzRoomStarterPackMessageEvent, createBuzzRoomStatusMessageEvent, parseBuzzM2IMessageEvent, BUZZ_STREAM_MESSAGE_KIND, BUZZ_M2I_STARTER_PACK_MESSAGE_TYPE, BUZZ_M2I_STATUS_MESSAGE_TYPE } from '../prototypes/nostr-coordination/buzz-room-adapter.js';

const CHANNEL_ID = '11111111-1111-4111-8111-111111111111';

function samplePack() {
  const state = reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
  return createRoomStarterPackFromState(state, { createdAt: Date.UTC(2026, 6, 22, 8, 28, 0) });
}

test('wraps room starter pack as BUZZ kind 9 channel message', () => {
  const starterPack = samplePack();
  const event = createBuzzRoomStarterPackMessageEvent({ channelId: CHANNEL_ID, starterPack });
  assert.equal(event.kind, BUZZ_STREAM_MESSAGE_KIND);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'h'), ['h', CHANNEL_ID]);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'm2i_message_type'), ['m2i_message_type', BUZZ_M2I_STARTER_PACK_MESSAGE_TYPE]);
  const parsed = parseBuzzM2IMessageEvent(event);
  assert.equal(parsed.type, BUZZ_M2I_STARTER_PACK_MESSAGE_TYPE);
  assert.match(parsed.starter_pack.messages.welcome, /Built for repeated games/);
});

test('wraps bot-safe status as BUZZ kind 9 channel message', () => {
  const starterPack = samplePack();
  const event = createBuzzRoomStatusMessageEvent({
    channelId: CHANNEL_ID,
    statusEvent: starterPack.signedStatusEvent,
    statusMessage: starterPack.messages.status
  });
  assert.equal(event.kind, BUZZ_STREAM_MESSAGE_KIND);
  const parsed = parseBuzzM2IMessageEvent(event);
  assert.equal(parsed.type, BUZZ_M2I_STATUS_MESSAGE_TYPE);
  assert.match(parsed.status_message, /Bot-safe summary only/);
});

test('rejects invalid channel ids and tampered BUZZ adapter events', () => {
  const starterPack = samplePack();
  assert.throws(() => createBuzzRoomStarterPackMessageEvent({ channelId: 'not-a-uuid', starterPack }), /channel id/);
  const event = createBuzzRoomStarterPackMessageEvent({ channelId: CHANNEL_ID, starterPack });
  const tampered = { ...event, content: event.content.replace('Built for repeated games', 'Changed') };
  assert.throws(() => parseBuzzM2IMessageEvent(tampered), /signature is invalid/);
});
