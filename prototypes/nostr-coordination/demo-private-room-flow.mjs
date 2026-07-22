import { peerAEnvelopes, peerBEnvelopes } from '../holepunch-sync/sample-envelopes.js';
import { createPrivateProofEvent, createRoomKey } from './private-proof-events.js';
import { createPrivateRoomUpdate } from './private-room-flow.js';

const channelId = '11111111-1111-4111-8111-111111111111';
const roomKey = createRoomKey('runner-2-private-room-flow-demo-key');
const wrongKey = createRoomKey('wrong-room-key');
const envelopes = [...peerAEnvelopes(), ...peerBEnvelopes()];
const privateProofEvents = envelopes.map((envelope, index) => createPrivateProofEvent({
  envelope,
  roomKey,
  channelId,
  roomId: channelId,
  challengeCode: 'RUNNER2-DAILY-BURPEES',
  senderAlias: index < 3 ? 'Nono' : 'Runner 2',
  createdAt: Math.floor((Date.UTC(2026, 6, 22, 8, 43, 0) + index * 1000) / 1000)
}));
const undecryptableBotEvent = createPrivateProofEvent({
  envelope: envelopes[0],
  roomKey: wrongKey,
  channelId,
  roomId: channelId,
  challengeCode: 'RUNNER2-DAILY-BURPEES',
  senderAlias: 'Bot should not decrypt this',
  createdAt: Math.floor(Date.UTC(2026, 6, 22, 8, 44, 0) / 1000)
});
const update = createPrivateRoomUpdate({
  privateProofEvents: [...privateProofEvents, privateProofEvents[0], undecryptableBotEvent],
  roomKey,
  channelId,
  createdAt: Date.UTC(2026, 6, 22, 8, 43, 0)
});

console.log('Private room flow update');
console.log(JSON.stringify({
  acceptedCount: update.ingest.acceptedCount,
  duplicateCount: update.ingest.duplicateCount,
  rejectedCount: update.ingest.rejectedCount,
  statusHash: update.status.status_hash,
  signedStatusKind: update.signedStatusEvent.kind,
  buzzStatusKind: update.buzzStatusMessageEvent.kind,
  buzzStatusTags: update.buzzStatusMessageEvent.tags,
  statusMessage: update.statusMessage
}, null, 2));
console.log('\n✅ Private room flow passed: encrypted proofs → decrypt/import queue → reduce → redacted status + BUZZ message.');
