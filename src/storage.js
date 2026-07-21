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
    getChallenges() {
      const challenges = readJson(storage, STORAGE_KEYS.challenges, []);
      return Array.isArray(challenges) ? challenges : [];
    },
    saveChallenge(challenge) {
      const existing = this.getChallenges().filter((item) => item.id !== challenge.id);
      writeJson(storage, STORAGE_KEYS.challenges, [challenge, ...existing].slice(0, 50));
      storage.setItem(STORAGE_KEYS.activeChallenge, challenge.id);
      return challenge;
    },
    getChallenge(id) {
      return this.getChallenges().find((challenge) => challenge.id === id) || null;
    },
    getActiveChallengeId() {
      return storage.getItem(STORAGE_KEYS.activeChallenge) || '';
    },
    setActiveChallengeId(id) {
      if (id) storage.setItem(STORAGE_KEYS.activeChallenge, id);
    },
    clearChallenges() {
      storage.removeItem(STORAGE_KEYS.challenges);
      storage.removeItem(STORAGE_KEYS.activeChallenge);
    },
    getChallengeJoins() {
      const joins = readJson(storage, STORAGE_KEYS.challengeJoins, []);
      return Array.isArray(joins) ? joins : [];
    },
    getChallengeJoin(challengeId) {
      return this.getChallengeJoins().find((join) => join.challengeId === challengeId) || null;
    },
    saveChallengeJoin(join) {
      const existing = this.getChallengeJoins().filter((item) => item.challengeId !== join.challengeId);
      const next = [join, ...existing].slice(0, 100);
      writeJson(storage, STORAGE_KEYS.challengeJoins, next);
      return join;
    },
    getSettlementStatuses() {
      const statuses = readJson(storage, STORAGE_KEYS.settlementStatuses, []);
      return Array.isArray(statuses) ? statuses : [];
    },
    getSettlementStatus(challengeId) {
      return this.getSettlementStatuses().find((status) => status.challengeId === challengeId) || null;
    },
    saveSettlementStatus(status) {
      const existing = this.getSettlementStatuses().filter((item) => item.challengeId !== status.challengeId);
      const next = [status, ...existing].slice(0, 100);
      writeJson(storage, STORAGE_KEYS.settlementStatuses, next);
      return status;
    },
    getImportedProofs(challengeId = '') {
      const proofs = readJson(storage, STORAGE_KEYS.importedProofs, []);
      const list = Array.isArray(proofs) ? proofs : [];
      return challengeId ? list.filter((proof) => proof.challengeId === challengeId) : list;
    },
    saveImportedProof(proof) {
      const existing = this.getImportedProofs().filter((item) => item.id !== proof.id);
      const next = [proof, ...existing].slice(0, 200);
      writeJson(storage, STORAGE_KEYS.importedProofs, next);
      return proof;
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
