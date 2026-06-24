import './styles.css';
import { CLAIM_KIND, DEFAULT_RELAYS } from './constants.js';
import { createClaim, createHistoryEntry, createPublicClaimProjection } from './claim.js';
import { formatDuration, shortNpub, clampText } from './format.js';
import { generateNsec, keyInfoFromNsec, parseNpub, publishEvent, signClaimEvent, signPublicClaimEvent, createNip17DirectMessage } from './nostr.js';
import { createSatsPaymentRequest, createUsdtPaymentRequest } from './payment.js';
import { computeChallengeProgress, createChallengePlan, createChallengeSettlement, createInviteText, decodeChallengeInvite, formatDateInput } from './challenge.js';
import { createGpsTracker } from './gps.js';
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
  gpsTracker: null,
  gpsSummary: null,
  lastSigned: null,
  activeChallengeId: store.getActiveChallengeId(),
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
  const importedChallenge = importChallengeFromUrl();
  state.activeChallengeId = importedChallenge?.id || store.getActiveChallengeId();
  state.screen = state.key ? (state.activeWorkout ? 'workout' : importedChallenge ? 'challenge' : 'home') : 'key';
  if (importedChallenge) state.message = `Challenge ${importedChallenge.code} imported locally.`;
  render();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {}));
  }
}

function importChallengeFromUrl() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = params.get('challenge');
  if (!token) return null;
  try {
    const challenge = decodeChallengeInvite(token);
    store.saveChallenge(challenge);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return challenge;
  } catch {
    state.message = 'Challenge invite link could not be imported.';
    return null;
  }
}

function appBaseUrl() {
  return new URL(window.location.pathname, window.location.origin).toString();
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
  const distance = document.querySelector('[data-distance-status]');
  const gpsDetails = document.querySelector('[data-gps-details]');
  if (!node || !state.activeWorkout) return;
  const now = Date.now();
  node.textContent = formatDuration(elapsedMs(state.activeWorkout, now));
  const delta = targetDeltaSeconds(state.activeWorkout, now);
  if (target) {
    if (delta === null) target.textContent = 'No target duration';
    else if (delta >= 0) target.textContent = `Target reached +${formatDuration(delta * 1000)}`;
    else target.textContent = `${formatDuration(Math.abs(delta) * 1000)} to target`;
  }
  if (distance && state.gpsTracker) {
    const status = state.gpsTracker.status();
    distance.textContent = renderGpsDistanceText(status);
    if (gpsDetails) gpsDetails.innerHTML = renderGpsDiagnostics(status);
  }
}

function createChallengeFromForm(form) {
  const data = new FormData(form);
  const code = clampText(data.get('challengeCode'), 80);
  if (!code) throw new Error('Challenge code is required.');
  const paymentRequests = [
    createUsdtPaymentRequest({
      amount: clampText(data.get('usdtStakeAmount'), 24),
      recipient: clampText(data.get('usdtRecipient'), 220),
      network: clampText(data.get('usdtNetwork'), 24),
      challengeCode: code
    }),
    createSatsPaymentRequest({
      amountSats: clampText(data.get('satsAmount'), 24),
      recipient: clampText(data.get('satsRecipient'), 320),
      paymentUri: clampText(data.get('satsPaymentUri'), 520),
      instructions: clampText(data.get('satsInstructions'), 800),
      challengeCode: code
    })
  ].filter(Boolean);
  return createChallengePlan({
    code,
    startDate: data.get('startDate'),
    durationDays: data.get('durationDays'),
    requiredActiveDays: data.get('requiredActiveDays'),
    minMinutesPerActiveDay: data.get('minMinutesPerActiveDay'),
    minDistanceKm: data.get('minDistanceKm'),
    participantsText: clampText(data.get('participantsText'), 1200),
    paymentRequests
  });
}

async function beginWorkout(form, challenge = null) {
  const data = new FormData(form);
  const challengeCode = challenge?.code || clampText(data.get('challengeCode'), 80);
  if (!challengeCode) return setState({ message: 'Challenge code is required.' });
  const counterpartNpub = clampText(data.get('counterpartNpub'), 120);
  if (counterpartNpub) {
    try { parseNpub(counterpartNpub); } catch { return setState({ message: 'Counterpart must be a valid npub.' }); }
  }
  const usdtRequest = challenge?.paymentRequests?.find((request) => request.asset === 'USDt');
  const satsRequest = challenge?.paymentRequests?.find((request) => request.asset === 'sats');
  const workout = createWorkout({
    challengeId: challenge?.id || '',
    challengeCode,
    targetMinutes: challenge ? challenge.minMinutesPerActiveDay : data.get('targetMinutes'),
    counterpartNpub,
    note: clampText(data.get('note'), 280),
    gpsEnabled: data.get('gpsEnabled') === 'on',
    usdtStakeAmount: usdtRequest?.amount || clampText(data.get('usdtStakeAmount'), 24),
    usdtNetwork: usdtRequest?.network || clampText(data.get('usdtNetwork'), 24),
    usdtRecipient: usdtRequest?.recipient || clampText(data.get('usdtRecipient'), 220),
    satsAmount: satsRequest?.amount_sats || clampText(data.get('satsAmount'), 24),
    satsRecipient: satsRequest?.recipient || clampText(data.get('satsRecipient'), 320),
    satsPaymentUri: satsRequest?.payment_uri || clampText(data.get('satsPaymentUri'), 520),
    satsInstructions: satsRequest?.instruction || clampText(data.get('satsInstructions'), 800)
  });
  store.setActiveWorkout(workout);
  const wakeLock = await requestWakeLock();
  let gpsTracker = null;
  let message = '';
  if (workout.gpsEnabled) {
    gpsTracker = createGpsTracker();
    const started = gpsTracker.start();
    const status = gpsTracker.status();
    message = started
      ? 'GPS watch requested. Waiting for the first accepted sample; route points stay in memory and are discarded at finish.'
      : `GPS did not start: ${gpsStartBlocker(status)} Continuing stopwatch-only.`;
  }
  setState({ activeWorkout: workout, wakeLock, gpsTracker, gpsSummary: null, screen: 'workout', message });
  startTimer();
}

async function finishWorkout() {
  if (!state.activeWorkout || !state.key) return;
  const stoppedAt = Date.now();
  let gpsSummary = null;
  if (state.gpsTracker) {
    gpsSummary = state.gpsTracker.summary();
    state.gpsTracker.stop();
  }
  const claim = createClaim({
    challengeId: state.activeWorkout.challengeId,
    challengeCode: state.activeWorkout.challengeCode,
    startedAt: state.activeWorkout.startedAt,
    stoppedAt,
    claimantNpub: state.key.npub,
    counterpartNpub: state.activeWorkout.counterpartNpub,
    note: state.activeWorkout.note,
    gpsSummary
  });
  const event = signClaimEvent({
    claim,
    challengeCode: state.activeWorkout.challengeCode,
    durationSeconds: claim.duration_seconds,
    targetSeconds: state.activeWorkout.targetSeconds,
    counterpartNpub: state.activeWorkout.counterpartNpub,
    nsec: store.getSecret()
  });
  const paymentRequests = [
    createUsdtPaymentRequest({
    amount: state.activeWorkout.usdtStakeAmount,
    recipient: state.activeWorkout.usdtRecipient,
    network: state.activeWorkout.usdtNetwork,
    challengeCode: state.activeWorkout.challengeCode,
    claimHash: claim.claim_hash
    }),
    createSatsPaymentRequest({
      amountSats: state.activeWorkout.satsAmount,
      recipient: state.activeWorkout.satsRecipient,
      paymentUri: state.activeWorkout.satsPaymentUri,
      instructions: state.activeWorkout.satsInstructions,
      challengeCode: state.activeWorkout.challengeCode,
      claimHash: claim.claim_hash
    })
  ].filter(Boolean);
  const entry = createHistoryEntry({ claim, event, paymentRequests });
  store.addHistory(entry);
  store.clearActiveWorkout();
  if (state.wakeLock) await state.wakeLock.release().catch(() => {});
  stopTimer();
  setState({
    activeWorkout: null,
    wakeLock: null,
    gpsTracker: null,
    gpsSummary,
    lastSigned: entry,
    publishResults: [],
    screen: 'claim',
    message: 'Signed locally. Private key stayed on this device.'
  });
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
          <h1>I totally got this.</h1>
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
  if (state.screen === 'challenge') return renderChallengeScreen();
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
  const challenges = store.getChallenges();
  const history = store.getHistory();
  renderShell(`
    <section class="identity-strip">
      <span>${escapeHtml(profile.displayName || 'Ready')}</span>
      <strong>${shortNpub(state.key.npub)}</strong>
    </section>
    ${challenges.length ? `<section class="panel stack"><h2>Active challenges</h2>${challenges.map((challenge) => renderChallengeCard(challenge, history)).join('')}</section>` : ''}
    <form class="panel stack" data-form="create-challenge">
      <h2>Create Challenge</h2>
      <label>Challenge name/code<input name="challengeCode" required maxlength="80" placeholder="JUNE-RUN"></label>
      <div class="form-grid">
        <label>Start date<input name="startDate" type="date" value="${formatDateInput(Date.now())}"></label>
        <label>Window, days<input name="durationDays" inputmode="numeric" type="number" min="1" step="1" value="30"></label>
      </div>
      <div class="form-grid">
        <label>Required active days<input name="requiredActiveDays" inputmode="numeric" type="number" min="1" step="1" value="10"></label>
        <label>Minimum minutes per active day<input name="minMinutesPerActiveDay" inputmode="numeric" type="number" min="1" step="1" value="45"></label>
      </div>
      <label>Optional minimum km<input name="minDistanceKm" inputmode="decimal" type="number" min="0" step="0.1" placeholder="off"></label>
      <label>Group members, optional<textarea name="participantsText" maxlength="1200" rows="4" placeholder="Names only, one per line\nNono\nAlex\nMia"></textarea></label>
      <p class="fineprint">No emails. This roster stays local on this device. Share the invite in your existing group chat.</p>
      <fieldset class="stake-box">
        <legend>Optional USDt settlement request</legend>
        <label>Amount<input name="usdtStakeAmount" inputmode="decimal" type="number" min="0" step="0.01" placeholder="2.00"></label>
        <label>Network<select name="usdtNetwork"><option value="ton">TON</option><option value="tron">Tron</option><option value="ethereum">Ethereum</option></select></label>
        <label>Team jar / recipient address<input name="usdtRecipient" autocomplete="off" spellcheck="false" placeholder="Wallet address agreed by the group"></label>
        <p class="fineprint">Manual request only. M2I never holds funds, stores spend authority, pays automatically, or polls settlement.</p>
      </fieldset>
      <fieldset class="stake-box">
        <legend>Optional sats / Lightning settlement request</legend>
        <label>Amount, sats<input name="satsAmount" inputmode="numeric" type="number" min="1" step="1" placeholder="2100"></label>
        <label>Team jar / recipient invoice, LNURL, or BTC address<input name="satsRecipient" autocomplete="off" spellcheck="false" placeholder="Team jar LNURL, lnbc..., lightning:..., or bc1..."></label>
        <label>Payment URI, optional<input name="satsPaymentUri" autocomplete="off" spellcheck="false" placeholder="lightning:lnurl... or bitcoin:bc1..."></label>
        <label>Manual instructions, optional<textarea name="satsInstructions" maxlength="800" rows="3" placeholder="Pay the agreed Teamkasse/cause from your own wallet after final settlement."></textarea></label>
      </fieldset>
      <button type="submit" class="primary">Create challenge</button>
    </form>
    <nav class="actions-row"><button class="secondary" data-action="history">History</button></nav>`);
}

function renderChallengeCard(challenge, history) {
  const progress = computeChallengeProgress(challenge, history);
  return `
    <article class="challenge-card">
      <div>
        <h3>${escapeHtml(challenge.code)}</h3>
        <p>${progress.validActiveDays} / ${challenge.requiredActiveDays} valid days · ${progress.daysRemaining} days left</p>
        <p>Starts ${new Date(challenge.startsAt).toLocaleDateString()} · ${challenge.durationDays} days · ${challenge.minMinutesPerActiveDay} min active day${challenge.minDistanceKm ? ` · ${challenge.minDistanceKm} km min` : ''}</p>
        <p>${challenge.participants.length || 'Open'} group member${challenge.participants.length === 1 ? '' : 's'} · ${challenge.paymentRequests?.length ? 'manual settlement request' : 'no payment request'}</p>
      </div>
      <button class="secondary" data-action="open-challenge" data-challenge-id="${escapeHtml(challenge.id)}">Open</button>
    </article>`;
}

function renderChallengeScreen() {
  const challenge = store.getChallenge(state.activeChallengeId);
  if (!challenge) return renderHomeScreen();
  const history = store.getHistory();
  const progress = computeChallengeProgress(challenge, history);
  const settlement = createChallengeSettlement({ challenge, history, progress });
  const linked = history.filter((entry) => entry.challengeId === challenge.id || entry.claim?.challenge_id === challenge.id);
  renderShell(`
    <section class="panel stack">
      <h2>${escapeHtml(challenge.code)}</h2>
      <div class="progress-grid">
        <div><strong>${progress.validActiveDays} / ${challenge.requiredActiveDays}</strong><span>valid days</span></div>
        <div><strong>${progress.totalWorkouts}</strong><span>local workouts</span></div>
        <div><strong>${progress.daysRemaining}</strong><span>days left</span></div>
      </div>
      <p class="muted">Starts ${new Date(challenge.startsAt).toLocaleDateString()} and ends ${new Date(challenge.endsAt).toLocaleDateString()}. A valid active day needs at least ${challenge.minMinutesPerActiveDay} minutes${challenge.minDistanceKm ? ` and ${challenge.minDistanceKm} km` : ''}. Progress is collected locally on this device.</p>
      ${challenge.participants.length ? `<section class="roster"><p class="eyebrow">Local group roster</p>${challenge.participants.map((participant) => `<span>${escapeHtml(participant.displayName)}</span>`).join('')}<p class="fineprint">Roster is local. Participants confirm in your group chat; final bot sync uses success/fail attestations only.</p></section>` : '<p class="fineprint">No roster yet. Share the invite in your group chat; M2I does not host chat or participant messages.</p>'}
      ${renderChallengePaymentSummary(challenge)}
      <form class="stack" data-form="start-challenge-workout" data-challenge-id="${escapeHtml(challenge.id)}">
        <label class="checkline privacy-check"><input type="checkbox" name="gpsEnabled" checked> Add local GPS aggregate distance</label>
        <p class="fineprint">Enable Safari Location: While Using + Precise Location. No route is stored or uploaded; route points stay in memory and are discarded at finish.</p>
        <label>Workout note, optional<textarea name="note" maxlength="280" rows="3" placeholder="Morning run"></textarea></label>
        <button type="submit" class="primary">Start workout for this challenge</button>
      </form>
      <div class="actions-row">
        <button class="secondary" data-action="copy-invite">Copy invite</button>
        <button class="secondary" data-action="copy-challenge-settlement">Copy private settlement</button>
      </div>
      ${linked.length ? `<section class="stack"><h3>Local claims</h3>${linked.map((entry) => `<article class="history-item"><div><strong>${escapeHtml(entry.durationHuman)}</strong><span>${new Date(entry.stoppedAt).toLocaleString()}</span></div><span>${entry.claim.distance_km !== undefined ? `${entry.claim.distance_km.toFixed(3)} km` : 'duration only'}</span><button class="ghost" data-action="open-claim" data-claim-id="${escapeHtml(entry.id)}">Open</button></article>`).join('')}</section>` : '<p class="muted">No local workout claims yet.</p>'}
      <textarea class="json-output" readonly rows="8">${escapeHtml(JSON.stringify(settlement, null, 2))}</textarea>
      <button class="ghost" data-action="home">Back</button>
    </section>`);
}

function renderChallengePaymentSummary(challenge) {
  if (!challenge.paymentRequests?.length) return '<p class="fineprint">No payment request. You can use this challenge without stakes.</p>';
  return `<section class="payment-card"><p class="eyebrow">Manual settlement request</p>${challenge.paymentRequests.map((request) => `<p>${request.asset === 'USDt' ? `${request.amount.toFixed(2)} USDt on ${request.network.toUpperCase()}` : `${request.amount_sats || 'Sats'} sats / ${request.network}`} · manual only</p>`).join('')}<p class="fineprint">Payment happens after final review from each user's own wallet. M2I does not pay, custody, or monitor settlement.</p></section>`;
}

function renderWorkoutScreen() {
  renderShell(`
    <section class="workout-screen">
      <p class="eyebrow">${escapeHtml(state.activeWorkout.challengeCode)}</p>
      <div class="timer" data-elapsed>${formatDuration(elapsedMs(state.activeWorkout))}</div>
      <div class="target" data-target-status></div>
      ${state.activeWorkout.gpsEnabled ? `
        <div class="target distance" data-distance-status>Waiting for local GPS estimate...</div>
        <div class="gps-details" data-gps-details></div>
      ` : ''}
      <button class="danger" data-action="finish">Finish challenge</button>
    </section>`);
  startTimer();
  updateWorkoutClock();
}

function renderClaimScreen(entry) {
  if (!entry) return renderHomeScreen();
  const settlement = entry.privateSettlement || { settlement_model: 'manual-private-settlement', signed_event: entry.event };
  const json = JSON.stringify(settlement, null, 2);
  const distance = entry.claim.distance_km !== undefined ? `<span>${entry.claim.distance_km.toFixed(3)} km estimate</span>` : '';
  const gpsOutcome = renderClaimGpsOutcome(entry.claim);
  renderShell(`
    <section class="panel stack">
      <h2>Signed claim</h2>
      <p class="muted">Private settlement JSON. It includes your signed claim event and any local manual payment requests. Public Nostr sharing is separate and redacted.</p>
      <div class="claim-summary"><strong>${escapeHtml(entry.challengeCode)}</strong><span>${entry.durationHuman}</span>${distance}<span>Kind ${CLAIM_KIND}</span></div>
      ${gpsOutcome}
      <textarea class="json-output" readonly rows="10">${escapeHtml(json)}</textarea>
      <button class="primary" data-action="copy-event">Copy private settlement JSON</button>
      ${entry.claim.counterpart_npub ? `<button class="secondary" data-action="dm">Send NIP-17 DM</button>` : ''}
      <button class="secondary" data-action="public-share">Public share to Nostr</button>
      <p class="fineprint">Public share creates a separate redacted event. It excludes route, payment, counterpart, stake, and private note data.</p>
      ${renderPaymentRequests(entry)}
      <button class="ghost" data-action="home">Done</button>
      ${renderPublishResults()}
    </section>`);
}

function getPaymentRequests(entry) {
  if (Array.isArray(entry?.paymentRequests)) return entry.paymentRequests;
  return entry?.paymentRequest ? [entry.paymentRequest] : [];
}

function renderPaymentRequests(entry) {
  const paymentRequests = getPaymentRequests(entry);
  if (!paymentRequests.length) return '';
  return paymentRequests.map((paymentRequest, index) => {
    const isSats = paymentRequest.asset === 'sats';
    const title = isSats
      ? `${paymentRequest.amount_sats ? `${paymentRequest.amount_sats} sats` : 'Sats'} manual request`
      : `${paymentRequest.amount.toFixed(2)} USDt manual request`;
    const rows = [
      ['Asset', paymentRequest.asset],
      ['Amount', isSats ? (paymentRequest.amount_sats ? `${paymentRequest.amount_sats} sats` : 'Sats amount not specified') : `${paymentRequest.amount.toFixed(2)} USDt`],
      ['Network', paymentRequest.network ? paymentRequest.network.toUpperCase() : 'manual'],
      ['Team jar / recipient', paymentRequest.recipient || 'See instructions'],
      ['Payment URI', paymentRequest.payment_uri || 'None provided'],
      ['Reference', paymentRequest.reference],
      ['Instructions', paymentRequest.instruction],
      ['Model', 'Manual request only. Not automatic payment.']
    ];
    return `
    <section class="payment-card">
      <p class="eyebrow">${isSats ? 'Sats / Lightning team jar request' : 'USDt payment request'}</p>
      <h3>${title}</h3>
      <dl>
        ${rows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
      </dl>
      <textarea class="json-output" readonly rows="5">${escapeHtml(paymentRequest.request_text)}</textarea>
      <button class="primary" data-action="copy-payment" data-payment-index="${index}">Copy payment request</button>
      ${paymentRequest.payment_uri ? `<button class="secondary" data-action="copy-payment-uri" data-payment-index="${index}">Copy wallet URI</button>` : ''}
      <p class="fineprint">Your wallet executes the payment. M2I does not connect to wallets, initiate payment, custody funds, or poll for settlement.</p>
    </section>`;
  }).join('');
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

function gpsStartBlocker(status) {
  if (!status.secure_context) return 'this page is not in a secure context';
  if (!status.geolocation_available) return 'geolocation is unavailable';
  return status.gps_last_error || 'the browser rejected the location watch';
}

function renderGpsDistanceText(status) {
  if (!status.watch_started) return 'GPS watch not running.';
  if (status.waiting_for_first_sample) return 'Waiting for first accepted GPS sample...';
  if (status.gps_sample_count === 0) return 'No accepted GPS samples yet.';
  return `${status.distance_km.toFixed(3)} km local estimate`;
}

function renderGpsDiagnostics(status) {
  const fields = [
    ['Secure context', status.secure_context ? 'yes' : 'no'],
    ['Geolocation', status.geolocation_available ? 'available' : 'unavailable'],
    ['Watch', status.watch_started ? 'running' : 'not running'],
    ['Accepted', status.gps_sample_count],
    ['Rejected', status.gps_rejected_sample_count],
    ['Last error', status.gps_last_error || 'none']
  ];
  return `<dl>${fields.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
}

function renderClaimGpsOutcome(claim) {
  if (!claim?.gps_used) return '';
  const noSamples = claim.gps_sample_count === 0;
  const rows = [
    ['Accepted', claim.gps_sample_count],
    ['Rejected', claim.gps_rejected_sample_count],
    ['Summary', claim.gps_accuracy_summary],
    ['Last error', claim.gps_last_error || 'none']
  ];
  return `
    <section class="gps-claim ${noSamples ? 'gps-claim-warning' : ''}">
      <p>${noSamples ? 'GPS produced no accepted samples for this claim.' : 'GPS aggregate included in this claim.'}</p>
      <dl>${rows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    </section>`;
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
  if (form.matches('[data-form="create-challenge"]')) {
    try {
      const challenge = createChallengeFromForm(form);
      store.saveChallenge(challenge);
      setState({ activeChallengeId: challenge.id, screen: 'challenge', message: 'Challenge created locally.' });
    } catch (error) {
      setState({ message: error.message });
    }
  }
  if (form.matches('[data-form="start-challenge-workout"]')) {
    const challenge = store.getChallenge(form.dataset.challengeId);
    if (!challenge) return setState({ message: 'Challenge not found.' });
    if (window.confirm('Start workout for this challenge?')) await beginWorkout(form, challenge);
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
  if (action === 'copy-event' && state.lastSigned) {
    const settlement = state.lastSigned.privateSettlement || { settlement_model: 'manual-private-settlement', signed_event: state.lastSigned.event };
    copy(JSON.stringify(settlement, null, 2));
  }
  if (action === 'copy-payment' && state.lastSigned) {
    const request = getPaymentRequests(state.lastSigned)[Number(event.target.dataset.paymentIndex || 0)];
    if (request) copy(request.request_text);
  }
  if (action === 'copy-payment-uri' && state.lastSigned) {
    const request = getPaymentRequests(state.lastSigned)[Number(event.target.dataset.paymentIndex || 0)];
    if (request?.payment_uri) copy(request.payment_uri);
  }
  if (action === 'public-share' && state.lastSigned) {
    const ok = window.confirm('Public Nostr sharing is permanent and linkable to this key. It will include only redacted aggregate data, never route, payment, or counterpart details. Continue?');
    if (!ok) return;
    setState({ message: 'Publishing redacted public share...' });
    const publicClaim = createPublicClaimProjection(state.lastSigned.claim);
    const publicEvent = signPublicClaimEvent({
      publicClaim,
      challengeCode: state.lastSigned.challengeCode,
      nsec: store.getSecret()
    });
    const results = await publishEvent(store.getRelays(), publicEvent);
    setState({ publishResults: results, message: 'Public share attempt finished.' });
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
  if (action === 'open-challenge') {
    const id = event.target.closest('[data-action]')?.dataset.challengeId;
    store.setActiveChallengeId(id);
    setState({ activeChallengeId: id, screen: 'challenge', message: '' });
  }
  if (action === 'copy-invite') {
    const challenge = store.getChallenge(state.activeChallengeId);
    if (challenge) copy(createInviteText(challenge, appBaseUrl()));
  }
  if (action === 'copy-challenge-settlement') {
    const challenge = store.getChallenge(state.activeChallengeId);
    if (challenge) copy(JSON.stringify(createChallengeSettlement({ challenge, history: store.getHistory() }), null, 2));
  }
  if (action === 'open-claim') {
    const claimId = event.target.closest('[data-action]')?.dataset.claimId;
    const entry = store.getHistory().find((item) => item.id === claimId);
    setState({ lastSigned: entry, publishResults: entry?.published || [], screen: 'claim', message: '' });
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
