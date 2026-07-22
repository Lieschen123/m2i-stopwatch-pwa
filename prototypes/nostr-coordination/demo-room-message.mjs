import { reduceEnvelopes } from '../holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../holepunch-sync/sample-envelopes.js';
import { createRoomStatusProjection } from './private-room-projection.js';
import { createRoomStatusEvent, roomStatusFromEvent } from './room-status-events.js';
import { formatRoomStatusMessage } from './room-status-format.js';

const state = reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]);
const status = createRoomStatusProjection(state, { createdAt: Date.UTC(2026, 6, 22, 7, 50, 0) });
const event = createRoomStatusEvent({ status });
const verifiedStatus = roomStatusFromEvent(event);
const message = formatRoomStatusMessage(verifiedStatus);

console.log(message);

if (!message.includes('RUNNER2-DAILY-BURPEES') || !message.includes('Bot-safe summary only')) {
  console.error('❌ room message is missing expected status text');
  process.exit(1);
}
console.log('\n✅ Room status message passed: signed bot-safe status → human-readable room update.');
