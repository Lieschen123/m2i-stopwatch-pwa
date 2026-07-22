import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M2IHypercorePeer } from './hypercore-peer.js';
import { createSampleChallenge, createSampleHistoryEntry, peerAEnvelopes, peerBEnvelopes } from './sample-envelopes.js';
import { createClaimEnvelope } from '../../src/envelope.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(__dirname, '.data-hypercore');
const roomId = 'RUNNER2-DAILY-BURPEES-HYPERCORE';

function canonical(value) {
  return JSON.stringify(value);
}

async function waitForConvergence(peerA, peerB, { claimCount, timeoutMs = 20000 }) {
  const started = Date.now();
  let stateA = peerA.state();
  let stateB = peerB.state();
  while (Date.now() - started < timeoutMs) {
    stateA = peerA.state();
    stateB = peerB.state();
    if (canonical(stateA) === canonical(stateB) && stateA.participantCount === 2 && stateA.claimCount === claimCount) {
      return { stateA, stateB };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { stateA, stateB };
}

async function waitForConnections(peerA, peerB, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (peerA.connectionCount() > 0 && peerB.connectionCount() > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function runPhase(label, setup) {
  const peerA = await M2IHypercorePeer.create({
    name: `${label}-peer-a-coordinator`,
    roomId,
    storageDir: path.join(dataRoot, 'peer-a')
  });
  const peerB = await M2IHypercorePeer.create({
    name: `${label}-peer-b-runner2`,
    roomId,
    storageDir: path.join(dataRoot, 'peer-b')
  });
  await setup(peerA, peerB);
  await Promise.all([peerA.start(), peerB.start()]);
  return { peerA, peerB };
}

fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(dataRoot, { recursive: true });

console.log('\nPhase 1: first run, seed initial envelopes');
let { peerA, peerB } = await runPhase('phase1', async (a, b) => {
  for (const envelope of peerAEnvelopes()) await a.addEnvelope(envelope);
  for (const envelope of peerBEnvelopes()) await b.addEnvelope(envelope);
});
let result = await waitForConvergence(peerA, peerB, { claimCount: 2 });
console.log('Phase 1 Peer A state');
console.log(JSON.stringify(result.stateA, null, 2));
console.log('Phase 1 Peer B state');
console.log(JSON.stringify(result.stateB, null, 2));
if (canonical(result.stateA) !== canonical(result.stateB) || result.stateA.claimCount !== 2) {
  await Promise.all([peerA.stop(), peerB.stop()]);
  console.error('❌ phase 1 did not converge');
  process.exit(1);
}
const phase1Seen = result.stateA.seen.length;
await Promise.all([peerA.stop(), peerB.stop()]);
await new Promise((resolve) => setTimeout(resolve, 3000));

console.log('\nPhase 2: restart same storage, append one new claim, prove dedupe/resume');
({ peerA, peerB } = await runPhase('phase2', async (a) => {
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
  await a.addEnvelope(newClaim);
}));
result = await waitForConvergence(peerA, peerB, { claimCount: 3 });
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
  console.error('❌ restart/dedupe failed: expected one new envelope and no duplicates');
  process.exit(1);
}
console.log('\n✅ Hypercore persistence prototype resumed, deduped, and converged after restart.');
