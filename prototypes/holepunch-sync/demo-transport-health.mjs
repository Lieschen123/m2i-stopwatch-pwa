import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M2ICorestoreReplicationPeer } from './corestore-replication-peer.js';
import { peerAEnvelopes, peerBEnvelopes } from './sample-envelopes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(__dirname, '.data-transport-health');

async function replicatePair(peerA, peerB) {
  const server = net.createServer((socket) => {
    peerA.bootstrapReplicationSocket(socket, false).catch((error) => {
      peerA.markError(error);
      socket.destroy();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const client = net.createConnection({ host: '127.0.0.1', port });
  await new Promise((resolve) => client.once('connect', resolve));
  peerB.bootstrapReplicationSocket(client, true).catch((error) => {
    peerB.markError(error);
    client.destroy();
  });
  return async () => {
    client.destroy();
    await new Promise((resolve) => server.close(resolve));
  };
}

async function waitForSynced(peerA, peerB, expectedClaimCount) {
  const started = Date.now();
  let healthA;
  let healthB;
  while (Date.now() - started < 10000) {
    healthA = await peerA.refreshHealth({ expectedClaimCount });
    healthB = await peerB.refreshHealth({ expectedClaimCount });
    if (healthA.status === 'synced' && healthB.status === 'synced') return { healthA, healthB };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { healthA, healthB };
}

fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(dataRoot, { recursive: true });

const peerA = await M2ICorestoreReplicationPeer.create({
  name: 'health-peer-a-coordinator',
  roomId: 'unused-health-room',
  storageDir: path.join(dataRoot, 'peer-a')
});
const peerB = await M2ICorestoreReplicationPeer.create({
  name: 'health-peer-b-runner2',
  roomId: 'unused-health-room',
  storageDir: path.join(dataRoot, 'peer-b')
});

for (const envelope of peerAEnvelopes()) await peerA.addEnvelope(envelope);
for (const envelope of peerBEnvelopes()) await peerB.addEnvelope(envelope);

console.log('Before transport:');
console.log(JSON.stringify(await peerA.refreshHealth({ expectedClaimCount: 2 }), null, 2));
console.log(JSON.stringify(await peerB.refreshHealth({ expectedClaimCount: 2 }), null, 2));

const closeReplication = await replicatePair(peerA, peerB);
const { healthA, healthB } = await waitForSynced(peerA, peerB, 2);
console.log('\nAfter transport sync:');
console.log(JSON.stringify(healthA, null, 2));
console.log(JSON.stringify(healthB, null, 2));
await closeReplication();
await Promise.all([peerA.stop(), peerB.stop()]);

if (healthA.status !== 'synced' || healthB.status !== 'synced') {
  console.error('❌ transport health did not reach synced');
  process.exit(1);
}
if (healthA.connectionCount < 1 || healthB.connectionCount < 1) {
  console.error('❌ transport health did not observe a live connection');
  process.exit(1);
}
console.log('\n✅ Transport health passed: disconnected → syncing → synced with observable status.');
