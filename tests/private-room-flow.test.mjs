import assert from 'node:assert/strict';
import { test } from 'node:test';
import { peerAEnvelopes, peerBEnvelopes } from '../prototypes/holepunch-sync/sample-envelopes.js';
import { createPrivateProofEvent, createRoomKey } from '../prototypes/nostr-coordination/private-proof-events.js';
import { createPrivateRoomUpdate, ingestPrivateProofEvents } from '../prototypes/nostr-coordination/private-room-flow.js';
import { assertBotSafeRoomStatus } from '../prototypes/nostr-coordination/private-room-projection.js';
import { roomStatusFromEvent } from '../prototypes/nostr-coordination/room-status-events.js';
import { parseBuzzM2IMessageEvent, BUZZ_M2I_STATUS_MESSAGE_TYPE } from '../prototypes/nostr-coordination/buzz-room-adapter.js';

const CHANNEL_ID = '11111111-1111-4111-8111-111111111111';

function samplePrivateEvents() {
  const roomKey = createRoomKey('runner-2-flow-room-key');
  const wrongKey = createRoomKey('wrong-flow-room-key');
  const envelopes = [...peerAEnvelopes(), ...peerBEnvelopes()];
  const events = envelopes.map((envelope, index) => createPrivateProofEvent({
    envelope,
    roomKey,
    channelId: CHANNEL_ID,
    roomId: CHANNEL_ID,
    challengeCode: 'RUNNER2-DAILY-BURPEES',
    senderAlias: index < 3 ? 'Nono' : 'Runner 2',
    createdAt: 1784709780 + index
  }));
  const undecryptable = createPrivateProofEvent({
    envelope: envelopes[0],
    roomKey: wrongKey,
    channelId: CHANNEL_ID,
    roomId: CHANNEL_ID,
    challengeCode: 'RUNNER2-DAILY-BURPEES',
    senderAlias: 'Bot',
    createdAt: 1784709900
  });
  return { roomKey, envelopes, events, undecryptable };
}

test('ingests encrypted proof events, dedupes envelopes, and dead-letters undecryptable events', () => {
  const { roomKey, events, undecryptable } = samplePrivateEvents();
  const ingest = ingestPrivateProofEvents([...events, events[0], undecryptable, { kind: 1, content: 'noise' }], { roomKey });
  assert.equal(ingest.envelopes.length, 5);
  assert.equal(ingest.acceptedCount, 5);
  assert.equal(ingest.duplicateCount, 1);
  assert.equal(ingest.rejectedCount, 2);
  assert.equal(ingest.rejected[0].reason, 'Private proof could not be decrypted with this room key.');
  assert.equal(ingest.rejected[1].reason, 'not-private-proof-event');
});

test('private room update emits signed redacted status and readable bot-safe message', () => {
  const { roomKey, events } = samplePrivateEvents();
  const update = createPrivateRoomUpdate({
    privateProofEvents: events,
    roomKey,
    channelId: CHANNEL_ID,
    createdAt: Date.UTC(2026, 6, 22, 8, 43, 0)
  });
  assert.equal(update.ingest.acceptedCount, 5);
  assert.equal(update.status.totals.participantCount, 2);
  assert.equal(update.status.totals.claimCount, 2);
  assertBotSafeRoomStatus(update.status);
  assert.deepEqual(roomStatusFromEvent(update.signedStatusEvent), update.status);
  assert.match(update.statusMessage, /Bot-safe summary only/);
});

test('private room update can wrap redacted status as BUZZ room message', () => {
  const { roomKey, events } = samplePrivateEvents();
  const update = createPrivateRoomUpdate({ privateProofEvents: events, roomKey, channelId: CHANNEL_ID });
  const parsed = parseBuzzM2IMessageEvent(update.buzzStatusMessageEvent);
  assert.equal(update.buzzStatusMessageEvent.kind, 9);
  assert.deepEqual(update.buzzStatusMessageEvent.tags.find((tag) => tag[0] === 'h'), ['h', CHANNEL_ID]);
  assert.equal(parsed.type, BUZZ_M2I_STATUS_MESSAGE_TYPE);
  assert.match(parsed.status_message, /RUNNER2-DAILY-BURPEES/);
});

test('flow output does not leak private proof/payment/body data into bot-visible artifacts', () => {
  const { roomKey, events, envelopes } = samplePrivateEvents();
  const update = createPrivateRoomUpdate({ privateProofEvents: events, roomKey, channelId: CHANNEL_ID });
  const botVisible = JSON.stringify({ status: update.status, message: update.statusMessage, buzz: update.buzzStatusMessageEvent });
  assert.equal(botVisible.includes(envelopes[0].envelope_hash), false);
  assert.equal(botVisible.includes('historyEntry'), false);
  assert.equal(botVisible.includes('sender_alias'), false);
  assert.equal(botVisible.includes('payment'), false);
  assert.equal(botVisible.includes('heart'), false);
  assert.equal(botVisible.includes('gps'), false);
});
