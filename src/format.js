export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function shortNpub(npub) {
  if (!npub || npub.length < 18) return npub || '';
  return `${npub.slice(0, 10)}...${npub.slice(-8)}`;
}

export function clampText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}
