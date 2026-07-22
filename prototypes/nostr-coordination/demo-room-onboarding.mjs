import { reduceEnvelopes } from '../holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../holepunch-sync/sample-envelopes.js';
import { createRoomStatusProjection } from './private-room-projection.js';
import { formatRepeatedGamesMessage, formatWelcomeMessage, formatWhatToDoMessage } from './room-onboarding-messages.js';

const status = createRoomStatusProjection(reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]));

console.log('--- Welcome ---');
console.log(formatWelcomeMessage(status));
console.log('\n--- What to do ---');
console.log(formatWhatToDoMessage(status));
console.log('\n--- Repeated game ---');
console.log(formatRepeatedGamesMessage(status));
console.log('\n✅ Room onboarding messages passed: welcome, instructions, repeated-game norms.');
