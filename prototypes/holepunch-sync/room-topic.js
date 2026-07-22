import crypto from 'node:crypto';

export function roomTopic(roomId) {
  const clean = String(roomId || '').trim();
  if (!clean) throw new Error('room id is required');
  return crypto.createHash('sha256').update(`m2i-holepunch-room:v1:${clean}`).digest();
}

export function shortTopic(topic) {
  return Buffer.from(topic).toString('hex').slice(0, 16);
}
