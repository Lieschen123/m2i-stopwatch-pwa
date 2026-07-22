import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceEnvelopes } from '../prototypes/holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../prototypes/holepunch-sync/sample-envelopes.js';
import { createRoomStatusProjection } from '../prototypes/nostr-coordination/private-room-projection.js';
import { formatRoomStatusMessage } from '../prototypes/nostr-coordination/room-status-format.js';

function sampleStatus() {
  return createRoomStatusProjection(reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]));
}

test('formats bot-safe room status as a readable challenge message', () => {
  const message = formatRoomStatusMessage(sampleStatus());
  assert.match(message, /RUNNER2-DAILY-BURPEES/);
  assert.match(message, /Activity: burpees/);
  assert.match(message, /Round: 150s/);
  assert.match(message, /✅ Nono — 1\/14 days/);
  assert.match(message, /✅ Runner 2 — 1\/14 days/);
  assert.match(message, /2 claims counted/);
  assert.match(message, /Nobody has completed/);
  assert.match(message, /Bot-safe summary only/);
});

test('formatted room status does not leak private proof or payment words', () => {
  const message = formatRoomStatusMessage(sampleStatus()).toLowerCase();
  for (const forbidden of ['envelope_hash', 'canonical_json', 'payment', 'invoice', 'settlement', 'heart', 'gps', 'signature', 'nsec']) {
    assert.equal(message.includes(forbidden), false, `message leaked ${forbidden}`);
  }
});

test('formats completion states', () => {
  const status = sampleStatus();
  const complete = {
    ...status,
    participants: status.participants.map((participant) => ({ ...participant, validDayCount: 14, complete: true })),
    totals: { ...status.totals, completeCount: status.totals.participantCount }
  };
  assert.match(formatRoomStatusMessage(complete), /Everyone has completed/);
  const partial = {
    ...status,
    participants: [
      { ...status.participants[0], validDayCount: 14, complete: true },
      status.participants[1]
    ],
    totals: { ...status.totals, completeCount: 1 }
  };
  assert.match(formatRoomStatusMessage(partial), /1\/2 participants have completed/);
});

test('formats stale/no-claim participants', () => {
  const status = sampleStatus();
  const stale = {
    ...status,
    participants: status.participants.map((participant) => participant.alias === 'Runner 2'
      ? { ...participant, validDayCount: 0, latestValidDay: null, complete: false }
      : participant)
  };
  const message = formatRoomStatusMessage(stale);
  assert.match(message, /⏳ Runner 2 — 0\/14 days, latest: no valid day yet/);
});
