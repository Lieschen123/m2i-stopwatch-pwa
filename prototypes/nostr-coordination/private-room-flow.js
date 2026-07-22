import { generateSecretKey } from 'nostr-tools/pure';
import { reduceEnvelopes } from '../holepunch-sync/reducer.js';
import { decryptPrivateProofEvent, isPrivateProofEvent } from './private-proof-events.js';
import { createRoomStatusProjection, assertBotSafeRoomStatus } from './private-room-projection.js';
import { createRoomStatusEvent, roomStatusFromEvent } from './room-status-events.js';
import { formatRoomStatusMessage } from './room-status-format.js';
import { createBuzzRoomStatusMessageEvent, parseBuzzM2IMessageEvent } from './buzz-room-adapter.js';

function reject(reason, event, index) {
  return {
    index,
    reason,
    eventId: event?.id || null,
    kind: event?.kind || null
  };
}

export function ingestPrivateProofEvents(events = [], { roomKey, verify = true, existingEnvelopes = [] } = {}) {
  const envelopesByHash = new Map();
  const imported = [];
  const rejected = [];

  for (const envelope of existingEnvelopes) {
    if (envelope?.envelope_hash) envelopesByHash.set(envelope.envelope_hash, envelope);
  }

  events.forEach((event, index) => {
    if (!isPrivateProofEvent(event)) {
      rejected.push(reject('not-private-proof-event', event, index));
      return;
    }
    try {
      const { envelope, metadata, senderAlias } = decryptPrivateProofEvent(event, { roomKey, verify });
      const duplicate = envelopesByHash.has(envelope.envelope_hash);
      if (!duplicate) envelopesByHash.set(envelope.envelope_hash, envelope);
      imported.push({
        index,
        eventId: event.id,
        envelopeHash: envelope.envelope_hash,
        envelopeType: envelope.type,
        metadata,
        senderAlias,
        duplicate
      });
    } catch (error) {
      rejected.push(reject(error.message || 'decrypt-failed', event, index));
    }
  });

  return {
    envelopes: [...envelopesByHash.values()],
    imported,
    rejected,
    acceptedCount: imported.filter((item) => !item.duplicate).length,
    duplicateCount: imported.filter((item) => item.duplicate).length,
    rejectedCount: rejected.length
  };
}

export function createPrivateRoomUpdate({
  privateProofEvents = [],
  roomKey,
  existingEnvelopes = [],
  statusSecretKey = generateSecretKey(),
  buzzSecretKey = generateSecretKey(),
  createdAt = Date.now(),
  channelId,
  verify = true
} = {}) {
  const ingest = ingestPrivateProofEvents(privateProofEvents, { roomKey, verify, existingEnvelopes });
  const state = reduceEnvelopes(ingest.envelopes);
  const status = createRoomStatusProjection(state, { createdAt });
  assertBotSafeRoomStatus(status);
  const signedStatusEvent = createRoomStatusEvent({ status, secretKey: statusSecretKey, createdAt: Math.floor(createdAt / 1000) });
  const verifiedStatus = roomStatusFromEvent(signedStatusEvent);
  const statusMessage = formatRoomStatusMessage(verifiedStatus);
  const result = {
    ingest,
    state,
    status: verifiedStatus,
    signedStatusEvent,
    statusMessage
  };
  if (channelId) {
    result.buzzStatusMessageEvent = createBuzzRoomStatusMessageEvent({
      channelId,
      statusEvent: signedStatusEvent,
      statusMessage,
      secretKey: buzzSecretKey,
      createdAt: Math.floor(createdAt / 1000)
    });
    parseBuzzM2IMessageEvent(result.buzzStatusMessageEvent);
  }
  return result;
}
