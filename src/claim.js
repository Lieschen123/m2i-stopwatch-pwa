import { CLIENT_NAME, SPEC_VERSION } from './constants.js';
import { canonicalJson, sha256Hex } from './crypto.js';
import { formatDuration } from './format.js';

export function createClaim({ challengeCode, startedAt, stoppedAt, claimantNpub, counterpartNpub, note }) {
  const durationMs = Math.max(0, stoppedAt - startedAt);
  const durationSeconds = Math.floor(durationMs / 1000);
  const claim = {
    challenge_code: challengeCode,
    claimant_npub: claimantNpub,
    client: CLIENT_NAME,
    duration_human: formatDuration(durationMs),
    duration_ms: durationMs,
    duration_seconds: durationSeconds,
    spec_version: SPEC_VERSION,
    started_at: startedAt,
    stopped_at: stoppedAt
  };
  if (counterpartNpub) claim.counterpart_npub = counterpartNpub;
  if (note) claim.note = note;

  const serialized = canonicalJson(claim);
  return {
    ...claim,
    canonical_json: serialized,
    claim_hash: sha256Hex(serialized)
  };
}

export function createHistoryEntry({ claim, event, published = [] }) {
  return {
    id: event.id,
    challengeCode: claim.challenge_code,
    durationHuman: claim.duration_human,
    durationSeconds: claim.duration_seconds,
    stoppedAt: claim.stopped_at,
    claim,
    event,
    published
  };
}
