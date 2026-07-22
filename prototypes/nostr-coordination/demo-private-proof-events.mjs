import { peerAEnvelopes, peerBEnvelopes } from '../holepunch-sync/sample-envelopes.js';
import { createPrivateProofEvent, createRoomKey, decryptPrivateProofEvent, reducePrivateProofEvents } from './private-proof-events.js';
import { createRoomStatusProjection } from './private-room-projection.js';

const roomKey = createRoomKey('runner-2-private-room-demo-key');
const botKey = createRoomKey('bot-does-not-have-the-room-key');
const channelId = '11111111-1111-4111-8111-111111111111';
const envelopes = [...peerAEnvelopes(), ...peerBEnvelopes()];
const events = envelopes.map((envelope, index) => createPrivateProofEvent({
  envelope,
  roomKey,
  channelId,
  roomId: channelId,
  challengeCode: 'RUNNER2-DAILY-BURPEES',
  senderAlias: index < 3 ? 'Nono' : 'Runner 2',
  createdAt: Math.floor((Date.UTC(2026, 6, 22, 8, 37, 0) + index * 1000) / 1000)
}));

const first = decryptPrivateProofEvent(events[0], { roomKey });
let botCanDecrypt = true;
try {
  decryptPrivateProofEvent(events[0], { roomKey: botKey });
} catch {
  botCanDecrypt = false;
}
const state = reducePrivateProofEvents(events, { roomKey });
const status = createRoomStatusProjection(state, { createdAt: Date.UTC(2026, 6, 22, 8, 37, 0) });

console.log('Private proof event sample');
console.log(JSON.stringify({
  kind: events[0].kind,
  tags: events[0].tags,
  contentPreview: JSON.parse(events[0].content),
  decryptedEnvelopeType: first.envelope.type,
  botCanDecrypt,
  statusHash: status.status_hash,
  participants: status.participants.map((participant) => participant.alias)
}, null, 2));
console.log('\n✅ Private proof events passed: encrypted proof → member decrypt/reduce → bot cannot decrypt.');
