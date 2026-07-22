import fs from 'node:fs';
import path from 'node:path';
import Hypercore from 'hypercore';
import Hyperswarm from 'hyperswarm';
import b4a from 'b4a';
import { parseEnvelope } from '../../src/envelope.js';
import { reduceEnvelopes } from './reducer.js';
import { roomTopic, shortTopic } from './room-topic.js';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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

export class M2IHypercorePeer {
  constructor({ name, roomId, storageDir }) {
    this.name = name;
    this.roomId = roomId;
    this.storageDir = storageDir;
    this.swarm = new Hyperswarm();
    this.sockets = new Set();
    this.seen = new Set();
    this.envelopes = [];
    ensureDir(storageDir);
    this.core = new Hypercore(path.join(storageDir, 'envelope-log'));
  }

  static async create(options) {
    const peer = new M2IHypercorePeer(options);
    await peer.open();
    return peer;
  }

  async open() {
    await this.core.ready();
    for (let index = 0; index < this.core.length; index += 1) {
      const block = await this.core.get(index);
      const envelope = JSON.parse(b4a.toString(block));
      await this.remember(envelope, { persist: false, broadcast: false });
    }
  }

  async remember(input, { persist = true, broadcast = true, except = null } = {}) {
    const envelope = parseEnvelope(input);
    if (this.seen.has(envelope.envelope_hash)) return false;
    this.seen.add(envelope.envelope_hash);
    this.envelopes.push(envelope);
    if (persist) await this.core.append(b4a.from(JSON.stringify(envelope)));
    if (broadcast) this.broadcastEnvelope(envelope, except);
    return true;
  }

  async addEnvelope(input) {
    return this.remember(input, { persist: true, broadcast: true });
  }

  async start() {
    const topic = roomTopic(this.roomId);
    this.swarm.on('connection', (socket) => {
      this.sockets.add(socket);
      console.log(`[${this.name}] connection opened sockets=${this.sockets.size}`);
      socket.on('close', () => {
        this.sockets.delete(socket);
        console.log(`[${this.name}] connection closed sockets=${this.sockets.size}`);
      });
      wireJsonLines(socket, async (message) => {
        if (message?.kind !== 'm2i-envelope') return;
        try {
          await this.remember(message.envelope, { persist: true, broadcast: true, except: socket });
        } catch (error) {
          console.error(`[${this.name}] rejected envelope: ${error.message}`);
        }
      });
      for (const envelope of this.envelopes) this.sendEnvelope(socket, envelope);
    });
    const discovery = this.swarm.join(topic, { server: true, client: true });
    await discovery.flushed();
    await this.swarm.flush();
    console.log(`[${this.name}] joined room ${this.roomId} topic=${shortTopic(topic)} hypercoreLength=${this.core.length}`);
  }

  sendEnvelope(socket, envelope) {
    socket.write(`${JSON.stringify({ kind: 'm2i-envelope', envelope })}\n`);
  }

  broadcastEnvelope(envelope, except = null) {
    for (const socket of this.sockets) {
      if (socket !== except) this.sendEnvelope(socket, envelope);
    }
  }

  connectionCount() {
    return this.sockets.size;
  }

  state() {
    return reduceEnvelopes(this.envelopes);
  }

  async stop() {
    for (const socket of this.sockets) socket.destroy();
    await this.swarm.destroy();
    await this.core.close();
  }
}
