export function createWorkout({
  challengeId,
  challengeCode,
  participant,
  targetMinutes,
  counterpartNpub,
  note,
  gpsEnabled = false,
  usdtStakeAmount,
  usdtNetwork,
  usdtRecipient,
  satsAmount,
  satsRecipient,
  satsPaymentUri,
  satsInstructions,
  activityType,
  targetSeconds: explicitTargetSeconds,
  musicEnabled = false,
  startedAt = Date.now()
}) {
  const targetSeconds = explicitTargetSeconds > 0
    ? Math.round(Number(explicitTargetSeconds))
    : (Number(targetMinutes) > 0 ? Math.round(Number(targetMinutes) * 60) : null);
  return {
    challengeId: challengeId || '',
    challengeCode,
    participant: participant || null,
    targetSeconds,
    activityType: activityType === 'burpees' ? 'burpees' : 'movement',
    musicEnabled: Boolean(musicEnabled),
    counterpartNpub: counterpartNpub || '',
    note: note || '',
    gpsEnabled: Boolean(gpsEnabled),
    usdtStakeAmount: usdtStakeAmount || '',
    usdtNetwork: usdtNetwork || 'ton',
    usdtRecipient: usdtRecipient || '',
    satsAmount: satsAmount || '',
    satsRecipient: satsRecipient || '',
    satsPaymentUri: satsPaymentUri || '',
    satsInstructions: satsInstructions || '',
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
