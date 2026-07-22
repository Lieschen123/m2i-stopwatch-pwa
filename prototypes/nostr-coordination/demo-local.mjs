import { reduceEnvelopes } from '../holepunch-sync/reducer.js';
import { peerAEnvelopes, peerBEnvelopes } from '../holepunch-sync/sample-envelopes.js';
import { createNostrEnvelopeEvent, envelopesFromNostrEvents } from './nostr-envelope-events.js';

function canonical(value) {
  return JSON.stringify(value);
}

const envelopes = [...peerAEnvelopes(), ...peerBEnvelopes()];
const directState = reduceEnvelopes(envelopes);
const events = envelopes.map((envelope) => createNostrEnvelopeEvent({ envelope }));
const unwrapped = envelopesFromNostrEvents(events);
const nostrState = reduceEnvelopes(unwrapped);

console.log('Direct envelope board state');
console.log(JSON.stringify(directState, null, 2));
console.log('\nNostr-wrapped board state');
console.log(JSON.stringify(nostrState, null, 2));
console.log('\nSample Nostr tags');
console.log(JSON.stringify(events[0].tags, null, 2));

if (canonical(directState) !== canonical(nostrState)) {
  console.error('❌ Nostr-wrapped envelopes did not reduce to the same board state.');
  process.exit(1);
}
console.log('\n✅ Nostr coordination prototype passed: wrap → unwrap → same M2I board state.');
