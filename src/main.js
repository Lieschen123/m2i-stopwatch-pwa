import './styles.css';
import { CLAIM_KIND, DEFAULT_RELAYS } from './constants.js';
import { createClaim, createHistoryEntry } from './claim.js';
import { formatDuration, shortNpub, clampText } from './format.js';
import { generateNsec, keyInfoFromNsec, parseNpub, publishEvent, signClaimEvent, createNip17DirectMessage } from './nostr.js';
import { createStorage } from './storage.js';
import { createWorkout, elapsedMs, requestWakeLock, targetDeltaSeconds } from './stopwatch.js';

const store = createStorage();
const app = document.querySelector('#app');
let state = {
  screen: 'loading',
  key: null,
  generatedNsec: '',
  backupConfirmed: false,
  activeWorkout: store.getActiveWorkout(),
  wakeLock: null,
  lastSigned: null,
  publishResults: [],
  message: ''
};
let timerId = null;

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function loadKey() {
  const nsec = store.getSecret();
  if (!nsec) return null;
  try {
    return keyInfoFromNsec(nsec);
  } catch {
    store.clearSecret();
    return null;
  }
}

function boot() {
  state.key = loadKey();
  state.screen = state.key ? (state.activeWorkout ? 'workout' : 'home') : 'key';
  render();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

function startTimer() {
  stopTimer();
  timerId = window.setInterval(() => {
    if (state.screen === 'workout') updateWorkoutClock();
  }, 250);
  document.addEventListener('visibilitychange', updateWorkoutClock);
}

function stopTimer() {
  if (timerId) window.clearInterval(timerId);
  timerId = null;
  document.removeEventListener('visibilitychange', updateWorkoutClock);
}

function updateWorkoutClock() {
  const node = document.querySelector('[data-elapsed]');
  const target = document.querySelector('[data-target-status]');
  if (!node || !state.activeWorkout) return;
  const now = Date.now();
  node.textContent = formatDuration(elapsedMs(state.activeWorkout, now));
  const delta = targetDeltaSeconds(state.activeWorkout, now);
  if (target) {
    if (delta === null) target.textContent = 'No target duration';
    else if (delta >= 0) target.textContent = `Target reached +${formatDuration(delta * 1000)}`;
    else target.textContent = `${formatDuration(Math.abs(delta) * 1000)} to target`;
  }
}

async function beginWorkout(form) {
  const data = new FormData(form);
  const challengeCode = clampText(data.get('challengeCode'), 80);
  if (!challengeCode) return setState({ message: 'Challenge code is required.' });
  const counterpartNpub = clampText(data.get('counterpartNpub'), 120);
  if (counterpartNpub) {
    try { parseNpub(counterpartNpub); } catch { return setState({ message: 'Counterpart must be a valid npub.' }); }
  }
  const workout = createWorkout({
    challengeCode,
    targetMinutes: data.get('targetMinutes'),
    counterpartNpub,
    note: clampText(data.get('note'), 280)
  });
  store.setActiveWorkout(workout);
  const wakeLock = await requestWakeLock();
  setState({ activeWorkout: workout, wakeLock, screen: 'workout', message: '' });
  startTimer();
}

async function finishWorkout() {
  if (!state.activeWorkout || !state.key) return;
  const stoppedAt = Date.now();
  const claim = createClaim({
    challengeCode: state.activeWorkout.challengeCode,
    startedAt: state.activeWorkout.startedAt,
    stoppedAt,
    claimantNpub: state.key.npub,
    counterpartNpub: state.activeWorkout.counterpartNpub,
    note: state.activeWorkout.note
  });
  const event = signClaimEvent({
    claim,
    challengeCode: state.activeWorkout.challengeCode,
    durationSeconds: claim.duration_seconds,
    targetSeconds: state.activeWorkout.targetSeconds,
    counterpartNpub: state.activeWorkout.counterpartNpub,
    nsec: store.getSecret()
  });
  const entry = createHistoryEntry({ claim, event });
  store.addHistory(entry);
  store.clearActiveWorkout();
  if (state.wakeLock) await state.wakeLock.release().catch(() => {});
  stopTimer();
  setState({ activeWorkout: null, wakeLock: null, lastSigned: entry, publishResults: [], screen: 'claim', message: 'Signed locally. Private key stayed on this device.' });
}

function copy(text) {
  navigator.clipboard.writeText(text).then(
    () => setState({ message: 'Copied to clipboard.' }),
    () => setState({ message: 'Copy failed. Select the JSON manually.' })
  );
}

function renderShell(content) {
  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Move2Improve</p>
          <h1>I Got This</h1>
        </div>
        ${state.key ? `<button class="ghost" data-action="settings">Settings</button>` : ''}
      </header>
      ${state.message ? `<div class="notice" role="status">${escapeHtml(state.message)}</div>` : ''}
      ${content}
    </main>`;
}

function render() {
  if (state.screen === 'loading') return;
  if (state.screen === 'key') return renderKeyScreen();
  if (state.screen === 'workout') return renderWorkoutScreen();
  if (state.screen === 'claim') return renderClaimScreen(state.lastSigned);
  if (state.screen === 'history') return renderHistoryScreen();
  if (state.screen === 'settings') return renderSettingsScreen();
  return renderHomeScreen();
}

function renderKeyScreen() {
  renderShell(`
    <section class="panel">
      <h2>Nostr identity</h2>
      <p class="muted">Generate a new key locally or import an existing nsec. The private key is stored only in this browser's localStorage.</p>
      ${state.generatedNsec ? `
        <div class="secret-box">
          <label>Your new nsec, shown once</label>
          <textarea readonly rows="3">${state.generatedNsec}</textarea>
        </div>
        <label class="checkline"><input type="checkbox" data-action="backup-toggle" ${state.backupConfirmed ? 'checked' : ''}> I have backed up this key.</label>
        <button class="primary" data-action="save-generated" ${state.backupConfirmed ? '' : 'disabled'}>Use this key</button>
      ` : `<button class="primary" data-action="generate-key">Generate new Nostr key</button>`}
      <form data-form="import-key" class="stack">
        <label>Import existing nsec<input name="nsec" autocomplete="off" spellcheck="false" placeholder="nsec1..."></label>
        <label>Display name, optional<input name="displayName" maxlength="60" placeholder="Nono"></label>
        <button type="submit" class="secondary">Import nsec</button>
      </form>
    </section>`);
}

function renderHomeScreen() {
  const profile = store.getProfile();
  renderShell(`
    <section class="identity-strip">
      <span>${escapeHtml(profile.displayName || 'Ready')}</span>
      <strong>${shortNpub(state.key.npub)}</strong>
    </section>
    <form class="panel stack" data-form="challenge">
      <h2>New Challenge</h2>
      <label>Challenge code<input name="challengeCode" required maxlength="80" placeholder="RUN-2026-06-20-JOGGING"></label>
      <label>Target duration, minutes<input name="targetMinutes" inputmode="decimal" type="number" min="1" step="1" placeholder="30"></label>
      <label>Counterpart npub, optional<input name="counterpartNpub" autocomplete="off" spellcheck="false" placeholder="npub1..."></label>
      <label>Note, optional<textarea name="note" maxlength="280" rows="3" placeholder="30min jog in the park"></textarea></label>
      <button type="submit" class="primary">Start</button>
    </form>
    <nav class="actions-row"><button class="secondary" data-action="history">History</button></nav>`);
}

function renderWorkoutScreen() {
  renderShell(`
    <section class="workout-screen">
      <p class="eyebrow">${escapeHtml(state.activeWorkout.challengeCode)}</p>
      <div class="timer" data-elapsed>${formatDuration(elapsedMs(state.activeWorkout))}</div>
      <div class="target" data-target-status></div>
      <button class="danger" data-action="finish">Finish challenge</button>
    </section>`);
  startTimer();
  updateWorkoutClock();
}

function renderClaimScreen(entry) {
  if (!entry) return renderHomeScreen();
  const json = JSON.stringify(entry.event, null, 2);
  renderShell(`
    <section class="panel stack">
      <h2>Signed claim</h2>
      <div class="claim-summary"><strong>${escapeHtml(entry.challengeCode)}</strong><span>${entry.durationHuman}</span><span>Kind ${CLAIM_KIND}</span></div>
      <textarea class="json-output" readonly rows="10">${escapeHtml(json)}</textarea>
      <button class="primary" data-action="publish">Send to relays</button>
      ${entry.claim.counterpart_npub ? `<button class="secondary" data-action="dm">Send NIP-17 DM</button>` : ''}
      <button class="secondary" data-action="copy-event">Copy event JSON</button>
      <button class="ghost" data-action="home">Done</button>
      ${renderPublishResults()}
    </section>`);
}

function renderHistoryScreen() {
  const history = store.getHistory();
  renderShell(`
    <section class="panel stack">
      <h2>Local history</h2>
      ${history.length ? history.map((entry, index) => `
        <article class="history-item">
          <div><strong>${escapeHtml(entry.challengeCode)}</strong><span>${new Date(entry.stoppedAt).toLocaleString()}</span></div>
          <span>${escapeHtml(entry.durationHuman)}</span>
          <button class="ghost" data-action="open-history" data-index="${index}">Open</button>
        </article>`).join('') : '<p class="muted">No signed claims yet.</p>'}
      <button class="secondary" data-action="clear-history">Clear history</button>
      <button class="ghost" data-action="home">Back</button>
    </section>`);
}

function renderSettingsScreen() {
  renderShell(`
    <section class="panel stack">
      <h2>Settings</h2>
      <label>Relay list<textarea data-relays rows="5">${store.getRelays().join('\n')}</textarea></label>
      <button class="primary" data-action="save-relays">Save relays</button>
      <button class="secondary" data-action="reset-relays">Reset default relays</button>
      <button class="danger-outline" data-action="forget-key">Forget local key</button>
      <button class="ghost" data-action="home">Back</button>
    </section>`);
}

function renderPublishResults() {
  if (!state.publishResults.length) return '';
  return `<ul class="results">${state.publishResults.map((result) => `<li class="${result.ok ? 'ok' : 'bad'}">${escapeHtml(result.relay)}: ${result.ok ? 'sent' : escapeHtml(result.error)}</li>`).join('')}</ul>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

app.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.matches('[data-form="import-key"]')) {
    try {
      const data = new FormData(form);
      const info = keyInfoFromNsec(data.get('nsec'));
      store.setSecret(info.nsec);
      store.setProfile({ displayName: clampText(data.get('displayName'), 60) });
      setState({ key: info, screen: 'home', message: `You are ${shortNpub(info.npub)}.` });
    } catch (error) {
      setState({ message: error.message });
    }
  }
  if (form.matches('[data-form="challenge"]')) {
    if (window.confirm('Ready? Tap OK to begin.')) await beginWorkout(form);
  }
});

app.addEventListener('change', (event) => {
  if (event.target.matches('[data-action="backup-toggle"]')) setState({ backupConfirmed: event.target.checked });
});

app.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'generate-key') setState({ generatedNsec: generateNsec(), backupConfirmed: false, message: 'Back up this key before continuing.' });
  if (action === 'save-generated') {
    const info = keyInfoFromNsec(state.generatedNsec);
    store.setSecret(info.nsec);
    setState({ key: info, generatedNsec: '', screen: 'home', message: `You are ${shortNpub(info.npub)}.` });
  }
  if (action === 'finish' && window.confirm('Finish challenge? This will create your signed claim.')) await finishWorkout();
  if (action === 'copy-event' && state.lastSigned) copy(JSON.stringify(state.lastSigned.event, null, 2));
  if (action === 'publish' && state.lastSigned) {
    setState({ message: 'Publishing to relays...' });
    const results = await publishEvent(store.getRelays(), state.lastSigned.event);
    state.lastSigned.published = results;
    store.addHistory(state.lastSigned);
    setState({ publishResults: results, message: 'Relay publish attempt finished.' });
  }
  if (action === 'dm' && state.lastSigned) {
    setState({ message: 'Preparing NIP-17 DM...' });
    try {
      const results = await createNip17DirectMessage({
        relays: store.getRelays(),
        senderNsec: store.getSecret(),
        recipientNpub: state.lastSigned.claim.counterpart_npub,
        plaintext: JSON.stringify(state.lastSigned.event)
      });
      setState({ publishResults: results, message: 'DM publish attempt finished.' });
    } catch (error) {
      setState({ message: error.message });
    }
  }
  if (action === 'history') setState({ screen: 'history', message: '' });
  if (action === 'home') setState({ screen: 'home', message: '' });
  if (action === 'settings') setState({ screen: 'settings', message: '' });
  if (action === 'open-history') {
    const entry = store.getHistory()[Number(event.target.dataset.index)];
    setState({ lastSigned: entry, publishResults: entry?.published || [], screen: 'claim', message: '' });
  }
  if (action === 'clear-history' && window.confirm('Clear local claim history?')) {
    store.clearHistory();
    setState({ screen: 'history', message: 'Local history cleared.' });
  }
  if (action === 'save-relays') {
    const relays = app.querySelector('[data-relays]').value.split('\n');
    store.setRelays(relays);
    setState({ screen: 'settings', message: 'Relays saved.' });
  }
  if (action === 'reset-relays') {
    store.setRelays(DEFAULT_RELAYS);
    setState({ screen: 'settings', message: 'Default relays restored.' });
  }
  if (action === 'forget-key' && window.confirm('Forget this browser key and local active workout?')) {
    store.clearSecret();
    store.clearActiveWorkout();
    setState({ key: null, activeWorkout: null, screen: 'key', message: 'Local key removed.' });
  }
});

boot();
