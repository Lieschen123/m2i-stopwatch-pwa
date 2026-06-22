import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEvent } from 'nostr-tools/pure';
import { createClaim, createPublicClaimProjection } from '../src/claim.js';
import { canonicalJson, sha256Hex } from '../src/crypto.js';
import { distanceMeters } from '../src/gps.js';
import { generateNsec, keyInfoFromNsec, signClaimEvent, signPublicClaimEvent } from '../src/nostr.js';
import { createUsdtPaymentRequest } from '../src/payment.js';
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

test('claim can include GPS aggregate without route data', () => {
  const claim = createClaim({
    challengeCode: 'GPS-AGGREGATE',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: 'npub1m2itest',
    gpsSummary: {
      distance_meters: 2100,
      distance_km: 2.1,
      gps_used: true,
      gps_points_discarded: true,
      gps_accuracy_summary: 'avg 12m, accepted 8, rejected 1',
      gps_sample_count: 8,
      gps_rejected_sample_count: 1,
      verification_method: 'pwa-gps-aggregate-v1'
    }
  });
  assert.equal(claim.distance_meters, 2100);
  assert.equal(claim.gps_points_discarded, true);
  assert.equal(claim.local_verification, 'movement-aggregate-v1');
  assert.equal(claim.verification_method, 'pwa-gps-aggregate-v1');
  assert.equal('route' in claim, false);
  assert.equal('coordinates' in claim, false);
  assert.equal('latitude' in claim, false);
  assert.equal('longitude' in claim, false);
});

test('public claim projection redacts private fields', () => {
  const claim = createClaim({
    challengeCode: 'PUBLIC-REDACT',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: 'npub1m2itest',
    counterpartNpub: 'npub1counterparty',
    note: 'private note',
    gpsSummary: {
      distance_meters: 2100,
      distance_km: 2.1,
      gps_used: true,
      gps_points_discarded: true,
      gps_accuracy_summary: 'avg 12m, accepted 8, rejected 1',
      gps_sample_count: 8,
      gps_rejected_sample_count: 1,
      verification_method: 'pwa-gps-aggregate-v1'
    }
  });
  const publicClaim = createPublicClaimProjection(claim);
  assert.equal(publicClaim.distance_meters, 2100);
  assert.equal(publicClaim.duration_seconds, 900);
  assert.equal('claimant_npub' in publicClaim, false);
  assert.equal('counterpart_npub' in publicClaim, false);
  assert.equal('note' in publicClaim, false);
  assert.equal('gps_accuracy_summary' in publicClaim, false);
  assert.equal('gps_sample_count' in publicClaim, false);
  assert.equal('recipient' in publicClaim, false);
  assert.equal('amount' in publicClaim, false);
});

test('creates user-paid USDt payment request without custody fields in claim', () => {
  const claim = createClaim({
    challengeCode: 'USDT-STAKE',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: 'npub1m2itest'
  });
  const request = createUsdtPaymentRequest({
    amount: '5',
    network: 'ton',
    recipient: 'EQDteamjaraddress',
    challengeCode: claim.challenge_code,
    claimHash: claim.claim_hash
  });
  assert.equal(request.amount, 5);
  assert.equal(request.asset, 'USDt');
  assert.equal(request.network, 'ton');
  assert.equal(request.custody, 'user-paid');
  assert.match(request.payment_uri, /^ton:/);
  assert.equal('recipient' in claim, false);
  assert.equal('stake_amount' in claim, false);
});

test('signs redacted public claim event', () => {
  const nsec = generateNsec();
  const publicClaim = createPublicClaimProjection(createClaim({
    challengeCode: 'PUBLIC-SIGN',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: keyInfoFromNsec(nsec).npub
  }));
  const event = signPublicClaimEvent({ publicClaim, challengeCode: 'PUBLIC-SIGN', nsec });
  assert.equal(event.kind, 30316);
  assert.equal(event.verified, true);
  assert.equal(verifyEvent(event), true);
  assert.equal(event.tags.some((tag) => tag[0] === 'privacy' && tag[1] === 'redacted-public'), true);
});

test('distanceMeters gives approximate GPS segment distance', () => {
  const meters = distanceMeters(
    { latitude: 52.52, longitude: 13.405 },
    { latitude: 52.5209, longitude: 13.405 }
  );
  assert.ok(meters > 95);
  assert.ok(meters < 105);
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
