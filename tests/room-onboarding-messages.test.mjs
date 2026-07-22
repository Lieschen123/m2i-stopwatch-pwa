import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceEnvelopes } from '../prototypes/holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../prototypes/holepunch-sync/sample-envelopes.js';
import { createRoomStatusProjection } from '../prototypes/nostr-coordination/private-room-projection.js';
import { formatRepeatedGamesMessage, formatWelcomeMessage, formatWhatToDoMessage } from '../prototypes/nostr-coordination/room-onboarding-messages.js';

function sampleStatus() {
  return createRoomStatusProjection(reduceEnvelopes([...peerAEnvelopes(), ...peerBEnvelopes()]));
}

function assertNoPrivateLeak(message) {
  const lower = message.toLowerCase();
  for (const forbidden of ['envelope_hash', 'canonical_json', 'payment', 'invoice', 'settlement', 'heart', 'gps', 'route', 'signature', 'nsec', 'private key']) {
    assert.equal(lower.includes(forbidden), false, `message leaked ${forbidden}`);
  }
}

test('welcome message explains private-room purpose and bot-blindness', () => {
  const message = formatWelcomeMessage(sampleStatus());
  assert.match(message, /RUNNER2-DAILY-BURPEES/);
  assert.match(message, /Welcome to the room/);
  assert.match(message, /Nono and Runner 2/);
  assert.match(message, /real proof stays private/);
  assert.match(message, /bot only sees the redacted status summary/i);
  assert.match(message, /Difficulty adjusts/);
  assertNoPrivateLeak(message);
});

test('what-to-do message gives simple participant instructions', () => {
  const message = formatWhatToDoMessage(sampleStatus());
  assert.match(message, /what to do/);
  assert.match(message, /Open your M2I challenge/);
  assert.match(message, /Start the burpees round/);
  assert.match(message, /150 seconds/);
  assert.match(message, /Enter your result honestly/);
  assert.match(message, /private room flow/);
  assertNoPrivateLeak(message);
});

test('repeated-games message explains social trust without surveillance', () => {
  const message = formatRepeatedGamesMessage(sampleStatus());
  assert.match(message, /repeated game/i);
  assert.match(message, /one valid day counts per calendar day/);
  assert.match(message, /extra attempts are allowed/);
  assert.match(message, /no surveillance/);
  assert.match(message, /self-attestation is accepted/);
  assert.match(message, /reputation carries the weight/);
  assertNoPrivateLeak(message);
});
