import { ACTIVITY_BURPEES, BURPEE_DEFAULT_DURATION_SECONDS, createChallengePlan } from '../../src/challenge.js';
import { createChallengeEnvelope, createClaimEnvelope, createJoinEnvelope } from '../../src/envelope.js';

const CREATED_AT = Date.UTC(2026, 6, 22, 6, 30, 0);

export function createSampleChallenge() {
  return createChallengePlan({
    code: 'RUNNER2-DAILY-BURPEES',
    startDate: '2026-07-22',
    durationDays: 14,
    requiredActiveDays: 14,
    minMinutesPerActiveDay: 1,
    participantsText: 'Nono\nRunner 2',
    activityType: ACTIVITY_BURPEES,
    durationSeconds: BURPEE_DEFAULT_DURATION_SECONDS,
    minReps: 0,
    createdAt: CREATED_AT
  });
}

export function createSampleHistoryEntry({ challenge, participant, reps, stoppedAt }) {
  const durationSeconds = challenge.durationSeconds || BURPEE_DEFAULT_DURATION_SECONDS;
  return {
    id: `sample-${challenge.id}-${participant}-${stoppedAt}`,
    challengeId: challenge.id,
    durationHuman: `${durationSeconds}s`,
    durationSeconds,
    stoppedAt,
    claim: {
      challenge_id: challenge.id,
      challenge_code: challenge.code,
      activity_type: ACTIVITY_BURPEES,
      proof_type: 'self_attested',
      scoring_model: 'reps_for_time',
      target_seconds: durationSeconds,
      duration_seconds: durationSeconds,
      reps,
      valid: true,
      participant: { displayName: participant }
    },
    event: {
      kind: 30316,
      pubkey: `sample-pubkey-${participant.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      created_at: Math.floor(stoppedAt / 1000),
      tags: [['d', `${challenge.id}-${participant}`]],
      content: `sample signed self-attestation for ${participant}: ${reps} burpees`,
      sig: 'sample-signature-for-transport-prototype-only'
    }
  };
}

export function peerAEnvelopes() {
  const challenge = createSampleChallenge();
  return [
    createChallengeEnvelope(challenge),
    createJoinEnvelope({ challenge, participant: { displayName: 'Nono' }, createdAt: CREATED_AT + 1000 }),
    createClaimEnvelope({
      challenge,
      historyEntry: createSampleHistoryEntry({
        challenge,
        participant: 'Nono',
        reps: 42,
        stoppedAt: CREATED_AT + 150_000
      }),
      createdAt: CREATED_AT + 150_000
    })
  ];
}

export function peerBEnvelopes() {
  const challenge = createSampleChallenge();
  return [
    createJoinEnvelope({ challenge, participant: { displayName: 'Runner 2' }, createdAt: CREATED_AT + 2000 }),
    createClaimEnvelope({
      challenge,
      historyEntry: createSampleHistoryEntry({
        challenge,
        participant: 'Runner 2',
        reps: 37,
        stoppedAt: CREATED_AT + 151_000
      }),
      createdAt: CREATED_AT + 151_000
    })
  ];
}
