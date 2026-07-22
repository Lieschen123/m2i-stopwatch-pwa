import { canonicalJson, sha256Hex } from '../../src/crypto.js';

export const ROOM_STATUS_VERSION = 1;
export const ROOM_STATUS_TYPE = 'm2i.room_status.v1';

function displayName(value = {}) {
  return value.displayName || value.name || value.npub || 'Participant';
}

function participantAlias(name, index) {
  const clean = String(name || '').trim();
  return clean || `Participant ${index + 1}`;
}

function validDaysForParticipant(claimsByDay = {}) {
  return Object.entries(claimsByDay)
    .filter(([, claims]) => claims.some((claim) => claim.valid !== false))
    .map(([day]) => day)
    .sort();
}

function latestClaimTimeHint(claimsByDay = {}) {
  const days = Object.keys(claimsByDay).sort();
  return days.at(-1) || null;
}

export function createRoomStatusProjection(state, { createdAt = Date.now(), privacy = 'bot-safe-redacted' } = {}) {
  const challenge = state.challenge || {};
  const participantEntries = Object.values(state.participants || {});
  const requiredActiveDays = Number(challenge.requiredActiveDays || 0);
  const participants = participantEntries.map((participant, index) => {
    const alias = participantAlias(displayName(participant), index);
    const validDays = validDaysForParticipant(state.claims?.[alias] || {});
    return {
      alias,
      validDayCount: validDays.length,
      requiredActiveDays,
      latestValidDay: latestClaimTimeHint(state.claims?.[alias] || {}),
      complete: requiredActiveDays > 0 ? validDays.length >= requiredActiveDays : false
    };
  });

  const completeCount = participants.filter((participant) => participant.complete).length;
  const projection = {
    version: ROOM_STATUS_VERSION,
    type: ROOM_STATUS_TYPE,
    privacy,
    created_at: createdAt,
    challenge: {
      id: challenge.id || '',
      code: challenge.code || '',
      activityType: challenge.activityType || '',
      requiredActiveDays,
      durationSeconds: challenge.durationSeconds || null,
      startsAt: challenge.startsAt || null,
      endsAt: challenge.endsAt || null
    },
    participants,
    totals: {
      participantCount: participants.length,
      completeCount,
      claimCount: Number(state.claimCount || 0)
    }
  };
  return {
    ...projection,
    status_hash: sha256Hex(canonicalJson(projection))
  };
}

export function assertBotSafeRoomStatus(projection) {
  const forbiddenKeyParts = [
    'canonical_json',
    'envelope_hash',
    'historyentry',
    'payment',
    'settlement',
    'preimage',
    'invoice',
    'route',
    'heart',
    'heartrate',
    'gps',
    'sensor',
    'raw',
    'signature',
    'privatekey',
    'nsec'
  ];
  const forbiddenValuePatterns = [
    /lnbc/i,
    /nsec1/i,
    /-----BEGIN PRIVATE KEY-----/i
  ];
  const leaked = [];
  function scan(value, path = '') {
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        const lowerKey = key.toLowerCase();
        if (forbiddenKeyParts.some((term) => lowerKey === term || lowerKey.includes(`_${term}`) || lowerKey.includes(`${term}_`))) leaked.push(path ? `${path}.${key}` : key);
        scan(item, path ? `${path}.${key}` : key);
      }
      return;
    }
    if (typeof value === 'string' && forbiddenValuePatterns.some((pattern) => pattern.test(value))) leaked.push(path || '<value>');
  }
  scan(projection);
  if (leaked.length) throw new Error(`Room status projection leaked forbidden fields: ${leaked.join(', ')}`);
  return true;
}
