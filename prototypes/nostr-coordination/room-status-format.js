import { assertBotSafeRoomStatus } from './private-room-projection.js';

function dayLabel(day) {
  return day || 'no valid day yet';
}

function participantIcon(participant) {
  if (participant.complete) return '🏁';
  if (participant.validDayCount > 0) return '✅';
  return '⏳';
}

function participantLine(participant) {
  return `${participantIcon(participant)} ${participant.alias} — ${participant.validDayCount}/${participant.requiredActiveDays} days, latest: ${dayLabel(participant.latestValidDay)}`;
}

export function formatRoomStatusMessage(status) {
  assertBotSafeRoomStatus(status);
  const challenge = status.challenge || {};
  const title = challenge.code || 'M2I challenge';
  const activity = challenge.activityType ? `Activity: ${challenge.activityType}` : '';
  const duration = challenge.durationSeconds ? `Round: ${challenge.durationSeconds}s` : '';
  const lines = [
    title,
    [activity, duration].filter(Boolean).join(' · '),
    '',
    'Day status:',
    ...(status.participants || []).map(participantLine),
    '',
    `${status.totals?.claimCount || 0} claims counted.`,
    completionSentence(status),
    '',
    'Bot-safe summary only. Private proofs stay in the room/local clients.'
  ];
  return lines.filter((line, index) => line || lines[index - 1]).join('\n').trim();
}

function completionSentence(status) {
  const completeCount = Number(status.totals?.completeCount || 0);
  const participantCount = Number(status.totals?.participantCount || 0);
  if (participantCount === 0) return 'No participants yet.';
  if (completeCount === 0) return 'Nobody has completed the challenge yet.';
  if (completeCount === participantCount) return 'Everyone has completed the challenge.';
  return `${completeCount}/${participantCount} participants have completed the challenge.`;
}
