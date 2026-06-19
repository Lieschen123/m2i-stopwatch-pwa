export function createWorkout({ challengeCode, targetMinutes, counterpartNpub, note, startedAt = Date.now() }) {
  const targetSeconds = Number(targetMinutes) > 0 ? Math.round(Number(targetMinutes) * 60) : null;
  return {
    challengeCode,
    targetSeconds,
    counterpartNpub: counterpartNpub || '',
    note: note || '',
    startedAt
  };
}

export function elapsedMs(workout, now = Date.now()) {
  if (!workout?.startedAt) return 0;
  return Math.max(0, now - workout.startedAt);
}

export function targetDeltaSeconds(workout, now = Date.now()) {
  if (!workout?.targetSeconds) return null;
  return Math.floor(elapsedMs(workout, now) / 1000) - workout.targetSeconds;
}

export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return null;
  try {
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
}
