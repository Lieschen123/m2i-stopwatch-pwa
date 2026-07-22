import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { CLAIM_KIND, CLIENT_NAME } from '../../src/constants.js';
import { canonicalJson } from '../../src/crypto.js';
import { ENVELOPE_TYPES, parseEnvelope } from '../../src/envelope.js';

export const M2I_NOSTR_EVENT_VERSION = 1;
export const M2I_NOSTR_TAG = 'm2i';
export const DEFAULT_PRIVACY_MODE = 'private';

function tagValue(tags = [], name) {
  return tags.find((tag) => tag[0] === name)?.[1] || '';
}

function challengeFromEnvelope(envelope) {
  return envelope.payload.challenge || envelope.payload.historyEntry?.claim || envelope.payload.settlement?.challenge || {};
}

function challengeIdFromEnvelope(envelope) {
  return envelope.payload.challenge?.id
    || envelope.payload.historyEntry?.challengeId
    || envelope.payload.historyEntry?.claim?.challenge_id
    || envelope.payload.settlement?.challengeId
    || '';
}

function challengeCodeFromEnvelope(envelope) {
  return envelope.payload.challenge?.code
    || envelope.payload.historyEntry?.claim?.challenge_code
    || envelope.payload.settlement?.challengeCode
    || '';
}

function activityFromEnvelope(envelope) {
  const challenge = challengeFromEnvelope(envelope);
  return challenge.activityType || envelope.payload.historyEntry?.claim?.activity_type || '';
}

export function nostrTagsForEnvelope(envelope, { privacy = DEFAULT_PRIVACY_MODE } = {}) {
  const parsed = parseEnvelope(envelope);
  const challengeId = challengeIdFromEnvelope(parsed);
  const challengeCode = challengeCodeFromEnvelope(parsed);
  const tags = [
    ['d', `m2i:${challengeId || challengeCode || 'unknown'}:${parsed.envelope_hash}`],
    [M2I_NOSTR_TAG, 'envelope', `v${M2I_NOSTR_EVENT_VERSION}`],
    ['client', CLIENT_NAME],
    ['m2i_type', parsed.type],
    ['envelope_hash', parsed.envelope_hash],
    ['privacy', privacy]
  ];
  if (challengeId) tags.push(['challenge', challengeId]);
  if (challengeCode) tags.push(['challenge_code', challengeCode]);
  const activity = activityFromEnvelope(parsed);
  if (activity) tags.push(['activity', activity]);
  return tags;
}

export function createNostrEnvelopeEvent({ envelope, secretKey = generateSecretKey(), privacy = DEFAULT_PRIVACY_MODE, createdAt } = {}) {
  const parsed = parseEnvelope(envelope);
  return finalizeEvent(
    {
      kind: CLAIM_KIND,
      pubkey: getPublicKey(secretKey),
      created_at: createdAt || Math.floor(parsed.created_at / 1000),
      tags: nostrTagsForEnvelope(parsed, { privacy }),
      content: canonicalJson(parsed)
    },
    secretKey
  );
}

export function isM2IEnvelopeEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.kind !== CLAIM_KIND) return false;
  if (tagValue(event.tags, M2I_NOSTR_TAG) !== 'envelope') return false;
  return Boolean(tagValue(event.tags, 'envelope_hash'));
}

export function envelopeFromNostrEvent(event, { verify = true } = {}) {
  if (!isM2IEnvelopeEvent(event)) throw new Error('Nostr event is not an M2I envelope event.');
  if (verify && (getEventHash(event) !== event.id || !verifyEvent(event))) throw new Error('Nostr event signature is invalid.');
  const envelope = parseEnvelope(event.content);
  const taggedHash = tagValue(event.tags, 'envelope_hash');
  if (taggedHash !== envelope.envelope_hash) throw new Error('Nostr envelope_hash tag does not match content.');
  const taggedType = tagValue(event.tags, 'm2i_type');
  if (!Object.values(ENVELOPE_TYPES).includes(taggedType) || taggedType !== envelope.type) {
    throw new Error('Nostr m2i_type tag does not match content.');
  }
  return envelope;
}

export function envelopesFromNostrEvents(events = [], options = {}) {
  return events.map((event) => envelopeFromNostrEvent(event, options));
}
