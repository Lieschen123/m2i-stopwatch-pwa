import { ENVELOPE_TYPES, parseEnvelope } from '../../src/envelope.js';

function participantKey(value = {}) {
  return value.npub || value.displayName || value.name || 'unknown';
}

function claimParticipant(historyEntry = {}) {
  return historyEntry.claim?.participant?.displayName
    || historyEntry.claim?.participant_display_name
    || historyEntry.claim?.display_name
    || historyEntry.claim?.participant
    || historyEntry.claim?.runner
    || historyEntry.participant?.displayName
    || historyEntry.displayName
    || 'unknown';
}

function claimDay(historyEntry = {}) {
  const ts = historyEntry.stoppedAt || historyEntry.claim?.stopped_at || historyEntry.claim?.completed_at || historyEntry.claim?.created_at || Date.now();
  return new Date(ts).toISOString().slice(0, 10);
}

export function reduceEnvelopes(inputs = []) {
  const state = {
    challenge: null,
    participants: {},
    claims: {},
    seen: []
  };
  const seen = new Set();
  const envelopes = inputs.map((input) => parseEnvelope(input)).sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at - b.created_at;
    return a.envelope_hash.localeCompare(b.envelope_hash);
  });

  for (const envelope of envelopes) {
    if (seen.has(envelope.envelope_hash)) continue;
    seen.add(envelope.envelope_hash);
    state.seen.push(envelope.envelope_hash);

    if (envelope.type === ENVELOPE_TYPES.challenge) {
      const challenge = envelope.payload.challenge;
      state.challenge = {
        id: challenge.id,
        code: challenge.code,
        activityType: challenge.activityType,
        requiredActiveDays: challenge.requiredActiveDays,
        durationSeconds: challenge.durationSeconds,
        startsAt: challenge.startsAt,
        endsAt: challenge.endsAt
      };
      for (const participant of challenge.participants || []) {
        state.participants[participantKey(participant)] = {
          displayName: participant.displayName,
          npub: participant.npub || ''
        };
      }
    }

    if (envelope.type === ENVELOPE_TYPES.join) {
      const participant = envelope.payload.participant;
      state.participants[participantKey(participant)] = {
        displayName: participant.displayName,
        npub: participant.npub || ''
      };
    }

    if (envelope.type === ENVELOPE_TYPES.claim) {
      const entry = envelope.payload.historyEntry;
      const name = claimParticipant(entry);
      const day = claimDay(entry);
      if (!state.claims[name]) state.claims[name] = {};
      if (!state.claims[name][day]) state.claims[name][day] = [];
      state.claims[name][day].push({
        envelopeHash: envelope.envelope_hash,
        reps: entry.claim?.reps ?? null,
        durationSeconds: entry.claim?.duration_seconds ?? entry.durationSeconds ?? null,
        valid: entry.claim?.valid ?? true
      });
    }
  }

  state.participantCount = Object.keys(state.participants).length;
  state.claimCount = Object.values(state.claims).reduce((sum, byDay) => sum + Object.values(byDay).reduce((inner, list) => inner + list.length, 0), 0);
  return state;
}
