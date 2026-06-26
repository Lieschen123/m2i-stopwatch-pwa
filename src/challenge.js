import { normalizePaymentRequests } from './payment.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  return {
    id,
    code: cleanCode,
    durationDays: days,
    requiredActiveDays: Math.min(requiredDays, days),
    minMinutesPerActiveDay: minMinutes,
    minDistanceKm: minKm,
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
  if (workoutEntry.claim.duration_seconds < challenge.minMinutesPerActiveDay * 60) return false;
  if (challenge.minDistanceKm && (workoutEntry.claim.distance_km || 0) < challenge.minDistanceKm) return false;
  return true;
}

function localDayKey(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-CA');
}

export function computeChallengeProgress(challenge, history = [], now = Date.now()) {
  const linked = history.filter((entry) => entry.challengeId === challenge.id || entry.claim?.challenge_id === challenge.id);
  const valid = linked.filter((entry) => workoutMeetsChallenge(entry, challenge));
  const validDays = new Set(valid.map((entry) => localDayKey(entry.claim.stopped_at || entry.stoppedAt || now)));
  const validActiveDays = validDays.size;
  const remainingActiveDays = Math.max(0, challenge.requiredActiveDays - validActiveDays);
  return {
    challengeId: challenge.id,
    totalWorkouts: linked.length,
    validWorkouts: valid.length,
    validActiveDays,
    requiredActiveDays: challenge.requiredActiveDays,
    remainingActiveDays,
    isComplete: validActiveDays >= challenge.requiredActiveDays,
    isExpired: now >= challenge.endsAt,
    daysRemaining: Math.max(0, Math.ceil((challenge.endsAt - now) / DAY_MS))
  };
}

export function getChallengeSettlementStatus(progress) {
  if (!progress.isExpired) {
    return {
      challenge_result: 'open',
      payment_due: null,
      payment_reason: progress.isComplete ? 'Complete so far — final review after close' : 'Open — final review after close'
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
    payment_reason: 'Missed — stake due'
  };
}

export function createChallengeSettlement({ challenge, history = [], progress }) {
  const normalizedChallenge = normalizeChallengePaymentRequests(challenge);
  const entries = history.filter((entry) => entry.challengeId === challenge.id || entry.claim?.challenge_id === challenge.id);
  const currentProgress = progress || computeChallengeProgress(normalizedChallenge, history);
  const settlementStatus = getChallengeSettlementStatus(currentProgress);
  return {
    settlement_model: 'manual-group-settlement',
    challenge: normalizedChallenge,
    progress: currentProgress,
    ...settlementStatus,
    signed_claims: entries.map((entry) => normalizePrivateSettlementPaymentRequests(entry.privateSettlement || { signed_event: entry.event }, normalizedChallenge)),
    paymentRequests: normalizedChallenge.paymentRequests || [],
    payment_policy: 'Stake if missed is manual and only due if final review says the challenge was missed. If the challenge is complete, no payment is due. M2I never holds funds, pays automatically, or monitors settlement.'
  };
}

export function normalizeChallengePaymentRequests(challenge) {
  if (!challenge) return challenge;
  return {
    ...challenge,
    paymentRequests: normalizePaymentRequests(challenge.paymentRequests || [], {
      challengeCode: challenge.code,
      challengeId: challenge.id,
      createdAt: challenge.createdAt
    })
  };
}

function normalizePrivateSettlementPaymentRequests(settlement, challenge) {
  if (!settlement?.paymentRequests?.length) return settlement;
  return {
    ...settlement,
    paymentRequests: normalizePaymentRequests(settlement.paymentRequests, {
      challengeCode: challenge.code,
      challengeId: challenge.id,
      createdAt: challenge.createdAt
    })
  };
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
  const lines = [
    `Move2Improve challenge: ${challenge.code}`,
    inviteUrl ? `Open / join: ${inviteUrl}` : '',
    `${challenge.durationDays} days, ${challenge.requiredActiveDays} active days required`,
    `Minimum per active day: ${challenge.minMinutesPerActiveDay} ${minuteLabel}${challenge.minDistanceKm ? ` + ${challenge.minDistanceKm} km` : ''}`,
    `Group members listed locally: ${challenge.participants.length || 'open group'}`,
    summarizePaymentRequests(challenge.paymentRequests),
    'Share this invite in your existing group chat. M2I does not host chat or participant messages.',
    'Opening the link imports the challenge rules locally on that device.',
    'Stake is only due if the challenge is missed after final review. If complete, no payment is due.',
    'M2I never holds funds, pays automatically, or monitors settlement.'
  ].filter(Boolean);
  return lines.join('\n');
}
