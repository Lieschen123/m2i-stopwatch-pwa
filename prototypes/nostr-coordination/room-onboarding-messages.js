import { assertBotSafeRoomStatus } from './private-room-projection.js';

function challengeTitle(status) {
  return status.challenge?.code || 'M2I challenge';
}

function activityLine(status) {
  const activity = status.challenge?.activityType || 'movement';
  const duration = status.challenge?.durationSeconds ? `${status.challenge.durationSeconds}s` : '';
  const required = status.challenge?.requiredActiveDays ? `${status.challenge.requiredActiveDays} valid days` : 'the agreed number of days';
  return [activity, duration, required].filter(Boolean).join(' · ');
}

function participantNames(status) {
  const names = (status.participants || []).map((participant) => participant.alias).filter(Boolean);
  if (!names.length) return 'Participants will appear here once they join.';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function formatWelcomeMessage(status) {
  assertBotSafeRoomStatus(status);
  return `${challengeTitle(status)}\n${activityLine(status)}\n\nWelcome to the room. This is the shared game space for ${participantNames(status)}.\n\nBuilt for repeated games.\n\nWhen you know you'll meet again tomorrow, cooperation becomes the dominant strategy. Not kindness. Not idealism. Pure math.\n\n“We are all one” is not a spiritual wish. It is what repeated games do to isolated incentives.\n\nMove2Improve turns rivalry into contribution.\n\nThe important part: your real proof stays private. Your device or room client keeps the full signed M2I receipts. The bot only sees the redacted status summary, enough to remind and motivate, not enough to inspect your private data.\n\nPlay honestly. Keep it light. Show up again tomorrow.`;
}

export function formatWhatToDoMessage(status) {
  assertBotSafeRoomStatus(status);
  const duration = status.challenge?.durationSeconds ? `${status.challenge.durationSeconds} seconds` : 'the agreed round time';
  const activity = status.challenge?.activityType || 'movement';
  return `${challengeTitle(status)} — what to do\n\n1. Open your M2I challenge on your phone.\n2. Start the ${activity} round.\n3. Move for ${duration}.\n4. Stop when time is called.\n5. Enter your result honestly.\n6. Share/import the update through the private room flow.\n\nOnly the room/local clients need the full proof. The bot-safe status is just the scoreboard.`;
}

export function formatRepeatedGamesMessage(status) {
  assertBotSafeRoomStatus(status);
  return `${challengeTitle(status)} — repeated game rules\n\nThis works because you are not playing one anonymous round. You are building a repeated game with people who can see the pattern over time.\n\nNorms:\n- one valid day counts per calendar day\n- extra attempts are allowed, but they do not create extra days\n- no surveillance, no camera proof, no body-data upload\n- self-attestation is accepted, reputation carries the weight\n- if something breaks, say it early and keep the loop alive\n\nThe goal is not to catch people. The goal is to make it easy to show up together.`;
}
