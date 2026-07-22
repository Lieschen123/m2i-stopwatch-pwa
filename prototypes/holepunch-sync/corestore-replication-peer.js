import fs from 'node:fs';
import path from 'node:path';
import Corestore from 'corestore';
import Hyperswarm from 'hyperswarm';
import b4a from 'b4a';
import { parseEnvelope } from '../../src/envelope.js';
import { reduceEnvelopes } from './reducer.js';
import { roomTopic, shortTopic } from './room-topic.js';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readAll(core) {
  await core.update();
  const values = [];
  for (let index = 0; index < core.length; index += 1) {
    const block = await core.get(index);
    values.push(JSON.parse(b4a.toString(block)));
  }
  return values;
}

export class M2ICorestoreReplicationPeer {
  constructor({ name, roomId, storageDir }) {
    this.name = name;
    this.roomId = roomId;
    this.storageDir = storageDir;
    this.knownWritersFile = path.join(storageDir, 'known-writers.json');
    this.store = new Corestore(path.join(storageDir, 'corestore'));
    this.swarm = new Hyperswarm();
    this.sockets = new Set();
    this.writer = null;
    this.writerKeyHex = '';
    this.remoteCores = new Map();
    this.knownWriterKeys = new Set(loadJson(this.knownWritersFile, []));
    ensureDir(storageDir);
  }

  static async create(options) {
    const peer = new M2ICorestoreReplicationPeer(options);
    await peer.open();
    return peer;
  }

  async open() {
    await this.store.ready();
    this.writer = this.store.get({ name: 'local-envelope-writer' });
    await this.writer.ready();
    this.writerKeyHex = b4a.toString(this.writer.key, 'hex');
    this.knownWriterKeys.add(this.writerKeyHex);
    await this.openKnownRemoteCores();
    this.saveKnownWriters();
  }

  saveKnownWriters() {
    saveJson(this.knownWritersFile, [...this.knownWriterKeys].sort());
  }

  async openKnownRemoteCores() {
    for (const keyHex of [...this.knownWriterKeys]) {
      if (keyHex === this.writerKeyHex || this.remoteCores.has(keyHex)) continue;
      const core = this.store.get({ key: b4a.from(keyHex, 'hex') });
      await core.ready();
      this.remoteCores.set(keyHex, core);
    }
  }

  async addRemoteWriter(keyHex) {
    if (!/^[0-9a-f]{64}$/.test(String(keyHex || ''))) return false;
    if (this.knownWriterKeys.has(keyHex)) return false;
    this.knownWriterKeys.add(keyHex);
    await this.openKnownRemoteCores();
    this.saveKnownWriters();
    console.log(`[${this.name}] learned writer ${keyHex.slice(0, 16)}`);
    return true;
  }

  async addEnvelope(input) {
    const envelope = parseEnvelope(input);
    const known = await this.allEnvelopeHashes();
    if (known.has(envelope.envelope_hash)) return false;
    await this.writer.append(b4a.from(JSON.stringify(envelope)));
    return true;
  }

  async allEnvelopes() {
    await this.openKnownRemoteCores();
    const envelopes = [];
    for (const envelope of await readAll(this.writer)) envelopes.push(envelope);
    for (const core of this.remoteCores.values()) {
      for (const envelope of await readAll(core)) envelopes.push(envelope);
    }
    const byHash = new Map();
    for (const envelope of envelopes) {
      const parsed = parseEnvelope(envelope);
      byHash.set(parsed.envelope_hash, parsed);
    }
    return [...byHash.values()];
  }

  async allEnvelopeHashes() {
    return new Set((await this.allEnvelopes()).map((envelope) => envelope.envelope_hash));
  }

  async state() {
    return reduceEnvelopes(await this.allEnvelopes());
  }

  async start() {
    const topic = roomTopic(this.roomId);
    this.swarm.on('connection', (socket, info = {}) => {
      this.sockets.add(socket);
      console.log(`[${this.name}] replication socket opened sockets=${this.sockets.size}`);
      socket.on('close', () => {
        this.sockets.delete(socket);
        console.log(`[${this.name}] replication socket closed sockets=${this.sockets.size}`);
      });
      this.bootstrapReplicationSocket(socket, Boolean(info.client)).catch((error) => {
        console.error(`[${this.name}] replication socket failed: ${error.message}`);
        socket.destroy();
      });
    });
    const discovery = this.swarm.join(topic, { server: true, client: true });
    await discovery.flushed();
    await this.swarm.flush();
    console.log(`[${this.name}] joined corestore room ${this.roomId} topic=${shortTopic(topic)} writer=${this.writerKeyHex.slice(0, 16)}`);
  }

  async bootstrapReplicationSocket(socket, isInitiator) {
    socket.write(`${JSON.stringify({ kind: 'm2i-writer-key', key: this.writerKeyHex })}\n`);
    const { message, rest } = await this.readFirstJsonLine(socket);
    if (message?.kind !== 'm2i-writer-key') throw new Error('missing remote writer key');
    await this.addRemoteWriter(message.key);
    if (rest.length) socket.unshift(rest);
    const replication = this.store.replicate(isInitiator, { live: true });
    replication.on('error', (error) => {
      if (String(error.message || '').includes('Writable stream closed')) return;
      console.error(`[${this.name}] replication error: ${error.message}`);
    });
    socket.pipe(replication).pipe(socket);
  }

  readFirstJsonLine(socket) {
    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const onData = (chunk) => {
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
        const newline = buffer.indexOf(10);
        if (newline === -1) return;
        socket.off('data', onData);
        socket.off('error', onError);
        const line = buffer.subarray(0, newline).toString('utf8');
        const rest = buffer.subarray(newline + 1);
        try {
          resolve({ message: JSON.parse(line), rest });
        } catch (error) {
          reject(error);
        }
      };
      const onError = (error) => {
        socket.off('data', onData);
        reject(error);
      };
      socket.on('data', onData);
      socket.once('error', onError);
    });
  }

  async stop() {
    for (const socket of this.sockets) socket.destroy();
    await this.swarm.destroy();
    await this.store.close();
  }
}
