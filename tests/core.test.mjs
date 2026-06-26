import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEvent } from 'nostr-tools/pure';
import { createChallengeInviteUrl, createChallengePlan, computeChallengeProgress, createChallengeSettlement, createInviteText, decodeChallengeInvite, formatDateInput, parseParticipants, workoutMeetsChallenge } from '../src/challenge.js';
import { createClaim, createHistoryEntry, createPublicClaimProjection } from '../src/claim.js';
import { canonicalJson, sha256Hex } from '../src/crypto.js';
import { createGpsTracker, distanceMeters } from '../src/gps.js';
import { generateNsec, keyInfoFromNsec, signClaimEvent, signPublicClaimEvent } from '../src/nostr.js';
import { createSatsPaymentRequest, createUsdtPaymentRequest } from '../src/payment.js';
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

test('creates multi-day group challenge plan with participants', () => {
  const challenge = createChallengePlan({
    code: 'June Run',
    durationDays: '30',
    requiredActiveDays: '10',
    minMinutesPerActiveDay: '45',
    minDistanceKm: '3.5',
    participantsText: 'Nono\nAlex|npub1alex',
    startDate: '2024-06-18',
    createdAt: 1718700000000
  });

  assert.match(challenge.id, /^challenge-june-run-/);
  assert.equal(challenge.code, 'JUNE-RUN');
  assert.equal(challenge.durationDays, 30);
  assert.equal(challenge.requiredActiveDays, 10);
  assert.equal(challenge.minMinutesPerActiveDay, 45);
  assert.equal(challenge.minDistanceKm, 3.5);
  assert.equal(challenge.participants.length, 2);
  assert.equal(challenge.participants[1].npub, 'npub1alex');
  assert.equal(formatDateInput(challenge.startsAt), '2024-06-18');
  assert.equal(challenge.endsAt, challenge.startsAt + 30 * 24 * 60 * 60 * 1000);
});

test('parses comma and newline separated challenge participants', () => {
  const participants = parseParticipants('Nono, Alex\nMia|npub1mia');
  assert.deepEqual(participants.map((participant) => participant.displayName), ['Nono', 'Alex', 'Mia']);
  assert.equal(participants[2].npub, 'npub1mia');
});

test('creates clickable challenge invite URL that can be imported locally', () => {
  const challenge = createChallengePlan({
    code: 'FLOW TEST',
    startDate: '2026-06-24',
    durationDays: '1',
    requiredActiveDays: '1',
    minMinutesPerActiveDay: '2',
    participantsText: 'Nono\nAlex',
    paymentRequests: [createUsdtPaymentRequest({ amount: '2', network: 'ton', recipient: 'EQDteamjar', challengeCode: 'FLOW TEST' })],
    createdAt: 1782290000000
  });
  const url = createChallengeInviteUrl(challenge, 'https://lieschen123.github.io/m2i-stopwatch-pwa/');
  const parsed = new URL(url);
  const token = new URLSearchParams(parsed.hash.slice(1)).get('challenge');
  const imported = decodeChallengeInvite(token);

  assert.equal(parsed.origin, 'https://lieschen123.github.io');
  assert.equal(imported.id, challenge.id);
  assert.equal(imported.code, 'FLOW-TEST');
  assert.equal(imported.participants.length, 2);
  assert.equal(imported.paymentRequests[0].amount, 2);

  const inviteText = createInviteText(challenge, 'https://lieschen123.github.io/m2i-stopwatch-pwa/');
  assert.match(inviteText, /Open \/ join: https:\/\/lieschen123\.github\.io\/m2i-stopwatch-pwa\/#challenge=/);
  assert.match(inviteText, /Stake if missed: 2\.00 USDt on TON\./);
  assert.match(inviteText, /only due if the challenge is missed after final review/i);
  assert.doesNotMatch(inviteText, /payment request/i);
  assert.doesNotMatch(inviteText, /Manual team jar request/i);
  assert.doesNotMatch(inviteText, /without stakes/i);
});

test('challenge invite text states no stake when no stake is configured', () => {
  const challenge = createChallengePlan({
    code: 'NO STAKE',
    startDate: '2026-06-24',
    durationDays: '1',
    requiredActiveDays: '1',
    minMinutesPerActiveDay: '2',
    participantsText: '',
    createdAt: 1782290000000
  });
  const inviteText = createInviteText(challenge, 'https://lieschen123.github.io/m2i-stopwatch-pwa/');
  assert.match(inviteText, /No stake configured\./);
  assert.doesNotMatch(inviteText, /payment request/i);
});

test('challenge invite text uses singular minute grammar', () => {
  const challenge = createChallengePlan({
    code: 'ONE MINUTE',
    startDate: '2026-06-24',
    durationDays: '1',
    requiredActiveDays: '1',
    minMinutesPerActiveDay: '1',
    participantsText: '',
    createdAt: 1782290000000
  });
  const inviteText = createInviteText(challenge, 'https://lieschen123.github.io/m2i-stopwatch-pwa/');
  assert.match(inviteText, /Minimum per active day: 1 minute/);
  assert.doesNotMatch(inviteText, /1 minutes/);
});

test('computes local challenge progress by valid active day', () => {
  const challenge = createChallengePlan({
    code: '30 day run',
    startDate: '2024-06-18',
    durationDays: '30',
    requiredActiveDays: '2',
    minMinutesPerActiveDay: '45',
    createdAt: 1718700000000
  });
  const validOne = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: 1718700000000,
      stoppedAt: 1718700000000 + 46 * 60 * 1000,
      claimantNpub: 'npub1m2itest'
    }),
    event: { id: 'valid-one' }
  });
  const tooShort = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: 1718786400000,
      stoppedAt: 1718786400000 + 20 * 60 * 1000,
      claimantNpub: 'npub1m2itest'
    }),
    event: { id: 'too-short' }
  });
  const validTwo = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: 1718872800000,
      stoppedAt: 1718872800000 + 50 * 60 * 1000,
      claimantNpub: 'npub1m2itest'
    }),
    event: { id: 'valid-two' }
  });

  const progress = computeChallengeProgress(challenge, [validOne, tooShort, validTwo], 1718872800000);
  assert.equal(progress.totalWorkouts, 3);
  assert.equal(progress.validWorkouts, 2);
  assert.equal(progress.validActiveDays, 2);
  assert.equal(progress.isComplete, true);
});

test('distance goal requires both minimum minutes and distance per active day', () => {
  const challenge = createChallengePlan({
    code: 'distance run',
    startDate: '2024-06-18',
    durationDays: '2',
    requiredActiveDays: '1',
    minMinutesPerActiveDay: '45',
    minDistanceKm: '3.5',
    createdAt: 1718700000000
  });
  const enoughMinutesShortDistance = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: 1718700000000,
      stoppedAt: 1718700000000 + 46 * 60 * 1000,
      claimantNpub: 'npub1m2itest',
      gpsSummary: {
        gps_used: true,
        distance_meters: 2100,
        distance_km: 2.1,
        gps_sample_count: 2,
        gps_rejected_sample_count: 0,
        gps_accuracy_summary: '2 samples'
      }
    }),
    event: { id: 'short-distance' }
  });
  const enoughMinutesAndDistance = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: 1718786400000,
      stoppedAt: 1718786400000 + 46 * 60 * 1000,
      claimantNpub: 'npub1m2itest',
      gpsSummary: {
        gps_used: true,
        distance_meters: 3600,
        distance_km: 3.6,
        gps_sample_count: 2,
        gps_rejected_sample_count: 0,
        gps_accuracy_summary: '2 samples'
      }
    }),
    event: { id: 'enough-distance' }
  });

  assert.equal(workoutMeetsChallenge(enoughMinutesShortDistance, challenge), false);
  assert.equal(workoutMeetsChallenge(enoughMinutesAndDistance, challenge), true);

  const progress = computeChallengeProgress(challenge, [enoughMinutesShortDistance, enoughMinutesAndDistance], 1718786400000);
  assert.equal(progress.totalWorkouts, 2);
  assert.equal(progress.validWorkouts, 1);
  assert.equal(progress.validActiveDays, 1);
});

test('does not count workouts outside the challenge date window', () => {
  const challenge = createChallengePlan({
    code: 'window test',
    startDate: '2024-06-18',
    durationDays: '1',
    requiredActiveDays: '1',
    minMinutesPerActiveDay: '1',
    createdAt: 1718700000000
  });
  const beforeWindow = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: challenge.startsAt - 10 * 60 * 1000,
      stoppedAt: challenge.startsAt - 5 * 60 * 1000,
      claimantNpub: 'npub1m2itest'
    }),
    event: { id: 'before-window' }
  });
  const insideWindow = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: challenge.startsAt + 5 * 60 * 1000,
      stoppedAt: challenge.startsAt + 7 * 60 * 1000,
      claimantNpub: 'npub1m2itest'
    }),
    event: { id: 'inside-window' }
  });
  const afterWindow = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: challenge.endsAt + 5 * 60 * 1000,
      stoppedAt: challenge.endsAt + 7 * 60 * 1000,
      claimantNpub: 'npub1m2itest'
    }),
    event: { id: 'after-window' }
  });

  const progress = computeChallengeProgress(challenge, [beforeWindow, insideWindow, afterWindow], challenge.endsAt - 1);
  assert.equal(progress.totalWorkouts, 3);
  assert.equal(progress.validWorkouts, 1);
  assert.equal(progress.validActiveDays, 1);

  const closedProgress = computeChallengeProgress(challenge, [insideWindow], challenge.endsAt);
  assert.equal(closedProgress.isExpired, true);
  assert.equal(closedProgress.daysRemaining, 0);
});

test('challenge settlement keeps manual payment requests private', () => {
  const paymentRequest = createUsdtPaymentRequest({
    amount: '2',
    network: 'ton',
    recipient: 'EQDteamjaraddress',
    challengeCode: 'GROUP-RUN'
  });
  const challenge = createChallengePlan({
    code: 'GROUP-RUN',
    durationDays: '30',
    requiredActiveDays: '10',
    minMinutesPerActiveDay: '45',
    paymentRequests: [paymentRequest],
    createdAt: 1718700000000
  });
  const settlement = createChallengeSettlement({ challenge, history: [] });

  assert.equal(settlement.settlement_model, 'manual-group-settlement');
  assert.equal(settlement.paymentRequests[0].amount, 2);
  assert.equal(settlement.payment_policy.includes('only due if final review says the challenge was missed'), true);
  assert.equal(settlement.payment_policy.includes('If the challenge is complete, no payment is due'), true);
  assert.equal(settlement.payment_policy.includes('M2I never holds funds, pays automatically, or monitors settlement'), true);
});

test('challenge-created stake references are suffixed and reused by claim proofs', () => {
  const draftRequest = createUsdtPaymentRequest({
    amount: '2',
    network: 'ton',
    recipient: 'EQDteamjaraddress',
    challengeCode: 'STAKE-TEST-2'
  });
  const challenge = createChallengePlan({
    code: 'STAKE-TEST-2',
    startDate: '2026-06-26',
    durationDays: '1',
    requiredActiveDays: '1',
    minMinutesPerActiveDay: '45',
    paymentRequests: [draftRequest],
    createdAt: 1782460000000
  });
  const claim = createClaim({
    challengeId: challenge.id,
    challengeCode: challenge.code,
    startedAt: challenge.startsAt,
    stoppedAt: challenge.startsAt + 10 * 60 * 1000,
    claimantNpub: 'npub1stake'
  });
  const entry = createHistoryEntry({
    claim,
    event: { id: 'stake-event', kind: 30316 },
    paymentRequests: challenge.paymentRequests
  });
  const settlement = createChallengeSettlement({
    challenge,
    history: [entry],
    progress: computeChallengeProgress(challenge, [entry], challenge.endsAt)
  });
  const challengeRequest = settlement.paymentRequests[0];
  const claimRequest = settlement.signed_claims[0].paymentRequests[0];

  assert.match(challengeRequest.reference, /^STAKE-TEST-2:[0-9a-f]{16}$/);
  assert.notEqual(challengeRequest.reference, 'STAKE-TEST-2:');
  assert.equal(claimRequest.reference, challengeRequest.reference);
  assert.equal(claimRequest.memo, challengeRequest.memo);
  assert.equal(claimRequest.payment_uri, challengeRequest.payment_uri);
  assert.equal(claimRequest.request_text, challengeRequest.request_text);
});

test('legacy empty challenge stake references normalize in copied challenge proof', () => {
  const legacyChallengeRequest = createUsdtPaymentRequest({
    amount: '2',
    network: 'ton',
    recipient: 'EQDteamjaraddress',
    challengeCode: 'STAKE-TEST-2'
  });
  const legacyClaimRequest = createUsdtPaymentRequest({
    amount: '2',
    network: 'ton',
    recipient: 'EQDteamjaraddress',
    challengeCode: 'STAKE-TEST-2',
    claimHash: '793d7544a4aea1dcffeeddccbbaa0099'
  });
  const challenge = {
    ...createChallengePlan({
      code: 'STAKE-TEST-2',
      startDate: '2026-06-26',
      durationDays: '1',
      requiredActiveDays: '1',
      minMinutesPerActiveDay: '45',
      createdAt: 1782460000000
    }),
    paymentRequests: [legacyChallengeRequest]
  };
  const claim = createClaim({
    challengeId: challenge.id,
    challengeCode: challenge.code,
    startedAt: challenge.startsAt,
    stoppedAt: challenge.startsAt + 10 * 60 * 1000,
    claimantNpub: 'npub1stake'
  });
  const entry = createHistoryEntry({
    claim,
    event: { id: 'legacy-stake-event', kind: 30316 },
    paymentRequests: [legacyClaimRequest]
  });
  const settlement = createChallengeSettlement({
    challenge,
    history: [entry],
    progress: computeChallengeProgress(challenge, [entry], challenge.endsAt)
  });
  const challengeRequest = settlement.paymentRequests[0];
  const claimRequest = settlement.signed_claims[0].paymentRequests[0];

  assert.equal(legacyChallengeRequest.reference, 'STAKE-TEST-2:');
  assert.equal(legacyClaimRequest.reference, 'STAKE-TEST-2:793d7544a4aea1dc');
  assert.match(challengeRequest.reference, /^STAKE-TEST-2:[0-9a-f]{16}$/);
  assert.notEqual(challengeRequest.reference, 'STAKE-TEST-2:');
  assert.equal(claimRequest.reference, challengeRequest.reference);
  assert.equal(claimRequest.memo, challengeRequest.memo);
  assert.equal(claimRequest.payment_uri, challengeRequest.payment_uri);
  assert.equal(claimRequest.request_text, challengeRequest.request_text);
});

test('challenge settlement marks open challenge with pending payment review', () => {
  const challenge = createChallengePlan({
    code: 'OPEN-STATUS',
    startDate: '2024-06-18',
    durationDays: '30',
    requiredActiveDays: '2',
    minMinutesPerActiveDay: '45',
    createdAt: 1718700000000
  });
  const settlement = createChallengeSettlement({
    challenge,
    history: [],
    progress: computeChallengeProgress(challenge, [], challenge.startsAt + 2 * 24 * 60 * 60 * 1000)
  });

  assert.equal(settlement.challenge_result, 'open');
  assert.equal(settlement.payment_due, null);
  assert.equal(settlement.payment_reason, 'Open — final review after close');
});

test('challenge settlement marks closed complete challenge with no payment due', () => {
  const challenge = createChallengePlan({
    code: 'COMPLETE-STATUS',
    startDate: '2024-06-18',
    durationDays: '2',
    requiredActiveDays: '1',
    minMinutesPerActiveDay: '45',
    createdAt: 1718700000000
  });
  const validWorkout = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: challenge.startsAt,
      stoppedAt: challenge.startsAt + 46 * 60 * 1000,
      claimantNpub: 'npub1complete'
    }),
    event: { id: 'complete-event' }
  });
  const history = [validWorkout];
  const settlement = createChallengeSettlement({
    challenge,
    history,
    progress: computeChallengeProgress(challenge, history, challenge.endsAt)
  });

  assert.equal(settlement.challenge_result, 'complete');
  assert.equal(settlement.payment_due, false);
  assert.equal(settlement.payment_reason, 'Complete — no payment due');
});

test('challenge settlement marks closed incomplete challenge with stake due', () => {
  const paymentRequest = createUsdtPaymentRequest({
    amount: '2',
    network: 'ton',
    recipient: 'EQDteamjaraddress',
    challengeCode: 'MISSED-STATUS'
  });
  const challenge = createChallengePlan({
    code: 'MISSED-STATUS',
    startDate: '2024-06-18',
    durationDays: '2',
    requiredActiveDays: '2',
    minMinutesPerActiveDay: '45',
    paymentRequests: [paymentRequest],
    createdAt: 1718700000000
  });
  const shortWorkout = createHistoryEntry({
    claim: createClaim({
      challengeId: challenge.id,
      challengeCode: challenge.code,
      startedAt: challenge.startsAt + 60 * 60 * 1000,
      stoppedAt: challenge.startsAt + 65 * 60 * 1000,
      claimantNpub: 'npub1missed'
    }),
    event: { id: 'missed-event' }
  });
  const history = [shortWorkout];
  const settlement = createChallengeSettlement({
    challenge,
    history,
    progress: computeChallengeProgress(challenge, history, challenge.endsAt)
  });

  assert.equal(settlement.challenge_result, 'missed');
  assert.equal(settlement.payment_due, true);
  assert.equal(settlement.payment_reason, 'Missed — stake due');
  assert.equal(settlement.paymentRequests[0].amount, 2);
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

test('GPS attempt with no accepted samples records diagnostics without movement verification', () => {
  const claim = createClaim({
    challengeCode: 'GPS-NO-SAMPLES',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: 'npub1m2itest',
    gpsSummary: {
      distance_meters: 0,
      distance_km: 0,
      gps_used: true,
      gps_points_discarded: true,
      gps_accuracy_summary: 'no accepted samples, rejected 2',
      gps_sample_count: 0,
      gps_rejected_sample_count: 2,
      gps_secure_context: true,
      gps_geolocation_available: true,
      gps_no_accepted_samples: true,
      verification_method: 'pwa-gps-aggregate-v1',
      gps_last_error: 'GPS sample rejected: accuracy 120m.'
    }
  });

  assert.equal(claim.gps_used, true);
  assert.equal(claim.gps_no_accepted_samples, true);
  assert.equal(claim.gps_secure_context, true);
  assert.equal(claim.gps_geolocation_available, true);
  assert.equal(claim.gps_sample_count, 0);
  assert.equal('distance_meters' in claim, false);
  assert.equal('distance_km' in claim, false);
  assert.equal('local_verification' in claim, false);
  assert.equal('verification_method' in claim, false);
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
  claim.paymentRequests = [
    createUsdtPaymentRequest({
      amount: '5',
      network: 'ton',
      recipient: 'EQDteamjaraddress',
      challengeCode: claim.challenge_code,
      claimHash: claim.claim_hash
    }),
    createSatsPaymentRequest({
      amountSats: '2100',
      recipient: 'lnbc2100n1ptestinvoice',
      paymentUri: 'lightning:lnbc2100n1ptestinvoice',
      instructions: 'Pay from your own Lightning wallet.',
      challengeCode: claim.challenge_code,
      claimHash: claim.claim_hash
    })
  ];
  claim.privateSettlement = {
    settlement_model: 'manual-private-settlement',
    paymentRequests: claim.paymentRequests
  };
  const publicClaim = createPublicClaimProjection(claim);
  assert.equal(publicClaim.distance_meters, 2100);
  assert.equal(publicClaim.distance_km, 2.1);
  assert.equal(publicClaim.duration_seconds, 900);
  assert.equal(publicClaim.gps_used, true);
  assert.equal(publicClaim.gps_summary, 'movement aggregate included');
  assert.equal(publicClaim.local_verification, 'movement-aggregate-v1');
  assert.equal(publicClaim.verification_method, 'pwa-gps-aggregate-v1');
  assert.equal('claimant_npub' in publicClaim, false);
  assert.equal('counterpart_npub' in publicClaim, false);
  assert.equal('note' in publicClaim, false);
  assert.equal('started_at' in publicClaim, false);
  assert.equal('stopped_at' in publicClaim, false);
  assert.equal('created_at' in publicClaim, false);
  assert.equal('duration_ms' in publicClaim, false);
  assert.equal('gps_accuracy_summary' in publicClaim, false);
  assert.equal('gps_sample_count' in publicClaim, false);
  assert.equal('gps_rejected_sample_count' in publicClaim, false);
  assert.equal('gps_last_error' in publicClaim, false);
  assert.equal('gps_points_discarded' in publicClaim, false);
  assert.equal('gps_no_accepted_samples' in publicClaim, false);
  assert.equal('recipient' in publicClaim, false);
  assert.equal('amount' in publicClaim, false);
  assert.equal('asset' in publicClaim, false);
  assert.equal('paymentRequests' in publicClaim, false);
  assert.equal('privateSettlement' in publicClaim, false);
  assert.equal('payment_uri' in publicClaim, false);
  assert.equal('amount_sats' in publicClaim, false);

  assert.equal(publicClaim.canonical_json.includes('1718708580000'), false);
  assert.equal(publicClaim.canonical_json.includes('1718709480000'), false);
  assert.equal(publicClaim.canonical_json.includes('accepted 8'), false);
  assert.equal(publicClaim.canonical_json.includes('rejected 1'), false);
  assert.equal(publicClaim.canonical_json.includes('EQDteamjaraddress'), false);
  assert.equal(publicClaim.canonical_json.includes('USDt'), false);
  assert.equal(publicClaim.canonical_json.includes('lnbc2100n1ptestinvoice'), false);
  assert.equal(publicClaim.canonical_json.includes('lightning:'), false);
});

test('public claim projection omits GPS distance when no samples were accepted', () => {
  const publicClaim = createPublicClaimProjection(createClaim({
    challengeCode: 'PUBLIC-NO-GPS-SAMPLES',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: 'npub1m2itest',
    gpsSummary: {
      distance_meters: 0,
      distance_km: 0,
      gps_used: true,
      gps_points_discarded: true,
      gps_accuracy_summary: 'no accepted samples, rejected 0',
      gps_sample_count: 0,
      gps_rejected_sample_count: 0,
      gps_secure_context: true,
      gps_geolocation_available: true,
      gps_no_accepted_samples: true,
      verification_method: 'pwa-gps-aggregate-v1'
    }
  }));

  assert.equal('distance_meters' in publicClaim, false);
  assert.equal('distance_km' in publicClaim, false);
  assert.equal('verification_method' in publicClaim, false);
  assert.equal('gps_summary' in publicClaim, false);
  assert.equal(publicClaim.gps_used, true);
  assert.equal('gps_last_error' in publicClaim, false);
  assert.equal('gps_sample_count' in publicClaim, false);
  assert.equal('gps_rejected_sample_count' in publicClaim, false);
  assert.equal('gps_accuracy_summary' in publicClaim, false);
  assert.equal(publicClaim.canonical_json.includes('no accepted samples'), false);
  assert.equal(publicClaim.canonical_json.includes('rejected'), false);
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

test('history entry preserves local USDt payment request', () => {
  const claim = createClaim({
    challengeCode: 'USDT-HISTORY',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: 'npub1m2itest'
  });
  const paymentRequest = createUsdtPaymentRequest({
    amount: '5',
    network: 'ton',
    recipient: 'EQDteamjaraddress',
    challengeCode: claim.challenge_code,
    claimHash: claim.claim_hash
  });
  const entry = createHistoryEntry({
    claim,
    event: { id: 'event-id', kind: 30316 },
    paymentRequest
  });

  assert.equal(entry.id, 'event-id');
  assert.equal(entry.paymentRequest, paymentRequest);
  assert.equal(entry.privateSettlement.settlement_model, 'manual-private-settlement');
  assert.equal(entry.privateSettlement.signed_event.id, 'event-id');
  assert.equal(entry.privateSettlement.paymentRequests[0], paymentRequest);
  assert.match(entry.paymentRequest.request_text, /Reference: USDT-HISTORY:/);
});

test('challenge proof JSON retains visible 2 USDt manual request fields', () => {
  const claim = createClaim({
    challengeCode: 'USDT-2-VISIBLE',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: 'npub1m2itest'
  });
  const paymentRequest = createUsdtPaymentRequest({
    amount: '2',
    network: 'ton',
    recipient: 'EQDvisibleteamjaraddress',
    challengeCode: claim.challenge_code,
    claimHash: claim.claim_hash
  });
  const entry = createHistoryEntry({
    claim,
    event: { id: 'event-id-2-usdt', kind: 30316, content: claim.canonical_json },
    paymentRequests: [paymentRequest]
  });
  const settlementJson = JSON.stringify(entry.privateSettlement);

  assert.equal(entry.paymentRequests[0].amount, 2);
  assert.equal(entry.paymentRequests[0].asset, 'USDt');
  assert.equal(entry.paymentRequests[0].network, 'ton');
  assert.equal(entry.paymentRequests[0].recipient, 'EQDvisibleteamjaraddress');
  assert.match(entry.paymentRequests[0].payment_uri, /^ton:/);
  assert.match(entry.paymentRequests[0].request_text, /Stake if missed: 2\.00 USDt on TON/);
  assert.match(entry.paymentRequests[0].request_text, /Only due if final review says the challenge was missed/);
  assert.match(entry.paymentRequests[0].request_text, /M2I never holds funds, pays automatically, or monitors settlement/);
  assert.equal(entry.privateSettlement.paymentRequests[0].amount, 2);
  assert.equal(settlementJson.includes('"amount":2'), true);
  assert.equal(settlementJson.includes('"asset":"USDt"'), true);
  assert.equal(settlementJson.includes('EQDvisibleteamjaraddress'), true);
  assert.equal(settlementJson.includes('"signed_event"'), true);
});

test('creates manual sats payment request without wallet integration fields in claim', () => {
  const claim = createClaim({
    challengeCode: 'SATS-STAKE',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: 'npub1m2itest'
  });
  const request = createSatsPaymentRequest({
    amountSats: '2100',
    recipient: 'lnurl1teamjar',
    paymentUri: 'lightning:lnurl1teamjar',
    challengeCode: claim.challenge_code,
    claimHash: claim.claim_hash
  });

  assert.equal(request.asset, 'sats');
  assert.equal(request.amount_sats, 2100);
  assert.equal(request.custody, 'user-paid');
  assert.equal(request.settlement_model, 'payment-request-only');
  assert.match(request.payment_uri, /^lightning:/);
  assert.match(request.request_text, /team jar \/ recipient/);
  assert.match(request.request_text, /Team jar \/ recipient address or invoice/);
  assert.match(request.request_text, /Only due if final review says the challenge was missed/);
  assert.match(request.request_text, /M2I never holds funds, pays automatically, or monitors settlement/);
  assert.equal('recipient' in claim, false);
  assert.equal('amount_sats' in claim, false);
  assert.equal('payment_uri' in claim, false);
});

test('history entry preserves USDt and sats payment requests together', () => {
  const claim = createClaim({
    challengeCode: 'DUAL-PAYMENT-HISTORY',
    startedAt: 1718708580000,
    stoppedAt: 1718709480000,
    claimantNpub: 'npub1m2itest'
  });
  const usdt = createUsdtPaymentRequest({
    amount: '5',
    network: 'ton',
    recipient: 'EQDteamjaraddress',
    challengeCode: claim.challenge_code,
    claimHash: claim.claim_hash
  });
  const sats = createSatsPaymentRequest({
    amountSats: '2100',
    recipient: 'bc1qteamjaraddress',
    paymentUri: 'bitcoin:bc1qteamjaraddress',
    challengeCode: claim.challenge_code,
    claimHash: claim.claim_hash
  });
  const entry = createHistoryEntry({
    claim,
    event: { id: 'event-id', kind: 30316 },
    paymentRequests: [usdt, sats]
  });

  assert.equal(entry.paymentRequests.length, 2);
  assert.equal(entry.paymentRequests[0].asset, 'USDt');
  assert.equal(entry.paymentRequests[1].asset, 'sats');
  assert.equal(entry.paymentRequest, usdt);
  assert.equal(entry.privateSettlement.paymentRequests.length, 2);
  assert.equal(entry.privateSettlement.paymentRequests[0].amount, 5);
  assert.equal(entry.privateSettlement.paymentRequests[1].amount_sats, 2100);
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

test('GPS tracker reports startup and no-sample diagnostics', () => {
  const geolocation = {
    watchPosition(success, error) {
      error({ message: 'User denied Geolocation' });
      return 7;
    },
    clearWatch(id) {
      assert.equal(id, 7);
    }
  };
  const tracker = createGpsTracker({ geolocation });
  assert.equal(tracker.start(), true);
  assert.deepEqual(tracker.status(), {
    secure_context: false,
    geolocation_available: true,
    watch_started: true,
    waiting_for_first_sample: false,
    distance_meters: 0,
    distance_km: 0,
    gps_sample_count: 0,
    gps_rejected_sample_count: 0,
    gps_last_error: 'User denied Geolocation'
  });
  const summary = tracker.summary();
  assert.equal(summary.gps_no_accepted_samples, true);
  assert.equal(summary.gps_accuracy_summary, 'no accepted samples, rejected 0');
  tracker.stop();
});

test('GPS tracker rejects poor samples before reporting distance', () => {
  const callbacks = {};
  const geolocation = {
    watchPosition(success, error) {
      callbacks.success = success;
      callbacks.error = error;
      return 11;
    },
    clearWatch() {}
  };
  const tracker = createGpsTracker({ geolocation });
  assert.equal(tracker.start(), true);
  callbacks.success({
    coords: { latitude: 52.52, longitude: 13.405, accuracy: 120 },
    timestamp: 1718708580000
  });

  const status = tracker.status();
  assert.equal(status.gps_sample_count, 0);
  assert.equal(status.gps_rejected_sample_count, 1);
  assert.equal(status.distance_meters, 0);
  assert.match(status.gps_last_error, /accuracy 120m/);
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
