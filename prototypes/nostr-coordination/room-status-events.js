import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { CLAIM_KIND, CLIENT_NAME } from '../../src/constants.js';
import { canonicalJson, sha256Hex } from '../../src/crypto.js';
import { assertBotSafeRoomStatus, ROOM_STATUS_TYPE } from './private-room-projection.js';

export const ROOM_STATUS_EVENT_VERSION = 1;
export const ROOM_STATUS_TAG = 'm2i_room_status';

function tagValue(tags = [], name) {
  return tags.find((tag) => tag[0] === name)?.[1] || '';
}

export function roomStatusTags(status) {
  assertBotSafeRoomStatus(status);
  const tags = [
    ['d', `m2i-room-status:${status.challenge?.id || status.challenge?.code || 'unknown'}:${status.status_hash}`],
    [ROOM_STATUS_TAG, 'v1'],
    ['client', CLIENT_NAME],
    ['status_type', ROOM_STATUS_TYPE],
    ['status_hash', status.status_hash],
    ['privacy', status.privacy || 'bot-safe-redacted']
  ];
  if (status.challenge?.id) tags.push(['challenge', status.challenge.id]);
  if (status.challenge?.code) tags.push(['challenge_code', status.challenge.code]);
  if (status.challenge?.activityType) tags.push(['activity', status.challenge.activityType]);
  return tags;
}

export function createRoomStatusEvent({ status, secretKey = generateSecretKey(), createdAt } = {}) {
  assertBotSafeRoomStatus(status);
  return finalizeEvent(
    {
      kind: CLAIM_KIND,
      pubkey: getPublicKey(secretKey),
      created_at: createdAt || Math.floor((status.created_at || Date.now()) / 1000),
      tags: roomStatusTags(status),
      content: canonicalJson(status)
    },
    secretKey
  );
}

export function isRoomStatusEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.kind !== CLAIM_KIND) return false;
  if (tagValue(event.tags, ROOM_STATUS_TAG) !== 'v1') return false;
  return Boolean(tagValue(event.tags, 'status_hash'));
}

export function roomStatusFromEvent(event, { verify = true } = {}) {
  if (!isRoomStatusEvent(event)) throw new Error('Nostr event is not an M2I room status event.');
  if (verify && (getEventHash(event) !== event.id || !verifyEvent(event))) throw new Error('Nostr room status event signature is invalid.');
  const status = JSON.parse(event.content);
  if (status.type !== ROOM_STATUS_TYPE) throw new Error('Room status content type is invalid.');
  assertBotSafeRoomStatus(status);
  const base = { ...status };
  delete base.status_hash;
  const expectedHash = sha256Hex(canonicalJson(base));
  if (status.status_hash !== expectedHash) throw new Error('Room status hash does not match content.');
  const taggedHash = tagValue(event.tags, 'status_hash');
  if (taggedHash !== status.status_hash) throw new Error('Nostr status_hash tag does not match content.');
  if (tagValue(event.tags, 'privacy') !== (status.privacy || 'bot-safe-redacted')) throw new Error('Nostr privacy tag does not match content.');
  return status;
}
