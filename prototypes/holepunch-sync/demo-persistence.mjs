import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M2IHypercorePeer } from './hypercore-peer.js';
import { createSampleChallenge, createSampleHistoryEntry, peerAEnvelopes, peerBEnvelopes } from './sample-envelopes.js';
import { createClaimEnvelope } from '../../src/envelope.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(__dirname, '.data-hypercore-deterministic');

function canonical(value) {
  return JSON.stringify(value);
}

async function deterministicSync(peerA, peerB) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const envelope of [...peerA.envelopes]) {
      changed = (await peerB.remember(envelope, { persist: true, broadcast: false })) || changed;
    }
    for (const envelope of [...peerB.envelopes]) {
      changed = (await peerA.remember(envelope, { persist: true, broadcast: false })) || changed;
    }
  }
}

async function openPair() {
  const peerA = await M2IHypercorePeer.create({
    name: 'deterministic-peer-a-coordinator',
    roomId: 'unused-deterministic-room',
    storageDir: path.join(dataRoot, 'peer-a')
  });
  const peerB = await M2IHypercorePeer.create({
    name: 'deterministic-peer-b-runner2',
    roomId: 'unused-deterministic-room',
    storageDir: path.join(dataRoot, 'peer-b')
  });
  return { peerA, peerB };
}

fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(dataRoot, { recursive: true });

console.log('\nPhase 1: append initial envelopes to separate Hypercore logs and sync');
let { peerA, peerB } = await openPair();
for (const envelope of peerAEnvelopes()) await peerA.addEnvelope(envelope);
for (const envelope of peerBEnvelopes()) await peerB.addEnvelope(envelope);
await deterministicSync(peerA, peerB);
let stateA = peerA.state();
let stateB = peerB.state();
console.log('Phase 1 state');
console.log(JSON.stringify(stateA, null, 2));
if (canonical(stateA) !== canonical(stateB) || stateA.participantCount !== 2 || stateA.claimCount !== 2) {
  await Promise.all([peerA.stop(), peerB.stop()]);
  console.error('❌ phase 1 deterministic sync failed');
  process.exit(1);
}
const phase1Seen = stateA.seen.length;
await Promise.all([peerA.stop(), peerB.stop()]);

console.log('\nPhase 2: reopen same Hypercore logs, append one new claim, sync without duplicates');
({ peerA, peerB } = await openPair());
const loadedA = peerA.state();
const loadedB = peerB.state();
if (loadedA.seen.length !== phase1Seen || loadedB.seen.length !== phase1Seen) {
  await Promise.all([peerA.stop(), peerB.stop()]);
  console.error('❌ reload failed: Hypercore did not preserve phase 1 envelopes');
  process.exit(1);
}
const challenge = createSampleChallenge();
const newClaim = createClaimEnvelope({
  challenge,
  historyEntry: createSampleHistoryEntry({
    challenge,
    participant: 'Runner 2',
    reps: 41,
    stoppedAt: Date.UTC(2026, 6, 23, 6, 45, 0)
  }),
  createdAt: Date.UTC(2026, 6, 23, 6, 45, 0)
});
await peerA.addEnvelope(newClaim);
await deterministicSync(peerA, peerB);
stateA = peerA.state();
stateB = peerB.state();
console.log('Phase 2 state');
console.log(JSON.stringify(stateA, null, 2));
await Promise.all([peerA.stop(), peerB.stop()]);

if (canonical(stateA) !== canonical(stateB)) {
  console.error('❌ peers did not converge after restart');
  process.exit(1);
}
if (stateA.claimCount !== 3 || stateA.seen.length !== phase1Seen + 1) {
  console.error('❌ dedupe failed: expected one new envelope only');
  process.exit(1);
}
console.log('\n✅ Hypercore persistence passed: reopen, dedupe, append one new envelope, converge.');
