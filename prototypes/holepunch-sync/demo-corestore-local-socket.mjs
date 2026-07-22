import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M2ICorestoreReplicationPeer } from './corestore-replication-peer.js';
import { createSampleChallenge, createSampleHistoryEntry, peerAEnvelopes, peerBEnvelopes } from './sample-envelopes.js';
import { createClaimEnvelope } from '../../src/envelope.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(__dirname, '.data-corestore-local-socket');

function canonical(value) {
  return JSON.stringify(value);
}

async function openPair() {
  const peerA = await M2ICorestoreReplicationPeer.create({
    name: 'local-socket-peer-a-coordinator',
    roomId: 'unused-local-socket-room',
    storageDir: path.join(dataRoot, 'peer-a')
  });
  const peerB = await M2ICorestoreReplicationPeer.create({
    name: 'local-socket-peer-b-runner2',
    roomId: 'unused-local-socket-room',
    storageDir: path.join(dataRoot, 'peer-b')
  });
  return { peerA, peerB };
}

async function replicatePair(peerA, peerB) {
  const server = net.createServer((socket) => {
    peerA.bootstrapReplicationSocket(socket, false).catch((error) => {
      console.error(`[${peerA.name}] local replication failed: ${error.message}`);
      socket.destroy();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const client = net.createConnection({ host: '127.0.0.1', port });
  await new Promise((resolve) => client.once('connect', resolve));
  peerB.bootstrapReplicationSocket(client, true).catch((error) => {
    console.error(`[${peerB.name}] local replication failed: ${error.message}`);
    client.destroy();
  });
  return async () => {
    client.destroy();
    await new Promise((resolve) => server.close(resolve));
  };
}

async function waitForState(peerA, peerB, { claimCount, timeoutMs = 10000 }) {
  const started = Date.now();
  let stateA = await peerA.state();
  let stateB = await peerB.state();
  while (Date.now() - started < timeoutMs) {
    stateA = await peerA.state();
    stateB = await peerB.state();
    if (canonical(stateA) === canonical(stateB) && stateA.participantCount === 2 && stateA.claimCount === claimCount) {
      return { stateA, stateB };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { stateA, stateB };
}

fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(dataRoot, { recursive: true });

console.log('\nPhase 1: Corestore replication over local TCP socket');
let { peerA, peerB } = await openPair();
for (const envelope of peerAEnvelopes()) await peerA.addEnvelope(envelope);
for (const envelope of peerBEnvelopes()) await peerB.addEnvelope(envelope);
let closeReplication = await replicatePair(peerA, peerB);
let result = await waitForState(peerA, peerB, { claimCount: 2 });
console.log('Phase 1 state');
console.log(JSON.stringify(result.stateA, null, 2));
if (canonical(result.stateA) !== canonical(result.stateB) || result.stateA.claimCount !== 2) {
  await closeReplication();
  await Promise.all([peerA.stop(), peerB.stop()]);
  console.error('❌ phase 1 local socket replication failed');
  process.exit(1);
}
const phase1Seen = result.stateA.seen.length;
await closeReplication();
await Promise.all([peerA.stop(), peerB.stop()]);

console.log('\nPhase 2: reopen, append one new claim, replicate over local TCP socket');
({ peerA, peerB } = await openPair());
const loadedA = await peerA.state();
const loadedB = await peerB.state();
if (loadedA.seen.length !== phase1Seen || loadedB.seen.length !== phase1Seen) {
  await Promise.all([peerA.stop(), peerB.stop()]);
  console.error('❌ reload failed before local socket replication');
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
closeReplication = await replicatePair(peerA, peerB);
result = await waitForState(peerA, peerB, { claimCount: 3 });
console.log('Phase 2 state');
console.log(JSON.stringify(result.stateA, null, 2));
await closeReplication();
await Promise.all([peerA.stop(), peerB.stop()]);

if (canonical(result.stateA) !== canonical(result.stateB)) {
  console.error('❌ peers did not converge after restart');
  process.exit(1);
}
if (result.stateA.claimCount !== 3 || result.stateA.seen.length !== phase1Seen + 1) {
  console.error('❌ expected exactly one new envelope after restart');
  process.exit(1);
}
console.log('\n✅ Corestore replication over real sockets passed: restart, dedupe, append, converge.');
