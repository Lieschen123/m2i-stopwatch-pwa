import { reduceEnvelopes } from '../holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../holepunch-sync/sample-envelopes.js';
import { assertRoomStarterPackSafe, createRoomStarterPackFromState } from './room-starter-pack.js';

const state = reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
const pack = createRoomStarterPackFromState(state, { createdAt: Date.UTC(2026, 6, 22, 8, 5, 0) });

console.log('Room starter pack messages');
console.log('\n--- Welcome ---');
console.log(pack.messages.welcome);
console.log('\n--- What to do ---');
console.log(pack.messages.whatToDo);
console.log('\n--- Repeated game ---');
console.log(pack.messages.repeatedGame);
console.log('\n--- Status ---');
console.log(pack.messages.status);
console.log('\nSigned status event id');
console.log(pack.signedStatusEvent.id);

assertRoomStarterPackSafe(pack);
console.log('\n✅ Room starter pack passed: welcome + instructions + norms + signed status + status message.');
