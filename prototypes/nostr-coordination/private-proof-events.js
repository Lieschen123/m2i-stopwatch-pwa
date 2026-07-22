import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { canonicalJson, bytesToHex, hexToBytes, sha256Hex } from '../../src/crypto.js';
import { parseEnvelope } from '../../src/envelope.js';
import { CLIENT_NAME } from '../../src/constants.js';
import { reduceEnvelopes } from '../holepunch-sync/reducer.js';

export const PRIVATE_PROOF_EVENT_VERSION = 1;
export const PRIVATE_PROOF_CONTENT_TYPE = 'm2i.private_proof_event.v1';
export const PRIVATE_PROOF_TAG = 'm2i_private_proof';
export const PRIVATE_PROOF_ALG = 'xchacha20poly1305-v1';
export const DEFAULT_PRIVATE_ROOM_KIND = 9;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function assertRoomKey(roomKey) {
  if (!(roomKey instanceof Uint8Array) || roomKey.length !== 32) throw new Error('Room key must be 32 bytes.');
}

function tagValue(tags = [], name) {
  return tags.find((tag) => tag[0] === name)?.[1] || '';
}

function normalizeMetadata({ roomId, channelId, challengeCode }) {
  const cleanRoomId = String(roomId || channelId || '').trim();
  if (!cleanRoomId) throw new Error('Private proof room id or channel id is required.');
  if (channelId && !UUID_RE.test(channelId)) throw new Error('BUZZ channel id must be a UUID when provided.');
  return {
    type: PRIVATE_PROOF_CONTENT_TYPE,
    version: PRIVATE_PROOF_EVENT_VERSION,
    room_id: cleanRoomId,
    channel_id: channelId || null,
    challenge_code: String(challengeCode || '').trim() || null
  };
}

function privateProofTags(metadata) {
  const tags = [
    [PRIVATE_PROOF_TAG, 'v1'],
    ['m2i', 'v1'],
    ['m2i_message_type', PRIVATE_PROOF_CONTENT_TYPE],
    ['privacy', 'room-encrypted'],
    ['client', CLIENT_NAME]
  ];
  if (metadata.channel_id) tags.unshift(['h', metadata.channel_id]);
  if (metadata.challenge_code) tags.push(['challenge_code', metadata.challenge_code]);
  return tags;
}

export function createRoomKey(seed) {
  if (!seed) return randomBytes(32);
  return hexToBytes(sha256Hex(String(seed)));
}

export function createPrivateProofEvent({
  envelope,
  roomKey,
  roomId,
  channelId,
  challengeCode,
  senderAlias,
  secretKey = generateSecretKey(),
  createdAt,
  nonce = randomBytes(24),
  kind = DEFAULT_PRIVATE_ROOM_KIND
} = {}) {
  assertRoomKey(roomKey);
  const parsedEnvelope = parseEnvelope(envelope);
  if (!(nonce instanceof Uint8Array) || nonce.length !== 24) throw new Error('Private proof nonce must be 24 bytes.');
  const metadata = normalizeMetadata({ roomId, channelId, challengeCode });
  const aad = textBytes(canonicalJson(metadata));
  const plaintext = textBytes(canonicalJson({
    envelope: parsedEnvelope,
    sender_alias: String(senderAlias || '').trim() || null,
    envelope_type: parsedEnvelope.type
  }));
  const ciphertext = xchacha20poly1305(roomKey, nonce, aad).encrypt(plaintext);
  const content = {
    type: PRIVATE_PROOF_CONTENT_TYPE,
    version: PRIVATE_PROOF_EVENT_VERSION,
    alg: PRIVATE_PROOF_ALG,
    metadata,
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
    ciphertext_hash: sha256Hex(bytesToHex(ciphertext))
  };
  return finalizeEvent(
    {
      kind,
      pubkey: getPublicKey(secretKey),
      created_at: createdAt || Math.floor(Date.now() / 1000),
      tags: privateProofTags(metadata),
      content: canonicalJson(content)
    },
    secretKey
  );
}

export function isPrivateProofEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (tagValue(event.tags, PRIVATE_PROOF_TAG) !== 'v1') return false;
  if (tagValue(event.tags, 'm2i_message_type') !== PRIVATE_PROOF_CONTENT_TYPE) return false;
  return true;
}

export function decryptPrivateProofEvent(event, { roomKey, verify = true } = {}) {
  assertRoomKey(roomKey);
  if (!isPrivateProofEvent(event)) throw new Error('Not an M2I private proof event.');
  if (verify && (getEventHash(event) !== event.id || !verifyEvent(event))) throw new Error('Private proof event signature is invalid.');
  const content = JSON.parse(event.content);
  if (content.type !== PRIVATE_PROOF_CONTENT_TYPE) throw new Error('Private proof content type is invalid.');
  if (content.version !== PRIVATE_PROOF_EVENT_VERSION) throw new Error('Private proof version is unsupported.');
  if (content.alg !== PRIVATE_PROOF_ALG) throw new Error('Private proof encryption algorithm is unsupported.');
  if (sha256Hex(content.ciphertext) !== content.ciphertext_hash) throw new Error('Private proof ciphertext hash does not match.');
  const metadata = content.metadata;
  const aad = textBytes(canonicalJson(metadata));
  let plaintext;
  try {
    plaintext = xchacha20poly1305(roomKey, hexToBytes(content.nonce), aad).decrypt(hexToBytes(content.ciphertext));
  } catch {
    throw new Error('Private proof could not be decrypted with this room key.');
  }
  const decoded = JSON.parse(new TextDecoder().decode(plaintext));
  const envelope = parseEnvelope(decoded.envelope);
  if (decoded.envelope_type && decoded.envelope_type !== envelope.type) throw new Error('Private proof payload envelope type does not match decrypted envelope.');
  return { metadata, envelope, senderAlias: decoded.sender_alias || null };
}

export function reducePrivateProofEvents(events, { roomKey, verify = true } = {}) {
  const envelopes = events.map((event) => decryptPrivateProofEvent(event, { roomKey, verify }).envelope);
  return reduceEnvelopes(envelopes);
}
