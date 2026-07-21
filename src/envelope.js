import { canonicalJson, sha256Hex } from './crypto.js';

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_TYPES = {
  challenge: 'm2i.challenge.v1',
  join: 'm2i.join.v1',
  claim: 'm2i.claim.v1',
  outcome: 'm2i.outcome.v1',
  paymentRequest: 'm2i.payment_request.v1',
  receipt: 'm2i.receipt.v1'
};

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function shortHash(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 12) : '';
}

function createEnvelope(type, payload, createdAt = Date.now()) {
  assertPlainObject(payload, 'Envelope payload');
  const base = {
    version: ENVELOPE_VERSION,
    type,
    created_at: createdAt,
    payload: jsonClone(payload)
  };
  const serialized = canonicalJson(base);
  return {
    ...base,
    canonical_json: serialized,
    envelope_hash: sha256Hex(serialized)
  };
}

function compactChallenge(challenge) {
  assertPlainObject(challenge, 'Challenge');
  if (!challenge.id) throw new Error('Challenge id is required.');
  if (!challenge.code) throw new Error('Challenge code is required.');
  return {
    id: challenge.id,
    code: challenge.code,
    startsAt: challenge.startsAt,
    endsAt: challenge.endsAt,
    requiredActiveDays: challenge.requiredActiveDays,
    minMinutesPerActiveDay: challenge.minMinutesPerActiveDay,
    minDistanceKm: challenge.minDistanceKm ?? null
  };
}

export function createChallengeEnvelope(challenge) {
  return createEnvelope(ENVELOPE_TYPES.challenge, {
    challenge: jsonClone(challenge)
  }, challenge?.createdAt || Date.now());
}

export function createJoinEnvelope({ challenge, participant, createdAt = Date.now() }) {
  assertPlainObject(participant, 'Participant');
  const challengeEnvelope = createChallengeEnvelope(challenge);
  const displayName = String(participant.displayName || participant.name || '').trim();
  const npub = String(participant.npub || '').trim();
  if (!displayName && !npub) throw new Error('Participant name or npub is required.');
  return createEnvelope(ENVELOPE_TYPES.join, {
    challenge: compactChallenge(challenge),
    challenge_hash: challengeEnvelope.envelope_hash,
    participant: {
      displayName,
      npub
    }
  }, createdAt);
}

export function createClaimEnvelope({ historyEntry, challenge, createdAt }) {
  assertPlainObject(historyEntry, 'History entry');
  if (!historyEntry.id) throw new Error('History entry id is required.');
  if (!historyEntry.claim) throw new Error('History entry claim is required.');
  if (!historyEntry.event) throw new Error('History entry signed event is required.');
  const payload = {
    historyEntry: jsonClone(historyEntry)
  };
  if (challenge) payload.challenge = compactChallenge(challenge);
  return createEnvelope(ENVELOPE_TYPES.claim, payload, createdAt || historyEntry.stoppedAt || Date.now());
}

export function createOutcomeEnvelope({ settlement, createdAt = Date.now() }) {
  assertPlainObject(settlement, 'Settlement');
  return createEnvelope(ENVELOPE_TYPES.outcome, {
    settlement: jsonClone(settlement)
  }, createdAt);
}

export function createPaymentRequestEnvelope({ settlement, request, createdAt = Date.now() }) {
  assertPlainObject(settlement, 'Settlement');
  if (settlement.payment_due !== true) throw new Error('Payment request envelope requires a missed challenge with payment due.');
  const paymentRequest = request || settlement.paymentRequests?.[0] || null;
  const payload = {
    settlement: jsonClone(settlement)
  };
  if (paymentRequest) payload.request = jsonClone(paymentRequest);
  return createEnvelope(ENVELOPE_TYPES.paymentRequest, payload, createdAt);
}

export function createReceiptEnvelope({ settlement, paymentRequestEnvelope, markedBy, createdAt = Date.now(), note }) {
  assertPlainObject(settlement, 'Settlement');
  assertPlainObject(markedBy, 'Marked by');
  const displayName = String(markedBy.displayName || markedBy.name || '').trim();
  const npub = String(markedBy.npub || '').trim();
  if (!displayName && !npub) throw new Error('Receipt marker displayName/name or npub is required.');
  const payload = {
    settlement: jsonClone(settlement),
    marked_by: {
      displayName,
      npub
    }
  };
  if (paymentRequestEnvelope) {
    const envelope = parseEnvelope(paymentRequestEnvelope);
    if (envelope.type !== ENVELOPE_TYPES.paymentRequest) throw new Error('Receipt can only link a payment request envelope.');
    payload.payment_request_hash = envelope.envelope_hash;
  }
  const cleanNote = String(note || '').trim();
  if (cleanNote) payload.note = cleanNote;
  return createEnvelope(ENVELOPE_TYPES.receipt, payload, createdAt);
}

export function parseEnvelope(input) {
  const parsed = parseJsonInput(input, 'Envelope');
  assertPlainObject(parsed, 'Envelope');
  if (parsed.version !== ENVELOPE_VERSION) throw new Error('Envelope version is not supported.');
  if (!Object.values(ENVELOPE_TYPES).includes(parsed.type)) throw new Error('Envelope type is not supported.');
  if (!Number.isFinite(Number(parsed.created_at))) throw new Error('Envelope created_at must be a timestamp.');
  assertPlainObject(parsed.payload, 'Envelope payload');
  if (!/^[0-9a-f]{64}$/.test(String(parsed.envelope_hash || ''))) throw new Error('Envelope hash is missing or invalid.');

  const base = {
    version: parsed.version,
    type: parsed.type,
    created_at: Number(parsed.created_at),
    payload: parsed.payload
  };
  const serialized = canonicalJson(base);
  const hash = sha256Hex(serialized);
  if (hash !== parsed.envelope_hash) throw new Error('Envelope hash does not match its contents.');
  if (parsed.canonical_json && parsed.canonical_json !== serialized) throw new Error('Envelope canonical JSON does not match its contents.');
  return {
    ...base,
    canonical_json: serialized,
    envelope_hash: hash
  };
}

export function createImportedProofRecord(input, { challengeId = '', importedAt = Date.now() } = {}) {
  const value = parseJsonInput(input, 'Proof');
  try {
    const envelope = parseEnvelope(value);
    const summary = summarizeEnvelope(envelope);
    return {
      id: envelope.envelope_hash,
      source: 'imported',
      format: 'm2i-envelope',
      challengeId: summary.challengeId || challengeId,
      challengeCode: summary.challengeCode,
      importedAt,
      summary,
      envelope
    };
  } catch (error) {
    const legacy = summarizeLegacyProof(value);
    if (!legacy) throw error;
    const canonical = canonicalJson(value);
    const id = sha256Hex(canonical);
    return {
      id,
      source: 'imported',
      format: 'legacy-challenge-proof',
      challengeId: legacy.challengeId || challengeId,
      challengeCode: legacy.challengeCode,
      importedAt,
      summary: legacy,
      proof: value,
      proof_hash: id
    };
  }
}

function parseJsonInput(input, label) {
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  if (!trimmed) throw new Error(label + ' JSON is required.');
  try {
    return JSON.parse(trimmed);
  } catch {
    const extracted = extractJsonFromText(trimmed);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch {}
    }
    throw new Error(label + ' must include valid JSON.');
  }
}

function extractJsonFromText(text) {
  const start = [...text].findIndex((char) => char === '{' || char === '[');
  if (start < 0) return '';
  const stack = [];
  let inString = false;
  let escape = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') stack.push(char);
    if (char === '}' || char === ']') {
      const open = stack.pop();
      if ((char === '}' && open !== '{') || (char === ']' && open !== '[')) return '';
      if (!stack.length) return text.slice(start, index + 1);
    }
  }
  return '';
}

function summarizeEnvelope(envelope) {
  if (envelope.type === ENVELOPE_TYPES.challenge) {
    const challenge = envelope.payload.challenge || {};
    return {
      kind: 'challenge',
      label: `Challenge rules: ${challenge.code || 'unknown challenge'}`,
      challengeId: challenge.id || '',
      challengeCode: challenge.code || '',
      hash: envelope.envelope_hash
    };
  }
  if (envelope.type === ENVELOPE_TYPES.join) {
    const participant = envelope.payload.participant || {};
    const challenge = envelope.payload.challenge || {};
    return {
      kind: 'join',
      label: `${participant.displayName || participant.npub || 'Participant'} joined ${challenge.code || 'challenge'}`,
      challengeId: challenge.id || '',
      challengeCode: challenge.code || '',
      hash: envelope.envelope_hash
    };
  }
  if (envelope.type === ENVELOPE_TYPES.outcome) {
    const settlement = envelope.payload.settlement || {};
    const challenge = settlement.challenge || {};
    return {
      kind: 'outcome',
      label: `Challenge outcome: ${challenge.code || 'challenge'} ${settlement.challenge_result || 'unknown'}`,
      challengeId: challenge.id || '',
      challengeCode: challenge.code || '',
      result: settlement.challenge_result || 'unknown',
      paymentDue: settlement.payment_due,
      hash: envelope.envelope_hash
    };
  }
  if (envelope.type === ENVELOPE_TYPES.paymentRequest) {
    const settlement = envelope.payload.settlement || {};
    const challenge = settlement.challenge || {};
    const request = envelope.payload.request || {};
    const amount = request.asset === 'USDt' && request.amount ? `${request.amount.toFixed ? request.amount.toFixed(2) : request.amount} USDt` : (request.amount_sats ? `${request.amount_sats} sats` : 'manual payment');
    return {
      kind: 'payment-request',
      label: `Payment request: ${challenge.code || 'challenge'} ${amount}`,
      challengeId: challenge.id || '',
      challengeCode: challenge.code || '',
      result: settlement.challenge_result || 'unknown',
      paymentDue: settlement.payment_due,
      hash: envelope.envelope_hash
    };
  }
  if (envelope.type === ENVELOPE_TYPES.receipt) {
    const settlement = envelope.payload.settlement || {};
    const challenge = settlement.challenge || {};
    const markedBy = envelope.payload.marked_by || {};
    return {
      kind: 'receipt',
      label: `Receipt: ${challenge.code || 'challenge'} marked by ${markedBy.displayName || markedBy.npub || 'participant'}`,
      challengeId: challenge.id || '',
      challengeCode: challenge.code || '',
      result: settlement.challenge_result || 'unknown',
      paymentRequestHash: envelope.payload.payment_request_hash || '',
      hash: envelope.envelope_hash
    };
  }
  const entry = envelope.payload.historyEntry || {};
  const claim = entry.claim || {};
  const challenge = envelope.payload.challenge || {};
  const claimant = claim.claimant_display_name || shortHash(claim.claimant_npub || '');
  return {
    kind: 'claim',
    label: `Workout proof: ${claimant ? `${claimant} · ` : ''}${entry.durationHuman || claim.duration_human || 'signed claim'}`,
    challengeId: entry.challengeId || claim.challenge_id || challenge.id || '',
    challengeCode: entry.challengeCode || claim.challenge_code || challenge.code || '',
    hash: envelope.envelope_hash
  };
}

function summarizeLegacyProof(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.settlement_model === 'manual-group-settlement') {
    const challenge = value.challenge || {};
    const signedClaims = Array.isArray(value.signed_claims) ? value.signed_claims : [];
    return {
      kind: 'challenge-proof',
      label: 'Challenge proof: ' + (challenge.code || 'unknown challenge'),
      challengeId: challenge.id || '',
      challengeCode: challenge.code || '',
      localClaims: signedClaims.length,
      result: value.challenge_result || 'unknown'
    };
  }
  if (value.settlement_model === 'manual-private-settlement' && value.signed_event?.content) {
    try {
      const claim = parseJsonInput(value.signed_event.content, 'Signed claim');
      const claimant = claim.claimant_display_name || shortHash(claim.claimant_npub || '');
      return {
        kind: 'claim',
        label: 'Workout proof: ' + (claimant ? claimant + ' · ' : '') + (claim.duration_human || 'signed claim'),
        challengeId: claim.challenge_id || '',
        challengeCode: claim.challenge_code || '',
        localClaims: 1,
        result: 'claim'
      };
    } catch {
      return null;
    }
  }
  return null;
}

