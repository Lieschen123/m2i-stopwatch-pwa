import { reduceEnvelopes } from '../holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../holepunch-sync/sample-envelopes.js';
import { createRoomStarterPackFromState } from './room-starter-pack.js';
import { createBuzzRoomStarterPackMessageEvent, parseBuzzM2IMessageEvent } from './buzz-room-adapter.js';

const channelId = '11111111-1111-4111-8111-111111111111';
const state = reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
const starterPack = createRoomStarterPackFromState(state, { createdAt: Date.UTC(2026, 6, 22, 8, 28, 0) });
const buzzEvent = createBuzzRoomStarterPackMessageEvent({ channelId, starterPack, createdAt: Math.floor(Date.UTC(2026, 6, 22, 8, 28, 0) / 1000) });
const parsed = parseBuzzM2IMessageEvent(buzzEvent);

console.log('BUZZ-compatible M2I event');
console.log(JSON.stringify({ kind: buzzEvent.kind, tags: buzzEvent.tags, id: buzzEvent.id, payloadType: parsed.type }, null, 2));
console.log('\n✅ BUZZ room adapter passed: M2I starter pack wrapped as kind:9 channel message with h tag.');
