import { normalizePaymentRequests } from './payment.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const CHALLENGE_MIN_MOVEMENT_METERS = 10;
export const CHALLENGE_MOVEMENT_METERS_PER_MINUTE = 5;

export const ACTIVITY_MOVEMENT = 'movement';
export const ACTIVITY_BURPEES = 'burpees';
export const SCORING_DURATION = 'duration';
export const SCORING_REPS_FOR_TIME = 'reps_for_time';
export const PROOF_SELF_ATTESTED = 'self_attested';
export const BURPEE_DEFAULT_DURATION_SECONDS = 150;

export function isBurpeeChallenge(challenge) {
  return challenge?.activityType === ACTIVITY_BURPEES;
}

export function isBurpeeClaim(claim) {
  return claim?.activity_type === ACTIVITY_BURPEES;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slug(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function parseParticipants(input) {
  return String(input || '')
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [displayName, npub = ''] = part.split('|').map((item) => item.trim());
      return {
        id: `participant-${index + 1}`,
        displayName,
        npub
      };
    });
}

export function createChallengePlan({
  code,
  startDate,
  durationDays,
  requiredActiveDays,
  minMinutesPerActiveDay,
  minDistanceKm,
  participantsText,
  paymentRequests = [],
  activityType,
  scoringModel,
  durationSeconds,
  minReps,
  createdAt = Date.now()
}) {
  const cleanCode = slug(code) || `M2I-${createdAt}`;
  const id = `challenge-${cleanCode.toLowerCase()}-${createdAt}`;
  const days = Math.max(1, Math.round(safeNumber(durationDays, 30)));
  const requiredDays = Math.max(1, Math.round(safeNumber(requiredActiveDays, 10)));
  const minMinutes = Math.max(1, Math.round(safeNumber(minMinutesPerActiveDay, 45)));
  const minKm = safeNumber(minDistanceKm, 0) > 0 ? Number(safeNumber(minDistanceKm).toFixed(3)) : null;
  const participants = parseParticipants(participantsText);
  const startsAt = parseStartDate(startDate, createdAt);
  const normalizedPaymentRequests = normalizePaymentRequests(paymentRequests, {
    challengeCode: cleanCode,
    challengeId: id,
    createdAt
  });
  const activity = activityType === ACTIVITY_BURPEES ? ACTIVITY_BURPEES : ACTIVITY_MOVEMENT;
  const scoring = activity === ACTIVITY_BURPEES
    ? SCORING_REPS_FOR_TIME
    : (scoringModel === SCORING_REPS_FOR_TIME ? SCORING_REPS_FOR_TIME : SCORING_DURATION);
  const burpeeDuration = activity === ACTIVITY_BURPEES
    ? Math.max(1, Math.round(safeNumber(durationSeconds, BURPEE_DEFAULT_DURATION_SECONDS)))
    : null;
  const burpeeMinReps = activity === ACTIVITY_BURPEES && safeNumber(minReps, 0) > 0
    ? Math.round(safeNumber(minReps))
    : null;
  return {
    id,
    code: cleanCode,
    durationDays: days,
    requiredActiveDays: Math.min(requiredDays, days),
    minMinutesPerActiveDay: minMinutes,
    minDistanceKm: minKm,
    activityType: activity,
    scoringModel: scoring,
    durationSeconds: burpeeDuration,
    minReps: burpeeMinReps,
    createdAt,
    startsAt,
    endsAt: startsAt + days * DAY_MS,
    participants,
    paymentRequests: normalizedPaymentRequests
  };
}

function parseStartDate(value, fallback) {
  if (!value) return startOfLocalDay(fallback);
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : startOfLocalDay(fallback);
}

function startOfLocalDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatDateInput(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function workoutMeetsChallenge(workoutEntry, challenge) {
  if (!workoutEntry?.claim || !challenge) return false;
  if (workoutEntry.challengeId !== challenge.id && workoutEntry.claim.challenge_id !== challenge.id) return false;
  const stoppedAt = workoutEntry.claim.stopped_at || workoutEntry.stoppedAt || 0;
  if (stoppedAt < challenge.startsAt || stoppedAt >= challenge.endsAt) return false;
  if (isBurpeeChallenge(challenge)) return burpeeClaimMeetsChallenge(workoutEntry.claim, challenge);
  if (workoutEntry.claim.duration_seconds < challenge.minMinutesPerActiveDay * 60) return false;
  if (challenge.minDistanceKm && (workoutEntry.claim.distance_km || 0) < challenge.minDistanceKm) return false;
  if (!challenge.minDistanceKm && !claimHasPlausibleMovement(workoutEntry.claim, challenge)) return false;
  return true;
}

function burpeeClaimMeetsChallenge(claim, challenge) {
  if (claim.activity_type !== ACTIVITY_BURPEES) return false;
  if (claim.scoring_model !== SCORING_REPS_FOR_TIME) return false;
  if (claim.proof_type !== PROOF_SELF_ATTESTED) return false;
  const requiredDuration = safeNumber(challenge.durationSeconds, BURPEE_DEFAULT_DURATION_SECONDS);
  if (safeNumber(claim.duration_seconds, 0) < requiredDuration) return false;
  const reps = safeNumber(claim.rep_count, 0);
  if (reps <= 0) return false;
  if (challenge.minReps && reps < challenge.minReps) return false;
  return true;
}

export function requiredChallengeMovementMeters(challenge) {
  return Math.max(
    CHALLENGE_MIN_MOVEMENT_METERS,
    Math.round(safeNumber(challenge?.minMinutesPerActiveDay, 0) * CHALLENGE_MOVEMENT_METERS_PER_MINUTE)
  );
}

function claimHasPlausibleMovement(claim, challenge) {
  if (!claim || safeNumber(claim.gps_sample_count, 0) <= 0) return false;
  const distanceMeters = claimDistanceMeters(claim);
  return distanceMeters >= requiredChallengeMovementMeters(challenge);
}

function claimDistanceMeters(claim) {
  const meters = safeNumber(claim.distance_meters, NaN);
  if (Number.isFinite(meters)) return meters;
  const km = safeNumber(claim.distance_km, NaN);
  return Number.isFinite(km) ? km * 1000 : 0;
}

function localDayKey(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-CA');
}

export function importedProofClaimEntries(importedProofs = []) {
  const proofs = Array.isArray(importedProofs) ? importedProofs : [];
  return proofs.map(importedProofToClaimEntry).filter(Boolean);
}

function importedProofToClaimEntry(proof) {
  const privateSettlement = proof?.proof?.settlement_model === 'manual-private-settlement' ? proof.proof : null;
  const event = privateSettlement?.signed_event || proof?.envelope?.payload?.historyEntry?.event || proof?.envelope?.payload?.event;
  const claim = parseSignedClaim(event?.content) || proof?.envelope?.payload?.historyEntry?.claim || proof?.envelope?.payload?.claim;
  if (!claim?.challenge_id) return null;
  return {
    id: proof.id || event?.id || claim.claim_hash || claim.stopped_at || claim.started_at,
    source: 'imported-proof',
    challengeId: claim.challenge_id,
    challengeCode: claim.challenge_code || '',
    stoppedAt: claim.stopped_at || 0,
    claim,
    event,
    privateSettlement: privateSettlement || (event ? { signed_event: event } : null)
  };
}

function parseSignedClaim(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;
  try {
    return JSON.parse(String(content));
  } catch {
    return null;
  }
}

function uniqueEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry?.event?.id || entry?.privateSettlement?.signed_event?.id || entry?.claim?.claim_hash || entry?.id;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function rankBurpeeClaims(entries = []) {
  return entries
    .filter((entry) => entry?.claim && isBurpeeClaim(entry.claim))
    .slice()
    .sort((a, b) => {
      const repsDiff = safeNumber(b.claim.rep_count, 0) - safeNumber(a.claim.rep_count, 0);
      if (repsDiff !== 0) return repsDiff;
      const durDiff = safeNumber(a.claim.duration_seconds, 0) - safeNumber(b.claim.duration_seconds, 0);
      if (durDiff !== 0) return durDiff;
      return safeNumber(a.claim.stopped_at, 0) - safeNumber(b.claim.stopped_at, 0);
    });
}

export function computeChallengeProgress(challenge, history = [], now = Date.now()) {
  const linked = uniqueEntries(history).filter((entry) => entry.challengeId === challenge.id || entry.claim?.challenge_id === challenge.id);
  const valid = linked.filter((entry) => workoutMeetsChallenge(entry, challenge));
  const validDays = new Set(valid.map((entry) => localDayKey(entry.claim.stopped_at || entry.stoppedAt || now)));
  const participantProgress = computeParticipantProgress(challenge, valid, now);
  const hasRoster = Array.isArray(challenge.participants) && challenge.participants.length > 0;
  const rosterComplete = hasRoster && participantProgress.every((participant) => participant.isComplete);
  const validActiveDays = hasRoster
    ? Math.min(...participantProgress.map((participant) => participant.validActiveDays))
    : validDays.size;
  const remainingActiveDays = hasRoster
    ? participantProgress.reduce((total, participant) => total + participant.remainingActiveDays, 0)
    : Math.max(0, challenge.requiredActiveDays - validActiveDays);
  return {
    challengeId: challenge.id,
    totalWorkouts: linked.length,
    validWorkouts: valid.length,
    validActiveDays,
    requiredActiveDays: challenge.requiredActiveDays,
    remainingActiveDays,
    isComplete: hasRoster ? rosterComplete : validActiveDays >= challenge.requiredActiveDays,
    isExpired: now >= challenge.endsAt,
    daysRemaining: Math.max(0, Math.ceil((challenge.endsAt - now) / DAY_MS)),
    participantProgress
  };
}

function computeParticipantProgress(challenge, validEntries, now) {
  const participants = Array.isArray(challenge.participants) ? challenge.participants : [];
  return participants.map((participant) => {
    const entries = validEntries.filter((entry) => claimMatchesParticipant(entry.claim, participant));
    const days = new Set(entries.map((entry) => localDayKey(entry.claim.stopped_at || entry.stoppedAt || now)));
    const validActiveDays = days.size;
    return {
      id: participant.id || '',
      displayName: participant.displayName || '',
      npub: participant.npub || '',
      validActiveDays,
      validWorkouts: entries.length,
      requiredActiveDays: challenge.requiredActiveDays,
      remainingActiveDays: Math.max(0, challenge.requiredActiveDays - validActiveDays),
      isComplete: validActiveDays >= challenge.requiredActiveDays
    };
  });
}

function claimMatchesParticipant(claim, participant) {
  if (!claim || !participant) return false;
  const participantNpub = String(participant.npub || '').trim();
  const claimNpub = String(claim.claimant_npub || '').trim();
  if (participantNpub && claimNpub && participantNpub === claimNpub) return true;
  return normalizeName(claim.claimant_display_name) === normalizeName(participant.displayName);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

export function getChallengeSettlementStatus(progress) {
  if (!progress.isExpired) {
    return {
      challenge_result: 'open',
      payment_due: null,
      payment_reason: progress.isComplete ? 'Complete so far — final review after close' : incompletePaymentReason(progress, 'Open — final review after close')
    };
  }
  if (progress.isComplete) {
    return {
      challenge_result: 'complete',
      payment_due: false,
      payment_reason: 'Complete — no payment due'
    };
  }
  return {
    challenge_result: 'missed',
    payment_due: true,
    payment_reason: incompletePaymentReason(progress, 'Missed — stake due')
  };
}

function incompletePaymentReason(progress, fallback) {
  const missing = (progress.participantProgress || []).filter((participant) => !participant.isComplete);
  if (!missing.length) return fallback;
  const names = missing.map((participant) => participant.displayName || participant.npub || participant.id || 'participant').join(', ');
  return fallback + ': ' + names + ' incomplete';
}

export function createChallengeSettlement({ challenge, history = [], importedProofs = [], progress }) {
  const importedEntries = importedProofClaimEntries(importedProofs);
  const allEntries = uniqueEntries([...history, ...importedEntries]);
  const entries = allEntries.filter((entry) => entry.challengeId === challenge.id || entry.claim?.challenge_id === challenge.id);
  const referenceSuffixes = collectLinkedPaymentReferenceSuffixes(entries);
  const normalizedChallenge = normalizeChallengePaymentRequests(challenge, referenceSuffixes);
  const currentProgress = progress || computeChallengeProgress(normalizedChallenge, entries);
  const settlementStatus = getChallengeSettlementStatus(currentProgress);
  return {
    settlement_model: 'manual-group-settlement',
    challenge: normalizedChallenge,
    progress: currentProgress,
    ...settlementStatus,
    signed_claims: entries.map((entry) => normalizePrivateSettlementPaymentRequests(entry.privateSettlement || { signed_event: entry.event }, normalizedChallenge, referenceSuffixes)),
    paymentRequests: normalizedChallenge.paymentRequests || [],
    payment_policy: 'Stake if missed is manual and only due if final review says the challenge was missed. If the challenge is complete, no payment is due. M2I never holds funds, pays automatically, or monitors settlement.'
  };
}

export function normalizeChallengePaymentRequests(challenge, referenceSuffixes = new Map()) {
  if (!challenge) return challenge;
  return {
    ...challenge,
    paymentRequests: normalizeChallengeScopedPaymentRequests(challenge.paymentRequests || [], challenge, referenceSuffixes)
  };
}

function normalizeChallengeScopedPaymentRequests(paymentRequests, challenge, referenceSuffixes) {
  return paymentRequests.map((request) => {
    const referenceSuffix = referenceSuffixes.get(paymentRequestMatchKey(request));
    return normalizePaymentRequests([request], {
      challengeCode: challenge.code,
      challengeId: challenge.id,
      createdAt: challenge.createdAt,
      referenceSuffix
    })[0];
  }).filter(Boolean);
}

function normalizePrivateSettlementPaymentRequests(settlement, challenge, referenceSuffixes) {
  if (!settlement?.paymentRequests?.length) return settlement;
  return {
    ...settlement,
    paymentRequests: normalizeChallengeScopedPaymentRequests(settlement.paymentRequests, challenge, referenceSuffixes)
  };
}

function collectLinkedPaymentReferenceSuffixes(entries) {
  const suffixes = new Map();
  for (const entry of entries) {
    const requests = linkedPaymentRequests(entry);
    for (const request of requests) {
      const suffix = paymentReferenceSuffix(request?.reference);
      const key = paymentRequestMatchKey(request);
      if (suffix && !suffixes.has(key)) suffixes.set(key, suffix);
    }
  }
  return suffixes;
}

function linkedPaymentRequests(entry) {
  if (Array.isArray(entry?.privateSettlement?.paymentRequests)) return entry.privateSettlement.paymentRequests;
  if (Array.isArray(entry?.paymentRequests)) return entry.paymentRequests;
  if (entry?.paymentRequest) return [entry.paymentRequest];
  return [];
}

function paymentReferenceSuffix(reference) {
  const parts = String(reference || '').split(':');
  const suffix = parts.slice(1).join(':').trim();
  return parts.length > 1 && suffix ? suffix : '';
}

function paymentRequestMatchKey(request) {
  if (!request) return '';
  return [
    request.asset || '',
    request.network || '',
    request.recipient || '',
    request.amount ?? '',
    request.amount_sats ?? ''
  ].map((part) => String(part).trim().toLowerCase()).join('|');
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeChallengeInvite(challenge) {
  return base64UrlEncode(JSON.stringify({
    version: 1,
    challenge
  }));
}

export function decodeChallengeInvite(token) {
  const payload = JSON.parse(base64UrlDecode(token));
  if (payload?.version !== 1 || !payload.challenge?.id || !payload.challenge?.code) throw new Error('Invalid challenge invite.');
  return payload.challenge;
}

export function createChallengeInviteUrl(challenge, appUrl) {
  if (!appUrl) return '';
  const url = new URL(appUrl);
  url.hash = `challenge=${encodeChallengeInvite(challenge)}`;
  return url.toString();
}

function summarizePaymentRequests(paymentRequests = []) {
  if (!paymentRequests.length) return 'No stake configured.';
  const summaries = paymentRequests.map((request) => {
    if (request.asset === 'USDt') return `${request.amount.toFixed(2)} USDt on ${request.network.toUpperCase()}`;
    if (request.asset === 'sats') return `${request.amount_sats || 'Sats'} sats / ${request.network}`;
    return `${request.asset || 'Manual'} stake`;
  });
  return `Stake if missed: ${summaries.join(' + ')}.`;
}

export function createInviteText(challenge, appUrl = '') {
  const inviteUrl = createChallengeInviteUrl(challenge, appUrl);
  const minuteLabel = challenge.minMinutesPerActiveDay === 1 ? 'minute' : 'minutes';
  const movementLabel = challenge.minDistanceKm
    ? ` + ${challenge.minDistanceKm} km GPS aggregate distance`
    : ` + at least ${requiredChallengeMovementMeters(challenge)} m GPS aggregate movement`;
  const lines = [
    `Move2Improve challenge: ${challenge.code}`,
    inviteUrl ? `Open / join: ${inviteUrl}` : '',
    `${challenge.durationDays} days, ${challenge.requiredActiveDays} active days required`,
    `Minimum per active day: ${challenge.minMinutesPerActiveDay} ${minuteLabel}${movementLabel}`,
    `Group members listed locally: ${challenge.participants.length || 'open group'}`,
    summarizePaymentRequests(challenge.paymentRequests),
    'Share this invite in your existing group chat. M2I does not host chat or participant messages.',
    'Opening the link imports the challenge rules locally on that device.',
    'Stake is only due if the challenge is missed after final review. If complete, no payment is due.',
    'M2I never holds funds, pays automatically, or monitors settlement.'
  ].filter(Boolean);
  return lines.join('\n');
}
