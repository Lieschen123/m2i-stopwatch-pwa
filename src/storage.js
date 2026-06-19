import { DEFAULT_RELAYS, STORAGE_KEYS } from './constants.js';

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

export function createStorage(storage = globalThis.localStorage) {
  return {
    getSecret() {
      return storage.getItem(STORAGE_KEYS.secret) || '';
    },
    setSecret(nsec) {
      storage.setItem(STORAGE_KEYS.secret, nsec);
    },
    clearSecret() {
      storage.removeItem(STORAGE_KEYS.secret);
    },
    getProfile() {
      return readJson(storage, STORAGE_KEYS.profile, { displayName: '' });
    },
    setProfile(profile) {
      writeJson(storage, STORAGE_KEYS.profile, { displayName: profile.displayName || '' });
    },
    getActiveWorkout() {
      return readJson(storage, STORAGE_KEYS.activeWorkout, null);
    },
    setActiveWorkout(workout) {
      writeJson(storage, STORAGE_KEYS.activeWorkout, workout);
    },
    clearActiveWorkout() {
      storage.removeItem(STORAGE_KEYS.activeWorkout);
    },
    getHistory() {
      const history = readJson(storage, STORAGE_KEYS.history, []);
      return Array.isArray(history) ? history : [];
    },
    addHistory(entry) {
      const next = [entry, ...this.getHistory()].slice(0, 100);
      writeJson(storage, STORAGE_KEYS.history, next);
      return next;
    },
    clearHistory() {
      storage.removeItem(STORAGE_KEYS.history);
    },
    getRelays() {
      const relays = readJson(storage, STORAGE_KEYS.relays, DEFAULT_RELAYS);
      return Array.isArray(relays) && relays.length ? relays : DEFAULT_RELAYS;
    },
    setRelays(relays) {
      const clean = relays.map((relay) => relay.trim()).filter(Boolean);
      writeJson(storage, STORAGE_KEYS.relays, clean.length ? clean : DEFAULT_RELAYS);
    }
  };
}
