import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M2ICorestoreReplicationPeer } from './corestore-replication-peer.js';
import { createSampleChallenge, createSampleHistoryEntry, peerAEnvelopes, peerBEnvelopes } from './sample-envelopes.js';
import { createClaimEnvelope } from '../../src/envelope.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(__dirname, '.data-corestore-replication');
const roomId = 'RUNNER2-DAILY-BURPEES-CORESTORE-REPLICATION';

function canonical(value) {
  return JSON.stringify(value);
}

async function openPair(label) {
  const peerA = await M2ICorestoreReplicationPeer.create({
    name: `${label}-peer-a-coordinator`,
    roomId,
    storageDir: path.join(dataRoot, 'peer-a')
  });
  const peerB = await M2ICorestoreReplicationPeer.create({
    name: `${label}-peer-b-runner2`,
    roomId,
    storageDir: path.join(dataRoot, 'peer-b')
  });
  return { peerA, peerB };
}

async function waitForState(peerA, peerB, { claimCount, timeoutMs = 25000 }) {
  const started = Date.now();
  let stateA = await peerA.state();
  let stateB = await peerB.state();
  while (Date.now() - started < timeoutMs) {
    stateA = await peerA.state();
    stateB = await peerB.state();
    if (canonical(stateA) === canonical(stateB) && stateA.participantCount === 2 && stateA.claimCount === claimCount) {
      return { stateA, stateB };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { stateA, stateB };
}

fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(dataRoot, { recursive: true });

console.log('\nPhase 1: real Hyperswarm + Corestore replication');
let { peerA, peerB } = await openPair('phase1');
for (const envelope of peerAEnvelopes()) await peerA.addEnvelope(envelope);
for (const envelope of peerBEnvelopes()) await peerB.addEnvelope(envelope);
await Promise.all([peerA.start(), peerB.start()]);
let result = await waitForState(peerA, peerB, { claimCount: 2 });
console.log('Phase 1 Peer A state');
console.log(JSON.stringify(result.stateA, null, 2));
console.log('Phase 1 Peer B state');
console.log(JSON.stringify(result.stateB, null, 2));
if (canonical(result.stateA) !== canonical(result.stateB) || result.stateA.claimCount !== 2) {
  await Promise.all([peerA.stop(), peerB.stop()]);
  console.error('❌ phase 1 corestore replication did not converge');
  process.exit(1);
}
const phase1Seen = result.stateA.seen.length;
await Promise.all([peerA.stop(), peerB.stop()]);
await new Promise((resolve) => setTimeout(resolve, 3000));

console.log('\nPhase 2: restart, append one new envelope, replicate over Corestore');
({ peerA, peerB } = await openPair('phase2'));
const loadedA = await peerA.state();
const loadedB = await peerB.state();
if (loadedA.seen.length !== phase1Seen || loadedB.seen.length !== phase1Seen) {
  await Promise.all([peerA.stop(), peerB.stop()]);
  console.error('❌ phase 2 reload failed before replication');
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
await Promise.all([peerA.start(), peerB.start()]);
result = await waitForState(peerA, peerB, { claimCount: 3 });
console.log('Phase 2 Peer A state');
console.log(JSON.stringify(result.stateA, null, 2));
console.log('Phase 2 Peer B state');
console.log(JSON.stringify(result.stateB, null, 2));
await Promise.all([peerA.stop(), peerB.stop()]);

if (canonical(result.stateA) !== canonical(result.stateB)) {
  console.error('❌ peers did not converge after restart');
  process.exit(1);
}
if (result.stateA.claimCount !== 3 || result.stateA.seen.length !== phase1Seen + 1) {
  console.error('❌ expected exactly one new envelope after restart');
  process.exit(1);
}
console.log('\n✅ Corestore replication over Hyperswarm passed: restart, dedupe, append, converge.');
