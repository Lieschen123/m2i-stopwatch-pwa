import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceEnvelopes } from '../prototypes/holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../prototypes/holepunch-sync/sample-envelopes.js';
import { createNostrEnvelopeEvent, envelopeFromNostrEvent, envelopesFromNostrEvents, isM2IEnvelopeEvent } from '../prototypes/nostr-coordination/nostr-envelope-events.js';

function canonical(value) {
  return JSON.stringify(value);
}

test('Nostr envelope events reduce to the same board state as raw M2I envelopes', () => {
  const envelopes = [...peerAEnvelopes(), ...peerBEnvelopes()];
  const directState = reduceEnvelopes(envelopes);
  const events = envelopes.map((envelope) => createNostrEnvelopeEvent({ envelope }));
  assert.equal(events.every((event) => isM2IEnvelopeEvent(event)), true);
  const unwrapped = envelopesFromNostrEvents(events);
  const nostrState = reduceEnvelopes(unwrapped);
  assert.equal(canonical(nostrState), canonical(directState));
});

test('Nostr envelope event tags expose transport metadata but content hash remains canonical proof id', () => {
  const [envelope] = peerAEnvelopes();
  const event = createNostrEnvelopeEvent({ envelope, privacy: 'private' });
  assert.equal(event.kind, 30316);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'm2i'), ['m2i', 'envelope', 'v1']);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'm2i_type'), ['m2i_type', envelope.type]);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'envelope_hash'), ['envelope_hash', envelope.envelope_hash]);
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'privacy'), ['privacy', 'private']);
  const unwrapped = envelopeFromNostrEvent(event);
  assert.equal(unwrapped.envelope_hash, envelope.envelope_hash);
});

test('Nostr envelope unwrap rejects tag/content hash mismatch', () => {
  const [envelope] = peerAEnvelopes();
  const event = createNostrEnvelopeEvent({ envelope });
  const tampered = {
    ...event,
    tags: event.tags.map((tag) => tag[0] === 'envelope_hash' ? ['envelope_hash', '0'.repeat(64)] : tag)
  };
  assert.throws(() => envelopeFromNostrEvent(tampered, { verify: false }), /envelope_hash tag does not match/);
});

test('Nostr envelope unwrap rejects invalid Nostr signatures by default', () => {
  const [envelope] = peerAEnvelopes();
  const event = createNostrEnvelopeEvent({ envelope });
  const tampered = { ...event, content: event.content.replace('RUNNER2', 'RUNNERX') };
  assert.throws(() => envelopeFromNostrEvent(tampered), /signature is invalid/);
});
