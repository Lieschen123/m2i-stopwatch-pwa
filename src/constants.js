export const CLIENT_NAME = 'm2i-stopwatch-v1';
export const SPEC_VERSION = '1.0';
export const CLAIM_KIND = 30316;
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band'
];

export const STORAGE_KEYS = {
  secret: 'm2i.nostr.nsec',
  profile: 'm2i.profile.v1',
  activeWorkout: 'm2i.activeWorkout.v1',
  challenges: 'm2i.challenges.v1',
  activeChallenge: 'm2i.activeChallenge.v1',
  challengeJoins: 'm2i.challengeJoins.v1',
  importedProofs: 'm2i.importedProofs.v1',
  history: 'm2i.history.v1',
  relays: 'm2i.relays.v1'
};
