import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { SimplePool } from 'nostr-tools/pool';
import { CLAIM_KIND, CLIENT_NAME } from './constants.js';
import { bytesToHex, hexToBytes } from './crypto.js';

export function generateNsec() {
  return nip19.nsecEncode(generateSecretKey());
}

export function parseNsec(nsec) {
  const decoded = nip19.decode(String(nsec).trim());
  if (decoded.type !== 'nsec') throw new Error('Expected an nsec private key.');
  return decoded.data;
}

export function parseNpub(npub) {
  const decoded = nip19.decode(String(npub).trim());
  if (decoded.type !== 'npub') throw new Error('Expected an npub public key.');
  return decoded.data;
}

export function keyInfoFromNsec(nsec) {
  const secretKey = parseNsec(nsec);
  const pubkey = getPublicKey(secretKey);
  return {
    nsec: nip19.nsecEncode(secretKey),
    secretKey,
    pubkey,
    npub: nip19.npubEncode(pubkey)
  };
}

export function pubkeyToNpub(pubkey) {
  return nip19.npubEncode(pubkey);
}

export function signClaimEvent({ claim, challengeCode, durationSeconds, targetSeconds, counterpartNpub, nsec }) {
  const { secretKey, pubkey } = keyInfoFromNsec(nsec);
  const tags = [
    ['d', challengeCode],
    ['duration', String(durationSeconds)],
    ['client', CLIENT_NAME],
    ['t', 'm2i']
  ];
  if (Number.isFinite(targetSeconds) && targetSeconds > 0) tags.push(['target', String(targetSeconds)]);
  if (counterpartNpub) tags.push(['counterpart', parseNpub(counterpartNpub)]);

  const event = finalizeEvent(
    {
      kind: CLAIM_KIND,
      pubkey,
      created_at: Math.floor(claim.stopped_at / 1000),
      tags,
      content: claim.canonical_json
    },
    secretKey
  );

  return {
    ...event,
    verified: verifyEvent(event)
  };
}

export function signPublicClaimEvent({ publicClaim, challengeCode, nsec }) {
  const { secretKey, pubkey } = keyInfoFromNsec(nsec);
  const tags = [
    ['d', `${challengeCode}:public:${publicClaim.claim_hash.slice(0, 12)}`],
    ['duration', String(publicClaim.duration_seconds)],
    ['client', CLIENT_NAME],
    ['privacy', 'redacted-public'],
    ['t', 'm2i']
  ];
  if (publicClaim.distance_meters !== undefined) tags.push(['distance_m', String(publicClaim.distance_meters)]);

  const event = finalizeEvent(
    {
      kind: CLAIM_KIND,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: publicClaim.canonical_json
    },
    secretKey
  );

  return {
    ...event,
    verified: verifyEvent(event)
  };
}

export async function publishEvent(relays, event, timeoutMs = 8000) {
  const pool = new SimplePool();
  const relayList = relays.filter((relay) => relay.startsWith('wss://'));
  const settled = await Promise.allSettled(
    relayList.map(async (relay) => {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timed out')), timeoutMs);
      });
      await Promise.race([pool.publish([relay], event), timeout]);
      return relay;
    })
  );
  pool.close(relayList);
  return settled.map((result, index) => ({
    relay: relayList[index],
    ok: result.status === 'fulfilled',
    error: result.status === 'rejected' ? result.reason.message : ''
  }));
}

export async function createNip17DirectMessage({ relays, senderNsec, recipientNpub, plaintext }) {
  const module = await import('nostr-tools/nip17');
  const { secretKey } = keyInfoFromNsec(senderNsec);
  const recipientPubkey = parseNpub(recipientNpub);
  if (typeof module.wrapEvent !== 'function') {
    throw new Error('Installed nostr-tools does not expose the expected NIP-17 wrapEvent helper.');
  }
  const wrapped = module.wrapEvent(secretKey, { publicKey: recipientPubkey }, plaintext, 'Move2Improve claim');
  return publishEvent(relays, wrapped);
}

export function hexSecretFromNsec(nsec) {
  return bytesToHex(keyInfoFromNsec(nsec).secretKey);
}

export function nsecFromHex(hex) {
  return nip19.nsecEncode(hexToBytes(hex));
}
