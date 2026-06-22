import { CLIENT_NAME, SPEC_VERSION } from './constants.js';
import { canonicalJson, sha256Hex } from './crypto.js';
import { formatDuration } from './format.js';

export function createClaim({ challengeCode, startedAt, stoppedAt, claimantNpub, counterpartNpub, note, gpsSummary }) {
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
  if (gpsSummary?.gps_used) {
    claim.distance_meters = gpsSummary.distance_meters;
    claim.distance_km = gpsSummary.distance_km;
    claim.gps_used = true;
    claim.gps_points_discarded = gpsSummary.gps_points_discarded === true;
    claim.gps_accuracy_summary = gpsSummary.gps_accuracy_summary;
    claim.gps_sample_count = gpsSummary.gps_sample_count;
    claim.gps_rejected_sample_count = gpsSummary.gps_rejected_sample_count;
    claim.local_verification = 'movement-aggregate-v1';
    claim.verification_method = gpsSummary.verification_method;
    if (gpsSummary.gps_last_error) claim.gps_last_error = gpsSummary.gps_last_error;
  }

  const serialized = canonicalJson(claim);
  return {
    ...claim,
    canonical_json: serialized,
    claim_hash: sha256Hex(serialized)
  };
}

export function createPublicClaimProjection(claim) {
  const publicClaim = {
    challenge_code: claim.challenge_code,
    client: claim.client,
    duration_human: claim.duration_human,
    duration_seconds: claim.duration_seconds,
    public_note: 'Local movement verification with signed aggregate claim. No route, payment, or counterpart data included.',
    spec_version: claim.spec_version
  };
  if (claim.distance_meters !== undefined) {
    publicClaim.distance_meters = claim.distance_meters;
    publicClaim.distance_km = claim.distance_km;
    publicClaim.verification_method = claim.verification_method;
  }
  const serialized = canonicalJson(publicClaim);
  return {
    ...publicClaim,
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
