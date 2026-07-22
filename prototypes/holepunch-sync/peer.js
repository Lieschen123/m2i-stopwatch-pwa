import fs from 'node:fs';
import path from 'node:path';
import Hyperswarm from 'hyperswarm';
import b4a from 'b4a';
import { parseEnvelope } from '../../src/envelope.js';
import { reduceEnvelopes } from './reducer.js';
import { roomTopic, shortTopic } from './room-topic.js';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function appendJsonl(file, value) {
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

function wireJsonLines(socket, onMessage) {
  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += b4a.toString(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      onMessage(JSON.parse(line));
    }
  });
}

export class M2IHolepunchPeer {
  constructor({ name, roomId, storageDir, initialEnvelopes = [] }) {
    this.name = name;
    this.roomId = roomId;
    this.storageDir = storageDir;
    this.logFile = path.join(storageDir, 'envelopes.jsonl');
    this.swarm = new Hyperswarm();
    this.sockets = new Set();
    this.seen = new Set();
    this.envelopes = [];
    ensureDir(storageDir);
    for (const envelope of loadJsonl(this.logFile)) this.remember(envelope, { persist: false });
    for (const envelope of initialEnvelopes) this.remember(envelope, { persist: true });
  }

  remember(input, { persist = true } = {}) {
    const envelope = parseEnvelope(input);
    if (this.seen.has(envelope.envelope_hash)) return false;
    this.seen.add(envelope.envelope_hash);
    this.envelopes.push(envelope);
    if (persist) appendJsonl(this.logFile, envelope);
    return true;
  }

  async start() {
    const topic = roomTopic(this.roomId);
    this.swarm.on('connection', (socket, info) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
      wireJsonLines(socket, (message) => {
        if (message?.kind !== 'm2i-envelope') return;
        const added = this.remember(message.envelope);
        if (added) this.broadcastEnvelope(message.envelope, socket);
      });
      for (const envelope of this.envelopes) this.sendEnvelope(socket, envelope);
    });
    const discovery = this.swarm.join(topic, { server: true, client: true });
    await discovery.flushed();
    await this.swarm.flush();
    console.log(`[${this.name}] joined room ${this.roomId} topic=${shortTopic(topic)}`);
  }

  sendEnvelope(socket, envelope) {
    socket.write(`${JSON.stringify({ kind: 'm2i-envelope', envelope })}\n`);
  }

  broadcastEnvelope(envelope, except = null) {
    for (const socket of this.sockets) {
      if (socket !== except) this.sendEnvelope(socket, envelope);
    }
  }

  state() {
    return reduceEnvelopes(this.envelopes);
  }

  async stop() {
    for (const socket of this.sockets) socket.destroy();
    await this.swarm.destroy();
  }
}
