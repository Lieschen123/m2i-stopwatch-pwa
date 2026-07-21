import { CLIENT_NAME, SPEC_VERSION } from './constants.js';
import { canonicalJson, sha256Hex } from './crypto.js';
import { formatDuration } from './format.js';

export function createClaim({ challengeId, challengeCode, startedAt, stoppedAt, claimantNpub, claimantDisplayName, counterpartNpub, note, gpsSummary, activity }) {
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
  if (challengeId) claim.challenge_id = challengeId;
  if (claimantDisplayName) claim.claimant_display_name = claimantDisplayName;
  if (counterpartNpub) claim.counterpart_npub = counterpartNpub;
  if (note) claim.note = note;
  if (activity?.activityType === 'burpees') {
    claim.activity_type = 'burpees';
    claim.scoring_model = 'reps_for_time';
    claim.proof_type = 'self_attested';
    claim.rep_count = Math.max(0, Math.round(Number(activity.repCount) || 0));
  }
  if (gpsSummary?.gps_used) {
    claim.gps_used = true;
    claim.gps_points_discarded = gpsSummary.gps_points_discarded === true;
    claim.gps_accuracy_summary = gpsSummary.gps_accuracy_summary;
    claim.gps_sample_count = gpsSummary.gps_sample_count;
    claim.gps_rejected_sample_count = gpsSummary.gps_rejected_sample_count;
    claim.gps_no_accepted_samples = gpsSummary.gps_no_accepted_samples === true || gpsSummary.gps_sample_count === 0;
    if (gpsSummary.gps_secure_context !== undefined) claim.gps_secure_context = gpsSummary.gps_secure_context === true;
    if (gpsSummary.gps_geolocation_available !== undefined) claim.gps_geolocation_available = gpsSummary.gps_geolocation_available === true;
    if (gpsSummary.gps_sample_count > 0) {
      claim.distance_meters = gpsSummary.distance_meters;
      claim.distance_km = gpsSummary.distance_km;
      claim.local_verification = 'movement-aggregate-v1';
      claim.verification_method = gpsSummary.verification_method;
    }
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
  if (claim.activity_type === 'burpees') {
    publicClaim.activity_type = 'burpees';
    publicClaim.scoring_model = claim.scoring_model || 'reps_for_time';
    publicClaim.proof_type = claim.proof_type || 'self_attested';
    if (typeof claim.rep_count === 'number') publicClaim.rep_count = claim.rep_count;
    publicClaim.public_note = 'Signed self-attestation. The receipt proves who claimed what and when. It does not prove the movement objectively happened.';
  }
  if (claim.gps_used) {
    publicClaim.gps_used = true;
  }
  if (claim.distance_meters !== undefined) {
    publicClaim.distance_meters = claim.distance_meters;
    publicClaim.distance_km = claim.distance_km;
    publicClaim.gps_summary = 'movement aggregate included';
    publicClaim.local_verification = claim.local_verification;
    publicClaim.verification_method = claim.verification_method;
  }
  const serialized = canonicalJson(publicClaim);
  return {
    ...publicClaim,
    canonical_json: serialized,
    claim_hash: sha256Hex(serialized)
  };
}

export function createHistoryEntry({ claim, event, paymentRequest = null, paymentRequests = [], published = [] }) {
  const requests = paymentRequests.length ? paymentRequests : (paymentRequest ? [paymentRequest] : []);
  const privateSettlement = {
    settlement_model: 'manual-private-settlement',
    signed_event: event
  };
  if (requests.length) privateSettlement.paymentRequests = requests;
  const entry = {
    id: event.id,
    challengeId: claim.challenge_id || '',
    challengeCode: claim.challenge_code,
    durationHuman: claim.duration_human,
    durationSeconds: claim.duration_seconds,
    stoppedAt: claim.stopped_at,
    claim,
    event,
    privateSettlement,
    published
  };
  if (claim.activity_type === 'burpees') {
    entry.activityType = 'burpees';
    if (typeof claim.rep_count === 'number') entry.repCount = claim.rep_count;
  }
  if (requests.length) {
    entry.paymentRequests = requests;
    entry.paymentRequest = requests[0];
  }
  return entry;
}
