import { assertBotSafeRoomStatus, createRoomStatusProjection } from './private-room-projection.js';
import { createRoomStatusEvent, roomStatusFromEvent } from './room-status-events.js';
import { formatRoomStatusMessage } from './room-status-format.js';
import { formatRepeatedGamesMessage, formatWelcomeMessage, formatWhatToDoMessage } from './room-onboarding-messages.js';

export const ROOM_STARTER_PACK_VERSION = 1;
export const ROOM_STARTER_PACK_TYPE = 'm2i.room_starter_pack.v1';

function assertBotSafeText(label, text) {
  const lower = String(text || '').toLowerCase();
  const forbidden = ['envelope_hash', 'canonical_json', 'payment', 'invoice', 'settlement', 'preimage', 'heart', 'gps', 'route', 'signature', 'nsec', 'private key'];
  const leaked = forbidden.filter((term) => lower.includes(term));
  if (leaked.length) throw new Error(`${label} leaked forbidden words: ${leaked.join(', ')}`);
}

export function createRoomStarterPackFromStatus(status, { createdAt = Date.now(), secretKey } = {}) {
  assertBotSafeRoomStatus(status);
  const signedStatusEvent = createRoomStatusEvent({ status, secretKey, createdAt: Math.floor(createdAt / 1000) });
  const verifiedStatus = roomStatusFromEvent(signedStatusEvent);
  const pack = {
    version: ROOM_STARTER_PACK_VERSION,
    type: ROOM_STARTER_PACK_TYPE,
    created_at: createdAt,
    challenge: {
      id: status.challenge?.id || '',
      code: status.challenge?.code || '',
      activityType: status.challenge?.activityType || ''
    },
    messages: {
      welcome: formatWelcomeMessage(verifiedStatus),
      whatToDo: formatWhatToDoMessage(verifiedStatus),
      repeatedGame: formatRepeatedGamesMessage(verifiedStatus),
      status: formatRoomStatusMessage(verifiedStatus)
    },
    signedStatusEvent
  };
  assertRoomStarterPackSafe(pack);
  return pack;
}

export function createRoomStarterPackFromState(state, options = {}) {
  const status = createRoomStatusProjection(state, { createdAt: options.createdAt || Date.now() });
  return createRoomStarterPackFromStatus(status, options);
}

export function assertRoomStarterPackSafe(pack) {
  if (pack.type !== ROOM_STARTER_PACK_TYPE) throw new Error('Room starter pack type is invalid.');
  for (const [label, message] of Object.entries(pack.messages || {})) assertBotSafeText(label, message);
  const status = roomStatusFromEvent(pack.signedStatusEvent);
  assertBotSafeRoomStatus(status);
  return true;
}
