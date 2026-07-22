import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { CLIENT_NAME } from '../../src/constants.js';
import { canonicalJson } from '../../src/crypto.js';
import { assertRoomStarterPackSafe } from './room-starter-pack.js';
import { assertBotSafeRoomStatus } from './private-room-projection.js';
import { roomStatusFromEvent } from './room-status-events.js';

export const BUZZ_STREAM_MESSAGE_KIND = 9;
export const BUZZ_STREAM_MESSAGE_V2_KIND = 40002;
export const BUZZ_M2I_ADAPTER_VERSION = 1;
export const BUZZ_M2I_STATUS_MESSAGE_TYPE = 'm2i.buzz.status_message.v1';
export const BUZZ_M2I_STARTER_PACK_MESSAGE_TYPE = 'm2i.buzz.starter_pack.v1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertBuzzChannelId(channelId) {
  if (!UUID_RE.test(channelId || '')) throw new Error('BUZZ channel id must be a UUID used in the h tag.');
}

function tagValue(tags = [], name) {
  return tags.find((tag) => tag[0] === name)?.[1] || '';
}

function buzzTags({ channelId, messageType, statusHash, challengeCode }) {
  assertBuzzChannelId(channelId);
  const tags = [
    ['h', channelId],
    ['m2i', 'v1'],
    ['m2i_buzz_adapter', String(BUZZ_M2I_ADAPTER_VERSION)],
    ['m2i_message_type', messageType],
    ['client', CLIENT_NAME]
  ];
  if (statusHash) tags.push(['status_hash', statusHash]);
  if (challengeCode) tags.push(['challenge_code', challengeCode]);
  return tags;
}

export function createBuzzRoomStatusMessageEvent({ channelId, statusEvent, statusMessage, secretKey = generateSecretKey(), createdAt } = {}) {
  const status = roomStatusFromEvent(statusEvent);
  assertBotSafeRoomStatus(status);
  const content = canonicalJson({
    type: BUZZ_M2I_STATUS_MESSAGE_TYPE,
    version: BUZZ_M2I_ADAPTER_VERSION,
    status_message: statusMessage,
    signed_status_event: statusEvent
  });
  return finalizeEvent(
    {
      kind: BUZZ_STREAM_MESSAGE_KIND,
      pubkey: getPublicKey(secretKey),
      created_at: createdAt || Math.floor(Date.now() / 1000),
      tags: buzzTags({
        channelId,
        messageType: BUZZ_M2I_STATUS_MESSAGE_TYPE,
        statusHash: status.status_hash,
        challengeCode: status.challenge?.code
      }),
      content
    },
    secretKey
  );
}

export function createBuzzRoomStarterPackMessageEvent({ channelId, starterPack, secretKey = generateSecretKey(), createdAt } = {}) {
  assertRoomStarterPackSafe(starterPack);
  const status = roomStatusFromEvent(starterPack.signedStatusEvent);
  const content = canonicalJson({
    type: BUZZ_M2I_STARTER_PACK_MESSAGE_TYPE,
    version: BUZZ_M2I_ADAPTER_VERSION,
    starter_pack: starterPack
  });
  return finalizeEvent(
    {
      kind: BUZZ_STREAM_MESSAGE_KIND,
      pubkey: getPublicKey(secretKey),
      created_at: createdAt || Math.floor(Date.now() / 1000),
      tags: buzzTags({
        channelId,
        messageType: BUZZ_M2I_STARTER_PACK_MESSAGE_TYPE,
        statusHash: status.status_hash,
        challengeCode: status.challenge?.code
      }),
      content
    },
    secretKey
  );
}

export function parseBuzzM2IMessageEvent(event, { verify = true } = {}) {
  if (!event || event.kind !== BUZZ_STREAM_MESSAGE_KIND) throw new Error('Not a BUZZ stream message event.');
  if (!tagValue(event.tags, 'h')) throw new Error('BUZZ message has no h channel tag.');
  if (tagValue(event.tags, 'm2i') !== 'v1') throw new Error('BUZZ message is not an M2I adapter event.');
  if (verify && (getEventHash(event) !== event.id || !verifyEvent(event))) throw new Error('BUZZ M2I event signature is invalid.');
  const payload = JSON.parse(event.content);
  if (![BUZZ_M2I_STATUS_MESSAGE_TYPE, BUZZ_M2I_STARTER_PACK_MESSAGE_TYPE].includes(payload.type)) throw new Error('Unsupported BUZZ M2I payload type.');
  if (payload.type === BUZZ_M2I_STATUS_MESSAGE_TYPE) roomStatusFromEvent(payload.signed_status_event);
  if (payload.type === BUZZ_M2I_STARTER_PACK_MESSAGE_TYPE) assertRoomStarterPackSafe(payload.starter_pack);
  return payload;
}
