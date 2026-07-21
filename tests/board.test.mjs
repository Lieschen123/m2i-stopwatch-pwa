import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBoardViewModel, formatFreshness, formatDay } from '../src/board.js';
import { buildShareExport, parseShareImport } from '../src/board-share.js';
import { createChallengePlan } from '../src/challenge.js';

function claim({ challengeId, challengeCode, displayName, npub = '', stoppedAt, durationSeconds = 30 * 60, distanceKm = 5 }) {
  return {
    id: `claim-${stoppedAt}-${displayName}`,
    challengeId,
    stoppedAt,
    claim: {
      challenge_id: challengeId,
      challenge_code: challengeCode,
      claimant_display_name: displayName,
      claimant_npub: npub,
      stopped_at: stoppedAt,
      duration_seconds: durationSeconds,
      distance_km: distanceKm,
      distance_meters: distanceKm * 1000,
      gps_sample_count: 3,
      verification_method: 'test'
    }
  };
}

function buildChallenge({ startsAt, durationDays = 30, requiredActiveDays = 10, participants = 'Nono|npub1nono\nRunner2|npub1runner2', minMinutes = 30 }) {
  return createChallengePlan({
    code: 'M2I-TEST',
    startDate: new Date(startsAt).toISOString().slice(0, 10),
    durationDays,
    requiredActiveDays,
    minMinutesPerActiveDay: minMinutes,
    minDistanceKm: 0,
    participantsText: participants,
    createdAt: startsAt
  });
}

test('board view-model: 2 participants, both fresh, on-track', () => {
  const startsAt = new Date('2026-07-01T00:00:00').getTime();
  const now = startsAt + 5 * 24 * 60 * 60 * 1000; // day 5
  const challenge = buildChallenge({ startsAt, durationDays: 30, requiredActiveDays: 10 });

  const history = [
    claim({ challengeId: challenge.id, displayName: 'Nono', npub: 'npub1nono', stoppedAt: startsAt + 1 * 24 * 3600 * 1000 }),
    claim({ challengeId: challenge.id, displayName: 'Nono', npub: 'npub1nono', stoppedAt: startsAt + 3 * 24 * 3600 * 1000 })
  ];

  const vm = buildBoardViewModel({
    challenge,
    history,
    ownNpub: 'npub1nono',
    ownDisplayName: 'Nono',
    now
  });

  assert.equal(vm.challengeCode, 'M2I-TEST');
  assert.equal(vm.participants.length, 2);

  const nono = vm.participants.find((p) => p.displayName === 'Nono');
  assert.ok(nono.isOwn, 'Nono should be marked as own');
  assert.equal(nono.validActiveDays, 2);
  assert.equal(nono.source, 'local');

  const runner = vm.participants.find((p) => p.displayName === 'Runner2');
  assert.equal(runner.isOwn, false);
  assert.equal(runner.validActiveDays, 0);
  assert.equal(runner.source, 'no-data-yet');
});

test('board view-model: pace classification', () => {
  const startsAt = new Date('2026-07-01T00:00:00').getTime();
  const now = startsAt + 20 * 24 * 60 * 60 * 1000; // day 20 of 30
  const challenge = buildChallenge({ startsAt, durationDays: 30, requiredActiveDays: 10, participants: 'A|npub1a\nB|npub1b\nC|npub1c\nD|npub1d' });

  // At day 20/30 with target 10, expected pace ≈ 6.67 active days
  const history = [];
  // A: 9 active days → ahead
  for (let i = 1; i <= 9; i++) history.push(claim({ challengeId: challenge.id, displayName: 'A', npub: 'npub1a', stoppedAt: startsAt + i * 24 * 3600 * 1000 }));
  // B: 7 active days → on pace
  for (let i = 1; i <= 7; i++) history.push(claim({ challengeId: challenge.id, displayName: 'B', npub: 'npub1b', stoppedAt: startsAt + i * 24 * 3600 * 1000 }));
  // C: 5 active days → behind
  for (let i = 1; i <= 5; i++) history.push(claim({ challengeId: challenge.id, displayName: 'C', npub: 'npub1c', stoppedAt: startsAt + i * 24 * 3600 * 1000 }));
  // D: 3 active days → critical
  for (let i = 1; i <= 3; i++) history.push(claim({ challengeId: challenge.id, displayName: 'D', npub: 'npub1d', stoppedAt: startsAt + i * 24 * 3600 * 1000 }));

  const vm = buildBoardViewModel({ challenge, history, now });
  const paceByName = Object.fromEntries(vm.participants.map((p) => [p.displayName, p.pace.tone]));
  assert.equal(paceByName.A, 'ahead');
  assert.equal(paceByName.B, 'on-track');
  assert.equal(paceByName.C, 'behind');
  assert.equal(paceByName.D, 'critical');
});

test('board view-model: forecasts at-risk when someone is critical', () => {
  const startsAt = new Date('2026-07-01T00:00:00').getTime();
  const now = startsAt + 25 * 24 * 60 * 60 * 1000; // day 25 of 30
  const challenge = buildChallenge({ startsAt, durationDays: 30, requiredActiveDays: 10, participants: 'Nono|npub1nono\nRunner2|npub1runner2' });

  const history = [];
  // Nono complete
  for (let i = 1; i <= 10; i++) history.push(claim({ challengeId: challenge.id, displayName: 'Nono', npub: 'npub1nono', stoppedAt: startsAt + i * 24 * 3600 * 1000 }));
  // Runner2 only 3 active days → critical
  for (let i = 1; i <= 3; i++) history.push(claim({ challengeId: challenge.id, displayName: 'Runner2', npub: 'npub1runner2', stoppedAt: startsAt + i * 24 * 3600 * 1000 }));

  const vm = buildBoardViewModel({ challenge, history, now });
  assert.equal(vm.settlementForecast.status, 'at-risk');
  assert.deepEqual(vm.settlementForecast.atRisk, ['Runner2']);
});

test('board view-model: forecasts missed when expired with incomplete', () => {
  const startsAt = new Date('2026-06-01T00:00:00').getTime();
  const now = startsAt + 40 * 24 * 60 * 60 * 1000; // past end
  const challenge = buildChallenge({ startsAt, durationDays: 30, requiredActiveDays: 10 });

  const history = [
    // Nono complete
    ...Array.from({ length: 10 }, (_, i) => claim({ challengeId: challenge.id, displayName: 'Nono', npub: 'npub1nono', stoppedAt: startsAt + (i + 1) * 24 * 3600 * 1000 })),
    // Runner2 only 5
    ...Array.from({ length: 5 }, (_, i) => claim({ challengeId: challenge.id, displayName: 'Runner2', npub: 'npub1runner2', stoppedAt: startsAt + (i + 1) * 24 * 3600 * 1000 }))
  ];

  const vm = buildBoardViewModel({ challenge, history, now });
  assert.equal(vm.settlementForecast.status, 'missed');
  assert.ok(vm.settlementForecast.text.includes('Runner2'));
});

test('formatFreshness: readable ranges', () => {
  assert.equal(formatFreshness(null), 'no shared updates yet');
  assert.equal(formatFreshness(30_000), 'just now');
  assert.equal(formatFreshness(5 * 60_000), '5 min ago');
  assert.equal(formatFreshness(3 * 60 * 60_000), '3h ago');
  assert.equal(formatFreshness(2 * 24 * 60 * 60_000), '2d ago');
  assert.equal(formatFreshness(10 * 24 * 60 * 60_000), '1w ago');
});

test('share export/import: round-trip', () => {
  const startsAt = new Date('2026-07-01T00:00:00').getTime();
  const challenge = buildChallenge({ startsAt, durationDays: 30, requiredActiveDays: 10 });
  const history = [
    {
      id: 'evt-1',
      challengeId: challenge.id,
      stoppedAt: startsAt + 24 * 3600 * 1000,
      claim: {
        challenge_id: challenge.id,
        challenge_code: challenge.code,
        claimant_display_name: 'Runner2',
        claimant_npub: 'npub1runner2',
        stopped_at: startsAt + 24 * 3600 * 1000,
        duration_seconds: 30 * 60,
        distance_km: 5
      },
      event: {
        id: 'evt-1',
        sig: 'deadbeef',
        content: JSON.stringify({
          challenge_id: challenge.id,
          challenge_code: challenge.code,
          claimant_display_name: 'Runner2',
          claimant_npub: 'npub1runner2',
          stopped_at: startsAt + 24 * 3600 * 1000,
          duration_seconds: 30 * 60,
          distance_km: 5
        })
      }
    }
  ];

  const exported = buildShareExport({
    challenge,
    history,
    ownNpub: 'npub1runner2',
    ownDisplayName: 'Runner2'
  });
  assert.ok(exported.includes('"m2i_share": "buddy-update"') || exported.includes('"m2i_share":"buddy-update"'));

  const parsed = parseShareImport(exported);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.proofs.length, 1);
  assert.equal(parsed.proofs[0].challengeId, challenge.id);
  assert.equal(parsed.claimant.displayName, 'Runner2');
});

test('parseShareImport: rejects non-M2I payloads', () => {
  assert.equal(parseShareImport('').ok, false);
  assert.equal(parseShareImport('hello world').ok, false);
  assert.equal(parseShareImport('{"foo":"bar"}').ok, false);
  assert.equal(parseShareImport('{"m2i_share":"buddy-update","version":99,"claims":[]}').ok, false);
});

test('formatDay: readable', () => {
  const day = formatDay(new Date('2026-07-15').getTime());
  assert.ok(day.length > 3);
  assert.equal(formatDay(0), '—');
  assert.equal(formatDay(null), '—');
});
