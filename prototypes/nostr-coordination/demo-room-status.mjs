import { canonicalJson } from '../../src/crypto.js';
import { reduceEnvelopes } from '../holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../holepunch-sync/sample-envelopes.js';
import { createRoomStatusProjection } from './private-room-projection.js';
import { createRoomStatusEvent, roomStatusFromEvent } from './room-status-events.js';

const state = reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
const status = createRoomStatusProjection(state, { createdAt: Date.UTC(2026, 6, 22, 7, 45, 0) });
const event = createRoomStatusEvent({ status });
const unwrapped = roomStatusFromEvent(event);

console.log('Bot-safe room status projection');
console.log(JSON.stringify(status, null, 2));
console.log('\nSigned room status event tags');
console.log(JSON.stringify(event.tags, null, 2));

if (canonicalJson(status) !== canonicalJson(unwrapped)) {
  console.error('❌ signed room status event did not unwrap to the same projection');
  process.exit(1);
}
console.log('\n✅ Room status event passed: private state → redacted status → signed room event → verified status.');
