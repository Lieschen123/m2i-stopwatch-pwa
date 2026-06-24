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
  const days = Math.max(1, Math.round(safeNumber(durationDays, 30)));
  const requiredDays = Math.max(1, Math.round(safeNumber(requiredActiveDays, 10)));
  const minMinutes = Math.max(1, Math.round(safeNumber(minMinutesPerActiveDay, 45)));
  const minKm = safeNumber(minDistanceKm, 0) > 0 ? Number(safeNumber(minDistanceKm).toFixed(3)) : null;
  const participants = parseParticipants(participantsText);
  const startsAt = parseStartDate(startDate, createdAt);
  return {
    id: `challenge-${cleanCode.toLowerCase()}-${createdAt}`,
    code: cleanCode,
    durationDays: days,
    requiredActiveDays: Math.min(requiredDays, days),
    minMinutesPerActiveDay: minMinutes,
    minDistanceKm: minKm,
    createdAt,
    startsAt,
    endsAt: startsAt + days * DAY_MS,
    participants,
    paymentRequests
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
    isExpired: now > challenge.endsAt,
    daysRemaining: Math.max(0, Math.ceil((challenge.endsAt - now) / DAY_MS))
  };
}

export function createChallengeSettlement({ challenge, history = [], progress }) {
  const entries = history.filter((entry) => entry.challengeId === challenge.id || entry.claim?.challenge_id === challenge.id);
  return {
    settlement_model: 'manual-group-settlement',
    challenge,
    progress: progress || computeChallengeProgress(challenge, history),
    signed_claims: entries.map((entry) => entry.privateSettlement || { signed_event: entry.event }),
    paymentRequests: challenge.paymentRequests || [],
    payment_policy: 'Manual request only. M2I does not connect to wallets, initiate payments, custody funds, or poll settlement.'
  };
}

export function createInviteText(challenge) {
  const lines = [
    `Move2Improve challenge: ${challenge.code}`,
    `${challenge.durationDays} days, ${challenge.requiredActiveDays} active days required`,
    `Minimum per active day: ${challenge.minMinutesPerActiveDay} minutes${challenge.minDistanceKm ? ` + ${challenge.minDistanceKm} km` : ''}`,
    `Group members listed locally: ${challenge.participants.length || 'open group'}`,
    'Share this invite in your existing group chat. M2I does not host chat or participant messages.',
    'Payment, if any, is manual. M2I never holds funds or pays automatically.'
  ];
  return lines.join('\n');
}
