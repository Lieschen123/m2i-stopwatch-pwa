import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M2IHolepunchPeer } from './peer.js';
import { peerAEnvelopes, peerBEnvelopes } from './sample-envelopes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(__dirname, '.data');
fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(dataRoot, { recursive: true });

const roomId = 'RUNNER2-DAILY-BURPEES';
const peerA = new M2IHolepunchPeer({
  name: 'peer-a-coordinator',
  roomId,
  storageDir: path.join(dataRoot, 'peer-a'),
  initialEnvelopes: peerAEnvelopes()
});
const peerB = new M2IHolepunchPeer({
  name: 'peer-b-runner2',
  roomId,
  storageDir: path.join(dataRoot, 'peer-b'),
  initialEnvelopes: peerBEnvelopes()
});

await Promise.all([peerA.start(), peerB.start()]);

let stateA = peerA.state();
let stateB = peerB.state();
const started = Date.now();
while (Date.now() - started < 15000) {
  stateA = peerA.state();
  stateB = peerB.state();
  if (JSON.stringify(stateA) === JSON.stringify(stateB) && stateA.participantCount === 2 && stateA.claimCount === 2) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

stateA = peerA.state();
stateB = peerB.state();
console.log('\nPeer A state');
console.log(JSON.stringify(stateA, null, 2));
console.log('\nPeer B state');
console.log(JSON.stringify(stateB, null, 2));

const canonicalA = JSON.stringify(stateA);
const canonicalB = JSON.stringify(stateB);
await Promise.all([peerA.stop(), peerB.stop()]);

if (canonicalA !== canonicalB) {
  console.error('❌ peers did not converge');
  process.exit(1);
}
if (stateA.participantCount !== 2 || stateA.claimCount !== 2) {
  console.error('❌ unexpected board state');
  process.exit(1);
}
console.log('\n✅ Holepunch prototype converged: both peers have same board state.');
