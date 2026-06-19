import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEvent } from 'nostr-tools/pure';
import { createClaim } from '../src/claim.js';
import { canonicalJson, sha256Hex } from '../src/crypto.js';
import { generateNsec, keyInfoFromNsec, signClaimEvent } from '../src/nostr.js';
import { createStorage } from '../src/storage.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

test('canonical JSON sorts object keys recursively', () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":2}');
});

test('claim hash is stable for equivalent input', () => {
  const input = {
    challengeCode: 'RUN-2026-06-20-JOGGING',
    startedAt: 1718708580000,
    stoppedAt: 1718710452000,
    claimantNpub: 'npub1m2itest',
    note: '30min jog in the park'
  };
  const one = createClaim(input);
  const two = createClaim(input);
  assert.equal(one.canonical_json, two.canonical_json);
  assert.equal(one.claim_hash, two.claim_hash);
  assert.equal(one.claim_hash, sha256Hex(one.canonical_json));
});

test('generates nsec, derives npub, signs and verifies claim event', () => {
  const nsec = generateNsec();
  const key = keyInfoFromNsec(nsec);
  assert.match(key.npub, /^npub1/);
  assert.match(key.nsec, /^nsec1/);
  const claim = createClaim({
    challengeCode: 'TEST-ROUNDTRIP',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: key.npub,
    note: 'test'
  });
  const event = signClaimEvent({
    claim,
    challengeCode: claim.challenge_code,
    durationSeconds: claim.duration_seconds,
    targetSeconds: 900,
    nsec
  });
  assert.equal(event.kind, 30316);
  assert.equal(event.pubkey, key.pubkey);
  assert.equal(event.verified, true);
  assert.equal(verifyEvent(event), true);
  assert.equal(event.content, claim.canonical_json);
});

test('localStorage adapter persists key and history', () => {
  const store = createStorage(memoryStorage());
  const nsec = generateNsec();
  store.setSecret(nsec);
  assert.equal(store.getSecret(), nsec);
  store.addHistory({ id: '1', challengeCode: 'A' });
  store.addHistory({ id: '2', challengeCode: 'B' });
  assert.equal(store.getHistory().length, 2);
  assert.equal(store.getHistory()[0].challengeCode, 'B');
  store.clearHistory();
  assert.deepEqual(store.getHistory(), []);
});

test('NIP-17 helper module can wrap a DM event', async () => {
  const nip17 = await import('nostr-tools/nip17');
  const sender = keyInfoFromNsec(generateNsec());
  const recipient = keyInfoFromNsec(generateNsec());
  const wrapped = nip17.wrapEvent(sender.secretKey, { publicKey: recipient.pubkey }, 'hello', 'test');
  assert.equal(wrapped.kind, 1059);
  assert.equal(verifyEvent(wrapped), true);
});
