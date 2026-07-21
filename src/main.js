import './styles.css';
import { CLAIM_KIND, DEFAULT_RELAYS } from './constants.js';
import { createClaim, createHistoryEntry, createPublicClaimProjection } from './claim.js';
import { createImportedProofRecord, createJoinEnvelope, createOutcomeEnvelope, createPaymentRequestEnvelope, createReceiptEnvelope } from './envelope.js';
import { formatDuration, shortNpub, clampText } from './format.js';
import { generateNsec, keyInfoFromNsec, parseNpub, publishEvent, signClaimEvent, signPublicClaimEvent, createNip17DirectMessage } from './nostr.js';
import { createSatsPaymentRequest, createUsdtPaymentRequest } from './payment.js';
import { BURPEE_DEFAULT_DURATION_SECONDS, computeChallengeProgress, createChallengePlan, createChallengeSettlement, createInviteText, decodeChallengeInvite, formatDateInput, getChallengeSettlementStatus, importedProofClaimEntries, isBurpeeChallenge, isBurpeeClaim, normalizeChallengePaymentRequests, rankBurpeeClaims, requiredChallengeMovementMeters } from './challenge.js';
import { buildBoardViewModel } from './board.js';
import { renderBoard } from './board-view.js';
import { buildShareExport, parseShareImport, copyToClipboard as copyShareToClipboard } from './board-share.js';
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
  gpsPreflight: { status: 'idle', message: 'Not tested on this device yet.' },
  lastSigned: null,
  activeChallengeId: store.getActiveChallengeId(),
  publishResults: [],
  message: ''
};
let timerId = null;

const SETTLEMENT_STATUS_OPTIONS = [
  {
    value: 'open',
    label: 'Not yet settled',
    emoji: '⏳',
    groupLine: 'Settlement: still open',
    instructionLine: 'Status: still open. Late settlement is still possible.'
  },
  {
    value: 'settled',
    label: 'Settled',
    emoji: '✅',
    groupLine: 'Settlement: marked settled by the group',
    instructionLine: 'Status: settled. The group has marked this payment as done.'
  },
  {
    value: 'settled_late',
    label: 'Settled late',
    emoji: '🕰️',
    groupLine: 'Settlement: settled late after review',
    instructionLine: 'Status: settled late. The group can keep the record but close the payment issue.'
  },
  {
    value: 'waived',
    label: 'Waived by group',
    emoji: '🤝',
    groupLine: 'Settlement: waived by group agreement',
    instructionLine: 'Status: waived by group agreement. No transfer is expected unless the group reopens it.'
  }
];

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
    const challenge = normalizeChallengePaymentRequests(decodeChallengeInvite(token));
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
  const activityType = data.get('activityType') === 'burpees' ? 'burpees' : 'movement';
  const burpeeMinutes = clampText(data.get('burpeeDurationMinutes'), 8);
  const durationSecondsFromForm = activityType === 'burpees'
    ? (Number(burpeeMinutes) > 0 ? Math.round(Number(burpeeMinutes) * 60) : BURPEE_DEFAULT_DURATION_SECONDS)
    : undefined;
  const burpeeMinReps = activityType === 'burpees'
    ? Number(clampText(data.get('burpeeMinReps'), 8)) || null
    : undefined;
  return createChallengePlan({
    code,
    startDate: data.get('startDate'),
    durationDays: data.get('durationDays'),
    requiredActiveDays: data.get('requiredActiveDays'),
    minMinutesPerActiveDay: data.get('minMinutesPerActiveDay'),
    minDistanceKm: data.get('minDistanceKm'),
    participantsText: clampText(data.get('participantsText'), 1200),
    paymentRequests,
    activityType,
    durationSeconds: durationSecondsFromForm,
    minReps: burpeeMinReps
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
  const isBurpee = isBurpeeChallenge(challenge);
  const workout = createWorkout({
    challengeId: challenge?.id || '',
    challengeCode,
    participant: challenge ? store.getChallengeJoin(challenge.id)?.participant || null : null,
    targetMinutes: isBurpee ? undefined : (challenge ? challenge.minMinutesPerActiveDay : data.get('targetMinutes')),
    targetSeconds: isBurpee ? (challenge?.durationSeconds || BURPEE_DEFAULT_DURATION_SECONDS) : undefined,
    activityType: isBurpee ? 'burpees' : 'movement',
    counterpartNpub,
    note: clampText(data.get('note'), 280),
    gpsEnabled: !isBurpee && data.get('gpsEnabled') === 'on',
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
  const isBurpee = state.activeWorkout.activityType === 'burpees';
  let repCount = null;
  if (isBurpee) {
    const raw = window.prompt('How many burpees did you complete?', '');
    if (raw === null) return;
    const parsed = Math.max(0, Math.round(Number(raw) || 0));
    if (parsed <= 0) {
      setState({ message: 'Enter a rep count above zero to sign a burpee claim.' });
      return;
    }
    repCount = parsed;
  }
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
    claimantDisplayName: state.activeWorkout.participant?.displayName || '',
    counterpartNpub: state.activeWorkout.counterpartNpub,
    note: state.activeWorkout.note,
    gpsSummary,
    activity: isBurpee ? { activityType: 'burpees', repCount } : undefined
  });
  const event = signClaimEvent({
    claim,
    challengeCode: state.activeWorkout.challengeCode,
    durationSeconds: claim.duration_seconds,
    targetSeconds: state.activeWorkout.targetSeconds,
    counterpartNpub: state.activeWorkout.counterpartNpub,
    nsec: store.getSecret()
  });
  const challenge = state.activeWorkout.challengeId ? normalizeChallengePaymentRequests(store.getChallenge(state.activeWorkout.challengeId)) : null;
  const paymentRequests = challenge?.paymentRequests?.length ? challenge.paymentRequests : [
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
    () => setState({ message: 'Copy failed. Select the text manually.' })
  );
}

async function shareText({ title, text, fallbackMessage = 'Share is not available here. Copied to clipboard instead.' }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      setState({ message: 'Share sheet opened.' });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setState({ message: 'Share failed. Copied to clipboard instead.' });
    }
  } else {
    setState({ message: fallbackMessage });
  }
  copy(text);
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
  if (state.screen === 'board') return renderBoardScreen();
  return renderHomeScreen();
}

function renderBoardScreen() {
  const challenge = normalizeChallengePaymentRequests(store.getChallenge(state.activeChallengeId));
  if (!challenge) return renderHomeScreen();
  const history = store.getHistory();
  const importedProofs = store.getImportedProofs(challenge.id);
  const ownNpub = state.key?.npub || '';
  const ownDisplayName = store.getProfile()?.displayName || '';

  const vm = buildBoardViewModel({
    challenge,
    history,
    importedProofs,
    ownNpub,
    ownDisplayName
  });

  renderShell(`
    <section class="panel stack">
      <div class="actions-row">
        <button class="ghost" data-action="challenge">← Challenge</button>
        <button class="ghost" data-action="home">Home</button>
      </div>
      <div id="board-mount"></div>
      ${state.message ? `<p class="notice">${escapeHtml(state.message)}</p>` : ''}
    </section>
  `);

  const mount = document.querySelector('#board-mount');
  if (!mount) return;

  renderBoard(mount, vm, {
    onExport: async () => {
      const exportText = buildShareExport({
        challenge,
        history,
        ownNpub,
        ownDisplayName
      });
      if (!exportText) return { ok: false };
      const ok = await copyShareToClipboard(exportText);
      return { ok };
    },
    onImport: async (text) => {
      const result = parseShareImport(text);
      if (!result.ok) return { ok: false, error: result.error };
      let addedCount = 0;
      for (const proof of result.proofs) {
        try {
          store.saveImportedProof(proof);
          addedCount++;
        } catch (err) {
          // Skip malformed proofs but continue with rest
        }
      }
      setState({ message: `Imported ${addedCount} claim(s) into board.` });
      return { ok: true, addedCount };
    }
  });
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
    ${challenges.length ? `<section class="panel stack"><h2>Challenges</h2>${challenges.map((challenge) => renderChallengeCard(challenge, history)).join('')}</section>` : ''}
    <form class="panel stack" data-form="create-challenge">
      <h2>Create Challenge</h2>
      <label>Challenge name/code<input name="challengeCode" required maxlength="80" placeholder="JUNE-RUN"></label>
      <fieldset class="activity-picker">
        <legend>Activity</legend>
        <label class="checkline"><input type="radio" name="activityType" value="movement" checked data-activity-toggle> Movement / Run</label>
        <label class="checkline"><input type="radio" name="activityType" value="burpees" data-activity-toggle> Burpees</label>
        <p class="fineprint" data-activity-hint-movement>Movement challenges validate on time plus local GPS aggregate movement.</p>
        <p class="fineprint" data-activity-hint-burpees hidden>Burpees are a signed self-attestation. The receipt proves who claimed what and when. It does not prove the movement objectively happened.</p>
      </fieldset>
      <div class="form-grid">
        <label>Start date<input name="startDate" type="date" value="${formatDateInput(Date.now())}"></label>
        <label>Window, days<input name="durationDays" inputmode="numeric" type="number" min="1" step="1" value="30"></label>
      </div>
      <div class="form-grid" data-movement-fields>
        <label>Required active days<input name="requiredActiveDays" inputmode="numeric" type="number" min="1" step="1" value="10"></label>
        <label>Minimum minutes per active day<input name="minMinutesPerActiveDay" inputmode="numeric" type="number" min="1" step="1" value="45"></label>
      </div>
      <label data-movement-fields>Distance goal, optional<input name="minDistanceKm" inputmode="decimal" type="number" min="0" step="0.1" placeholder="off"></label>
      <p class="fineprint" data-movement-fields>Leave empty if minutes are enough. If set, each active day must meet both minimum minutes and distance.</p>
      <div class="form-grid" data-burpee-fields hidden>
        <label>Burpee window, minutes<input name="burpeeDurationMinutes" inputmode="numeric" type="number" min="1" step="1" value="7"></label>
        <label>Minimum reps, optional<input name="burpeeMinReps" inputmode="numeric" type="number" min="0" step="1" placeholder="off"></label>
      </div>
      <label>Group members, optional<textarea name="participantsText" maxlength="1200" rows="4" placeholder="Names only, one per line\nNono\nAlex\nMia"></textarea></label>
      <p class="fineprint">No emails. This roster stays local on this device. Share the invite in your existing group chat.</p>
      <fieldset class="stake-box">
        <legend>USDt stake if missed, optional</legend>
        <label>Amount<input name="usdtStakeAmount" inputmode="decimal" type="number" min="0" step="0.01" placeholder="2.00"></label>
        <label>Network<select name="usdtNetwork"><option value="ton">TON</option><option value="tron">Tron</option><option value="ethereum">Ethereum</option></select></label>
        <label>Team jar / recipient address<input name="usdtRecipient" autocomplete="off" spellcheck="false" placeholder="Wallet address agreed by the group"></label>
        <p class="fineprint">Only due if the challenge is missed after final review. If the challenge is complete, no payment is due. M2I never holds funds, pays automatically, or monitors settlement.</p>
      </fieldset>
      <fieldset class="stake-box">
        <legend>Sats / Lightning stake if missed, optional</legend>
        <label>Amount, sats<input name="satsAmount" inputmode="numeric" type="number" min="1" step="1" placeholder="2100"></label>
        <label>Team jar / recipient invoice, LNURL, or BTC address<input name="satsRecipient" autocomplete="off" spellcheck="false" placeholder="Team jar LNURL, lnbc..., lightning:..., or bc1..."></label>
        <label>Payment URI, optional<input name="satsPaymentUri" autocomplete="off" spellcheck="false" placeholder="lightning:lnurl... or bitcoin:bc1..."></label>
        <label>Manual instructions, optional<textarea name="satsInstructions" maxlength="800" rows="3" placeholder="Only due from your own wallet if final review says the challenge was missed."></textarea></label>
      </fieldset>
      <button type="submit" class="primary">Create challenge</button>
    </form>
    <nav class="actions-row"><button class="secondary" data-action="history">History</button></nav>`);
}

function renderChallengeCard(challenge, history) {
  const progress = computeChallengeProgress(challenge, history);
  const status = getChallengeSettlementStatus(progress);
  const label = challengeStatus(progress);
  const timing = progress.isExpired ? escapeHtml(status.payment_reason) : `${progress.daysRemaining} days left`;
  const isBurpee = isBurpeeChallenge(challenge);
  const activityLine = isBurpee
    ? `Burpees · ${burpeeWindowLabel(challenge)}${challenge.minReps ? ` · min ${challenge.minReps} reps` : ''}`
    : `${challenge.minMinutesPerActiveDay} min active day${challenge.minDistanceKm ? ` · ${challenge.minDistanceKm} km distance goal` : ''}`;
  return `
    <article class="challenge-card">
      <div>
        <h3>${escapeHtml(challenge.code)}</h3>
        <p>${progress.validActiveDays} / ${challenge.requiredActiveDays} valid days · ${timing}</p>
        <p>Starts ${new Date(challenge.startsAt).toLocaleDateString()} · closes ${new Date(challenge.endsAt).toLocaleString()} · ${escapeHtml(activityLine)}</p>
        <p>${challenge.participants.length || 'Open'} group member${challenge.participants.length === 1 ? '' : 's'} · ${challenge.paymentRequests?.length ? 'stake if missed' : 'no stake configured'}</p>
      </div>
      <button class="secondary" data-action="open-challenge" data-challenge-id="${escapeHtml(challenge.id)}">${progress.isExpired ? label : 'Open'}</button>
    </article>`;
}

function burpeeWindowLabel(challenge) {
  const seconds = Number(challenge?.durationSeconds) || BURPEE_DEFAULT_DURATION_SECONDS;
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} min window`;
  }
  return `${seconds} s window`;
}

function challengeRulesCopy(challenge) {
  if (isBurpeeChallenge(challenge)) {
    const window = burpeeWindowLabel(challenge);
    const minReps = challenge.minReps ? ` at least ${challenge.minReps} reps and` : '';
    return `Starts ${new Date(challenge.startsAt).toLocaleDateString()} and closes ${new Date(challenge.endsAt).toLocaleString()}. A valid burpee round needs${minReps} a full ${window}. Reps are self-attested and signed locally on this device.`;
  }
  return `Starts ${new Date(challenge.startsAt).toLocaleDateString()} and closes ${new Date(challenge.endsAt).toLocaleString()}. A valid active day needs at least ${challenge.minMinutesPerActiveDay} minutes plus ${challenge.minDistanceKm ? `${challenge.minDistanceKm} km` : `${requiredChallengeMovementMeters(challenge)} m`} of accepted local GPS aggregate movement. Progress is collected locally on this device.`;
}

function renderBurpeeStartForm(challenge) {
  const window = burpeeWindowLabel(challenge);
  return `
    <form class="stack" data-form="start-challenge-workout" data-challenge-id="${escapeHtml(challenge.id)}">
      <p class="notice"><strong>Burpee round.</strong> Full ${escapeHtml(window)}. At the end, enter your reps.</p>
      <p class="fineprint">Signed self-attestation. The receipt proves who claimed what and when. It does not prove the movement objectively happened.</p>
      <label>Workout note, optional<textarea name="note" maxlength="280" rows="3" placeholder="Living room"></textarea></label>
      <button type="submit" class="primary">Start burpee round</button>
    </form>`;
}

function renderBurpeeLeaderboard(challenge, entries) {
  const linked = entries.filter((entry) => entry.challengeId === challenge.id || entry.claim?.challenge_id === challenge.id);
  const ranked = rankBurpeeClaims(linked);
  if (!ranked.length) return '<p class="fineprint">No burpee rounds signed yet.</p>';
  const rows = ranked.slice(0, 10).map((entry, index) => {
    const claim = entry.claim;
    const name = claim.claimant_display_name || shortNpub(claim.claimant_npub) || 'anonymous';
    const durationLabel = formatDuration((claim.duration_seconds || 0) * 1000);
    return `<li><strong>${index + 1}. ${escapeHtml(name)}</strong> · ${escapeHtml(String(claim.rep_count))} reps · ${escapeHtml(durationLabel)}</li>`;
  }).join('');
  return `
    <section class="stack burpee-leaderboard">
      <h3>Burpee leaderboard</h3>
      <ol class="board-list">${rows}</ol>
      <p class="fineprint">Ranked by reps then completion time. Reps are self-attested.</p>
    </section>`;
}

function challengeStatus(progress) {
  if (progress.isComplete) return 'Complete';
  if (progress.isExpired) return 'Missed';
  return 'Open';
}

function renderChallengeScreen() {
  const challenge = normalizeChallengePaymentRequests(store.getChallenge(state.activeChallengeId));
  if (!challenge) return renderHomeScreen();
  const history = store.getHistory();
  const importedProofs = store.getImportedProofs(challenge.id);
  const importedEntries = importedProofClaimEntries(importedProofs);
  const progress = computeChallengeProgress(challenge, [...history, ...importedEntries]);
  const settlement = attachLocalSettlementStatus(createChallengeSettlement({ challenge, history, importedProofs, progress }));
  if (progress.isExpired) {
    renderClosedChallengeScreen({ challenge, settlement, importedProofs });
    return;
  }
  const linked = history.filter((entry) => entry.challengeId === challenge.id || entry.claim?.challenge_id === challenge.id);
  const join = store.getChallengeJoin(challenge.id);
  const status = challengeStatus(progress);
  const settlementStatus = getChallengeSettlementStatus(progress);
  const dueLabel = settlementStatus.payment_due === null ? 'Pending final review' : (settlementStatus.payment_due ? 'Payment due' : 'No payment due');
  const emptyRosterCopy = progress.isExpired
    ? 'No participant roster was saved for this challenge.'
    : 'Open group challenge. Share the invite in your group chat.';
  renderShell(`
    <section class="panel stack">
      <h2>${escapeHtml(challenge.code)}</h2>
      <div class="progress-grid">
        <div><strong>${progress.validActiveDays} / ${challenge.requiredActiveDays}</strong><span>valid days</span></div>
        <div><strong>${progress.totalWorkouts}</strong><span>verified workouts</span></div>
        <div><strong>${importedProofs.length}</strong><span>imported proofs</span></div>
        <div><strong>${progress.isExpired ? status : progress.daysRemaining}</strong><span>${progress.isExpired ? 'status' : 'days left'}</span></div>
      </div>
      <p class="notice"><strong>${escapeHtml(dueLabel)}.</strong> ${escapeHtml(settlementStatus.payment_reason)}</p>
      <p class="muted">${challengeRulesCopy(challenge)}</p>
      ${renderJoinStatus(challenge, join)}
      ${challenge.participants.length ? `<section class="roster"><p class="eyebrow">Local group roster</p>${challenge.participants.map((participant) => `<span>${escapeHtml(participant.displayName)}</span>`).join('')}<p class="fineprint">Roster is local. Participants confirm in your group chat; final bot sync uses success/fail attestations only.</p></section>` : `<p class="fineprint">${emptyRosterCopy}</p>`}
      ${renderChallengePaymentSummary(challenge)}
      ${isBurpeeChallenge(challenge) ? renderBurpeeLeaderboard(challenge, [...history, ...importedEntries]) : ''}
      ${renderImportedProofs(importedProofs)}
      ${progress.isExpired ? `<p class="notice">${progress.isComplete ? 'Challenge complete. Copy proof if you want to share it.' : 'Challenge window is closed. Review progress and copy challenge proof if needed.'}</p>` : (isBurpeeChallenge(challenge) ? renderBurpeeStartForm(challenge) : `<form class="stack" data-form="start-challenge-workout" data-challenge-id="${escapeHtml(challenge.id)}">
        ${renderGpsReadiness()}
        <label class="checkline privacy-check"><input type="checkbox" name="gpsEnabled" checked> Add local GPS aggregate distance</label>
        <p class="fineprint">Use the Location readiness test before starting. Challenge workouts need accepted GPS aggregate movement for validity, even without a distance goal. If the browser asks, allow Location while using this page and keep Precise Location enabled.</p>
        <label>Workout note, optional<textarea name="note" maxlength="280" rows="3" placeholder="Morning run"></textarea></label>
        <button type="submit" class="primary">Start workout for this challenge</button>
      </form>`)}
      ${progress.isExpired ? renderFinalReviewEnvelopeActions(settlement) : ''}
      <div class="actions-row">
        <button class="primary" data-action="board">📊 Open Board</button>
        <button class="secondary" data-action="copy-invite">Copy invite</button>
        <button class="secondary" data-action="copy-challenge-settlement">Copy challenge proof</button>
      </div>
      <form class="stack" data-form="import-proof" data-challenge-id="${escapeHtml(challenge.id)}">
        <label>Import copied proof<textarea name="proofJson" rows="5" placeholder="Paste a copied M2I proof or envelope JSON"></textarea></label>
        <button type="submit" class="secondary">Import proof</button>
        <p class="fineprint">Imported proofs stay local on this device and do not change your signed workout history.</p>
      </form>
      ${linked.length ? `<section class="stack"><h3>Local claims</h3>${linked.map((entry) => `<article class="history-item"><div><strong>${escapeHtml(entry.durationHuman)}</strong><span>${new Date(entry.stoppedAt).toLocaleString()}</span></div><span>${entry.claim.distance_km !== undefined ? `${entry.claim.distance_km.toFixed(3)} km` : 'duration only'}</span><button class="ghost" data-action="open-claim" data-claim-id="${escapeHtml(entry.id)}">Open</button></article>`).join('')}</section>` : '<p class="muted">No local workout claims yet.</p>'}
      <details class="advanced-proof"><summary>Advanced settlement JSON</summary><textarea class="json-output" readonly rows="8">${escapeHtml(JSON.stringify(proofSettlement(settlement), null, 2))}</textarea></details>
      <button class="ghost" data-action="home">Back</button>
    </section>`);
}

function renderClosedChallengeScreen({ challenge, settlement, importedProofs }) {
  renderShell(`
    <section class="panel stack final-screen">
      <p class="eyebrow">Challenge closed</p>
      <h2>${escapeHtml(challenge.code)}</h2>
      ${renderFinalReviewEnvelopeActions(settlement)}
      <section class="late-proof-card stack">
        <div>
          <p class="eyebrow">Late proof</p>
          <h3>Import a proof someone shares later</h3>
          <p class="muted">Use this if a participant finished on time but sends their signed proof after the first review.</p>
        </div>
        <form class="stack" data-form="import-proof" data-challenge-id="${escapeHtml(challenge.id)}">
          <label>Paste proof<textarea name="proofJson" rows="5" placeholder="Paste copied M2I proof or envelope JSON"></textarea></label>
          <button type="submit" class="secondary">Import late proof</button>
          <p class="fineprint">Imported proofs stay local on this device. After importing, the final review updates automatically.</p>
        </form>
      </section>
      ${importedProofs.length ? renderImportedProofs(importedProofs) : ''}
      <button class="ghost" data-action="home">Back</button>
    </section>`);
}

function renderFinalReviewEnvelopeActions(settlement) {
  const paymentRequests = settlement.payment_due === true ? settlement.paymentRequests || [] : [];
  const completed = completedParticipantLabels(settlement);
  const missing = missingParticipantLabels(settlement);
  const groupUpdate = formatGroupUpdate(settlement);
  return `
    <section class="payment-card">
      <p class="eyebrow">Final review</p>
      <h3>${settlement.payment_due ? '💸 Payment due' : '✅ No payment due'}</h3>
      <div class="review-summary">
        <p><strong>🏁 Result:</strong> ${escapeHtml(settlement.challenge_result || 'unknown')}</p>
        <p><strong>✅ Complete:</strong> ${escapeHtml(completed.length ? completed.join(', ') : 'none yet')}</p>
        ${missing.length ? `<p><strong>⏳ Missing:</strong> ${escapeHtml(missing.join(', '))}</p>` : ''}
        <p><strong>🔐 Proofs:</strong> ${settlement.signed_claims?.length || 0} signed workout proof${settlement.signed_claims?.length === 1 ? '' : 's'}</p>
      </div>
      <p>${escapeHtml(settlement.payment_reason || 'Final review completed.')}</p>
      ${settlement.payment_due === true ? renderSettlementStatusCard(settlement) : ''}
      <div class="copy-preview">
        <p class="eyebrow">Group overview</p>
        <pre>${escapeHtml(groupUpdate)}</pre>
      </div>
      <div class="actions-row">
        <button class="primary" data-action="share-group-update">📤 Share group update</button>
        <button class="secondary" data-action="copy-group-update">📋 Copy group update</button>
        ${settlement.payment_due === true ? '<button class="secondary" data-action="share-payment-instructions">📤 Share payment instructions</button><button class="secondary" data-action="copy-payment-instructions">💸 Copy payment instructions</button>' : ''}
      </div>
      ${settlement.payment_due === true ? renderWalletPaymentOptions(paymentRequests) : ''}
      <details class="advanced-proof">
        <summary>Advanced proof records</summary>
        <div class="actions-row">
          <button class="secondary" data-action="copy-outcome-envelope">🔐 Copy machine proof</button>
        </div>
        ${paymentRequests.length ? paymentRequests.map((request, index) => `
          <div class="manual-record">
            <p><strong>${escapeHtml(formatPaymentRequestTitle(request))}</strong></p>
            <div class="actions-row">
              <button class="secondary" data-action="copy-payment-request-envelope" data-payment-index="${index}">Copy payment request proof</button>
              <button class="secondary" data-action="copy-receipt-envelope" data-payment-index="${index}">Copy manual receipt proof</button>
            </div>
          </div>`).join('') : ''}
        ${settlement.payment_due === true && !paymentRequests.length ? `
          <div class="actions-row">
            <button class="secondary" data-action="copy-payment-request-envelope">Copy payment request proof</button>
            <button class="secondary" data-action="copy-receipt-envelope">Copy manual receipt proof</button>
          </div>` : ''}
      </details>
      <p class="fineprint">Group update and payment instructions are readable summaries. Advanced proof records are for verification/import. Users pay from their own wallets outside M2I; M2I does not hold funds, pay automatically, or monitor settlement.</p>
    </section>`;
}

function renderSettlementStatusCard(settlement) {
  const active = settlementStatusOption(settlement.local_settlement_status?.status || 'open');
  const updatedAt = settlement.local_settlement_status?.updatedAt;
  return `
    <section class="settlement-status-card">
      <div>
        <p class="eyebrow">Manual settlement</p>
        <h3>${escapeHtml(active.emoji)} ${escapeHtml(active.label)}</h3>
        <p class="muted">This status is local to this device until you copy or share the group update. M2I does not watch wallets or publish reputation automatically.</p>
        ${updatedAt ? `<p class="fineprint">Updated: ${escapeHtml(new Date(updatedAt).toLocaleString())}</p>` : ''}
      </div>
      <div class="status-actions">
        ${SETTLEMENT_STATUS_OPTIONS.map((option) => `<button class="${option.value === active.value ? 'primary' : 'secondary'}" data-action="mark-settlement-status" data-settlement-status="${escapeHtml(option.value)}">${escapeHtml(option.emoji)} ${escapeHtml(option.label)}</button>`).join('')}
      </div>
      <p class="fineprint">Use this after the group reviews proof or receipts: still open, settled, settled late, or waived by group agreement.</p>
    </section>`;
}

function renderWalletPaymentOptions(paymentRequests = []) {
  const options = paymentRequests
    .map((request, index) => ({ request, index }))
    .filter(({ request }) => request?.payment_uri);
  if (!options.length) return '';
  return `
    <section class="wallet-options">
      <p class="eyebrow">Wallet options</p>
      <h3>Open prefilled payment</h3>
      <p class="muted">These links ask your own wallet to prefill the recipient, amount, and memo where supported. You still review and send manually.</p>
      ${options.map(({ request, index }) => `
        <div class="wallet-option">
          <div>
            <strong>${escapeHtml(formatPaymentRequestTitle(request))}</strong>
            <span>${escapeHtml(request.network ? request.network.toUpperCase() : "manual")}</span>
          </div>
          <a class="secondary wallet-link" href="${escapeHtml(request.payment_uri)}">Open wallet</a>
          <button class="secondary" data-action="copy-settlement-payment-uri" data-payment-index="${index}">Copy wallet link</button>
        </div>`).join('')}
      <p class="fineprint">If no wallet opens, copy the wallet link or use the payment instructions in your wallet manually.</p>
    </section>`;
}

function renderJoinStatus(challenge, join) {
  if (join) {
    const name = join.participant?.displayName || join.participant?.npub || 'You';
    return `<section class="join-card"><p><strong>${escapeHtml(name)}</strong> joined this challenge on ${new Date(join.joinedAt).toLocaleString()}.</p></section>`;
  }
  const profile = store.getProfile();
  const rosterOptions = challenge.participants.length
    ? `<label>I am<select name="participantId" required><option value="">Choose participant...</option>${challenge.participants.map((participant) => `<option value="${escapeHtml(participant.id)}">${escapeHtml(participant.displayName)}</option>`).join('')}<option value="__custom">Add myself</option></select></label>`
    : '';
  return `<section class="join-card stack">
    <p>You have not joined this challenge on this device. Join with a name so the group can match your proof to you.</p>
    <form class="stack" data-form="join-challenge" data-challenge-id="${escapeHtml(challenge.id)}">
      ${rosterOptions}
      <label>Display name${challenge.participants.length ? ', if not listed' : ''}<input name="displayName" maxlength="60" value="${escapeHtml(profile.displayName || '')}" placeholder="Alex" ${challenge.participants.length ? '' : 'required'}></label>
      <button type="submit" class="secondary">Join as this person</button>
    </form>
  </section>`;
}

function renderImportedProofs(importedProofs) {
  if (!importedProofs.length) return '<p class="muted">No imported proofs yet.</p>';
  return `
    <section class="stack">
      <h3>Imported proofs</h3>
      ${importedProofs.map((proof) => `
        <article class="history-item">
          <div><strong>${escapeHtml(proof.summary?.label || 'Imported proof')}</strong><span>${new Date(proof.importedAt).toLocaleString()}</span></div>
          <span>${escapeHtml(importedProofTypeLabel(proof))}</span>
        </article>`).join('')}
    </section>`;
}

function importedProofTypeLabel(proof) {
  if (proof.format !== 'm2i-envelope') return 'Copied challenge proof';
  const summary = proof.summary || {};
  if (summary.kind === 'outcome') return `Outcome · ${summary.result || 'unknown'} · ${summary.paymentDue === true ? 'payment due' : summary.paymentDue === false ? 'no payment due' : 'pending'}`;
  if (summary.kind === 'payment-request') return `Payment request · ${summary.paymentDue === true ? 'manual payment due' : 'not due'}`;
  if (summary.kind === 'receipt') return summary.paymentRequestHash ? 'Manual receipt · linked request' : 'Manual receipt';
  if (summary.kind === 'join') return 'Join record';
  if (summary.kind === 'challenge') return 'Challenge rules';
  if (summary.kind === 'claim') return 'Workout claim';
  return 'M2I envelope';
}

function renderChallengePaymentSummary(challenge) {
  if (!challenge.paymentRequests?.length) return '<p class="fineprint">No stake configured.</p>';
  return `<section class="payment-card"><p class="eyebrow">Missed-challenge stake</p>${challenge.paymentRequests.map((request) => `<p>${request.asset === 'USDt' ? `Stake if missed: ${request.amount.toFixed(2)} USDt on ${request.network.toUpperCase()}` : `Stake if missed: ${request.amount_sats || 'Sats'} sats / ${request.network}`}</p>`).join('')}<p class="fineprint">Only due if the challenge is missed after final review. Valid challenge workouts require time plus accepted local GPS aggregate movement; route points stay private. If the challenge is complete, no payment is due. M2I never holds funds, pays automatically, or monitors settlement.</p></section>`;
}

function completedParticipantLabels(settlement) {
  const participantProgress = settlement.progress?.participantProgress || [];
  if (participantProgress.length) return participantProgress.filter((participant) => participant.isComplete).map(participantLabel);
  return claimLabels(settlement.signed_claims || []);
}

function missingParticipantLabels(settlement) {
  return (settlement.progress?.participantProgress || []).filter((participant) => !participant.isComplete).map(participantLabel);
}

function settlementStatusOption(value) {
  return SETTLEMENT_STATUS_OPTIONS.find((option) => option.value === value) || SETTLEMENT_STATUS_OPTIONS[0];
}

function attachLocalSettlementStatus(settlement) {
  if (!settlement?.challenge?.id) return settlement;
  const stored = store.getSettlementStatus(settlement.challenge.id);
  return {
    ...settlement,
    local_settlement_status: stored || {
      challengeId: settlement.challenge.id,
      status: 'open',
      updatedAt: null
    }
  };
}

function proofSettlement(settlement) {
  if (!settlement || !('local_settlement_status' in settlement)) return settlement;
  const { local_settlement_status: _localSettlementStatus, ...clean } = settlement;
  return clean;
}

function participantLabel(participant) {
  return participant.displayName || participant.npub || participant.id || 'participant';
}

function claimLabels(signedClaims) {
  return signedClaims.map((proof) => {
    const claim = claimFromPrivateSettlement(proof);
    return claim?.claimant_display_name || shortNpub(claim?.claimant_npub || '') || 'signed proof';
  });
}

function claimFromPrivateSettlement(proof) {
  try {
    const content = proof?.signed_event?.content;
    return content ? JSON.parse(content) : null;
  } catch {
    return null;
  }
}

function formatGroupUpdate(settlement) {
  const challenge = settlement.challenge || {};
  const completed = completedParticipantLabels(settlement);
  const missing = missingParticipantLabels(settlement);
  const lines = [
    '🏁 Move2Improve final review',
    'Challenge: ' + (challenge.code || 'unknown'),
    'Result: ' + (settlement.challenge_result || 'unknown'),
    '✅ Complete: ' + (completed.length ? completed.join(', ') : 'none yet'),
    missing.length ? '⏳ Missing: ' + missing.join(', ') : '',
    'Payment: ' + (settlement.payment_due ? 'due 💸' : settlement.payment_due === false ? 'not due ✅' : 'pending final review'),
    settlement.payment_due === true ? settlementStatusOption(settlement.local_settlement_status?.status || 'open').groupLine : '',
    settlement.payment_reason ? 'Reason: ' + settlement.payment_reason : '',
    '🔐 Signed workout proofs: ' + (settlement.signed_claims?.length || 0),
    'Machine proof: copy Advanced proof records for full verification',
    'Built for repeated games.',
    "When you know you'll meet again tomorrow, cooperation becomes the dominant strategy. Not kindness. Not idealism. Pure math.",
    'M2I does not hold funds, pay automatically, or monitor settlement.'
  ];
  return lines.filter(Boolean).join(String.fromCharCode(10));
}

function formatPaymentInstructions(settlement) {
  const challenge = settlement.challenge || {};
  const missing = missingParticipantLabels(settlement);
  const requests = settlement.paymentRequests || [];
  const names = missing.length ? missing.join(', ') : 'the missing participant';
  const lines = [
    '💸 Move2Improve stake settlement',
    '',
    'Challenge: ' + (challenge.code || 'unknown'),
    'Who needs to settle: ' + names,
    'Why: Challenge was missed after final review.',
    settlement.payment_due === true ? settlementStatusOption(settlement.local_settlement_status?.status || 'open').instructionLine : '',
    ''
  ];
  if (!settlement.payment_due) {
    lines.push('✅ No payment is due for this challenge.');
  } else if (requests.length) {
    lines.push('Please send the agreed stake to the team jar:');
    requests.forEach((request, index) => {
      lines.push('', 'Option ' + (index + 1) + ':', request.request_text || formatPaymentRequestTitle(request));
      if (request.payment_uri) lines.push('Wallet link: ' + request.payment_uri);
    });
  } else {
    lines.push(
      'Next step:',
      'The group still needs to choose a team jar / recipient before anyone pays.',
      '',
      'Recommended:',
      '1. Agree one team jar address in this chat.',
      '2. The missing participant sends the agreed stake manually.',
      '3. Share a receipt or transaction link back here.',
      '4. The group can then mark it settled or settled late.'
    );
  }
  lines.push('', 'Built for repeated games.');
  lines.push("When you know you'll meet again tomorrow, cooperation becomes the dominant strategy. Not kindness. Not idealism. Pure math.");
  lines.push('', 'M2I note: manual settlement only. M2I never holds funds, pays automatically, or monitors settlement.');
  return lines.filter((line, index, arr) => line !== '' || arr[index - 1] !== '').join(String.fromCharCode(10));
}

function formatPaymentRequestTitle(request) {
  if (!request) return 'Manual payment record';
  if (request.asset === 'USDt') return `${request.amount.toFixed(2)} USDt on ${request.network.toUpperCase()}`;
  if (request.asset === 'sats') return `${request.amount_sats || 'Sats'} sats / ${request.network || 'manual'}`;
  return request.asset || 'Manual payment record';
}

function renderWorkoutScreen() {
  const isBurpee = state.activeWorkout.activityType === 'burpees';
  renderShell(`
    <section class="workout-screen">
      <p class="eyebrow">${escapeHtml(state.activeWorkout.challengeCode)}${isBurpee ? ' · burpees' : ''}</p>
      <div class="timer" data-elapsed>${formatDuration(elapsedMs(state.activeWorkout))}</div>
      <div class="target" data-target-status></div>
      ${state.activeWorkout.gpsEnabled ? `
        <div class="target distance" data-distance-status>Waiting for local GPS estimate...</div>
        <div class="gps-details" data-gps-details></div>
      ` : ''}
      ${isBurpee ? '<p class="fineprint">Full window recommended. Finish opens the reps prompt.</p>' : ''}
      <button class="danger" data-action="finish">${isBurpee ? 'Finish burpee round' : 'Finish challenge'}</button>
    </section>`);
  startTimer();
  updateWorkoutClock();
}

function renderClaimScreen(entry) {
  if (!entry) return renderHomeScreen();
  const settlement = entry.privateSettlement || { settlement_model: 'manual-private-settlement', signed_event: entry.event };
  const json = JSON.stringify(settlement, null, 2);
  const distance = entry.claim.distance_km !== undefined ? `<span>${entry.claim.distance_km.toFixed(3)} km estimate</span>` : '';
  const reps = isBurpeeClaim(entry.claim) ? `<span>${entry.claim.rep_count} burpees (self-attested)</span>` : '';
  const gpsOutcome = renderClaimGpsOutcome(entry.claim);
  renderShell(`
    <section class="panel stack">
      <h2>Signed claim</h2>
      <p class="muted">Challenge proof includes your signed workout claim, local progress, final review status, and any manual stake details. Share it only with your group or organizer. Public Nostr sharing is separate and redacted.</p>
      <div class="claim-summary"><strong>${escapeHtml(entry.challengeCode)}</strong><span>${entry.durationHuman}</span>${reps}${distance}<span>Kind ${CLAIM_KIND}</span></div>
      ${isBurpeeClaim(entry.claim) ? '<p class="fineprint">Signed self-attestation. The receipt proves who claimed what and when. It does not prove the movement objectively happened.</p>' : ''}
      ${gpsOutcome}
      <textarea class="json-output" readonly rows="10">${escapeHtml(json)}</textarea>
      <button class="primary" data-action="copy-event">Copy challenge proof</button>
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
      ? `${paymentRequest.amount_sats ? `${paymentRequest.amount_sats} sats` : 'Sats'} stake if missed`
      : `${paymentRequest.amount.toFixed(2)} USDt stake if missed`;
    const rows = [
      ['Asset', paymentRequest.asset],
      ['Amount', isSats ? (paymentRequest.amount_sats ? `${paymentRequest.amount_sats} sats` : 'Sats amount not specified') : `${paymentRequest.amount.toFixed(2)} USDt`],
      ['Network', paymentRequest.network ? paymentRequest.network.toUpperCase() : 'manual'],
      ['Team jar / recipient', paymentRequest.recipient || 'See instructions'],
      ['Payment URI', paymentRequest.payment_uri || 'None provided'],
      ['Reference', paymentRequest.reference],
      ['Instructions', paymentRequest.instruction],
      ['Model', 'Manual stake only. Due only if final review says missed.']
    ];
    return `
    <section class="payment-card">
      <p class="eyebrow">${isSats ? 'Sats / Lightning team jar stake' : 'USDt stake if missed'}</p>
      <h3>${title}</h3>
      <dl>
        ${rows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
      </dl>
      <textarea class="json-output" readonly rows="5">${escapeHtml(paymentRequest.request_text)}</textarea>
      <button class="primary" data-action="copy-payment" data-payment-index="${index}">Copy stake instructions</button>
      ${paymentRequest.payment_uri ? `<button class="secondary" data-action="copy-payment-uri" data-payment-index="${index}">Copy wallet URI</button>` : ''}
      <p class="fineprint">Only due if final review says this challenge was missed. Your wallet executes any payment manually. M2I never holds funds, pays automatically, or monitors settlement.</p>
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
      <label>Relay list<textarea data-relays rows="5">${store.getRelays().join(String.fromCharCode(10))}</textarea></label>
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

function activeChallengeSettlement() {
  const challenge = normalizeChallengePaymentRequests(store.getChallenge(state.activeChallengeId));
  if (!challenge) return null;
  const history = store.getHistory();
  const importedProofs = store.getImportedProofs(challenge.id);
  const importedEntries = importedProofClaimEntries(importedProofs);
  const progress = computeChallengeProgress(challenge, [...history, ...importedEntries]);
  return attachLocalSettlementStatus(createChallengeSettlement({ challenge, history, importedProofs, progress }));
}

function localReceiptMarker() {
  const profile = store.getProfile();
  return {
    displayName: profile.displayName || '',
    npub: state.key?.npub || ''
  };
}

function createJoinParticipant(form, challenge) {
  const data = new FormData(form);
  const selectedId = clampText(data.get('participantId'), 120);
  const typedName = clampText(data.get('displayName'), 60);
  const rosterParticipant = selectedId && selectedId !== '__custom'
    ? challenge.participants.find((participant) => participant.id === selectedId)
    : null;
  const displayName = rosterParticipant?.displayName || typedName;
  if (!displayName) throw new Error('Choose or enter your name before joining.');
  const localId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'participant';
  return {
    id: rosterParticipant?.id || 'local-' + localId,
    displayName,
    npub: state.key?.npub || ''
  };
}

function paymentRequestEnvelopeForSettlement(settlement, index = 0) {
  const cleanSettlement = proofSettlement(settlement);
  const request = cleanSettlement.paymentRequests?.[index] || cleanSettlement.paymentRequests?.[0] || null;
  return createPaymentRequestEnvelope({ settlement: cleanSettlement, request });
}

function gpsSettingsInstructions() {
  return 'Check iPhone Settings > Safari > Location, allow While Using, and enable Precise Location. Also check this browser page permissions and allow Location if your browser shows a site permission control.';
}

function gpsPreflightErrorMessage(error) {
  if (!window.isSecureContext) return `Location needs HTTPS or localhost. ${gpsSettingsInstructions()}`;
  if (!('geolocation' in navigator)) return `This browser does not expose Location services. ${gpsSettingsInstructions()}`;
  if (error?.code === 1) return `Location permission was denied. ${gpsSettingsInstructions()}`;
  if (error?.code === 2) return `Location is unavailable right now. Move outside, enable Location Services, then try again. ${gpsSettingsInstructions()}`;
  if (error?.code === 3) return `Location test timed out. Move outside with a clear sky view, then try again. ${gpsSettingsInstructions()}`;
  return `Location test failed. ${gpsSettingsInstructions()}`;
}

function gpsPreflightClass(status) {
  if (status === 'ready') return 'notice';
  if (status === 'failed') return 'gps-claim gps-claim-warning';
  if (status === 'checking') return 'muted';
  return 'fineprint';
}

function renderGpsReadiness() {
  const preflight = state.gpsPreflight || { status: 'idle', message: 'Not tested on this device yet.' };
  const disabled = preflight.status === 'checking' ? ' disabled' : '';
  const label = preflight.status === 'checking' ? 'Testing GPS...' : 'Enable / test GPS';
  return `
    <section class="stack">
      <p class="eyebrow">Location readiness</p>
      <p class="${gpsPreflightClass(preflight.status)}">${escapeHtml(preflight.message)}</p>
      <button type="button" class="secondary" data-action="test-gps"${disabled}>${label}</button>
      <p class="fineprint">No route is stored or uploaded; M2I only keeps aggregate distance for the local workout claim. Route points stay in memory and are discarded at finish.</p>
    </section>`;
}

function testGpsReadiness() {
  if (!window.isSecureContext || !('geolocation' in navigator)) {
    setState({ gpsPreflight: { status: 'failed', message: gpsPreflightErrorMessage() } });
    return;
  }
  setState({ gpsPreflight: { status: 'checking', message: 'Requesting a high-accuracy location fix from this browser...' } });
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const accuracy = Math.round(position.coords?.accuracy || 0);
      const detail = accuracy ? ` Accuracy was about ${accuracy}m.` : '';
      setState({ gpsPreflight: { status: 'ready', message: `GPS permission is ready for this page.${detail}` } });
    },
    (error) => {
      setState({ gpsPreflight: { status: 'failed', message: gpsPreflightErrorMessage(error) } });
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
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
    const join = store.getChallengeJoin(challenge.id);
    if (!join?.participant?.displayName) return setState({ message: 'Join this challenge with your name before starting a workout.' });
    if (window.confirm('Start workout for this challenge?')) await beginWorkout(form, challenge);
  }
  if (form.matches('[data-form="join-challenge"]')) {
    const challenge = store.getChallenge(form.dataset.challengeId);
    if (!challenge) return setState({ message: 'Challenge not found.' });
    try {
      const participant = createJoinParticipant(form, challenge);
      const joinedAt = Date.now();
      store.setProfile({ displayName: participant.displayName });
      store.saveChallengeJoin({
        challengeId: challenge.id,
        participant,
        joinedAt,
        envelope: createJoinEnvelope({ challenge, participant, createdAt: joinedAt })
      });
      setState({ activeChallengeId: challenge.id, screen: 'challenge', message: 'Joined locally as ' + participant.displayName + '.' });
    } catch (error) {
      setState({ message: error.message });
    }
  }
  if (form.matches('[data-form="import-proof"]')) {
    const challenge = store.getChallenge(form.dataset.challengeId);
    if (!challenge) return setState({ message: 'Challenge not found.' });
    try {
      const data = new FormData(form);
      const proof = createImportedProofRecord(data.get('proofJson'), { challengeId: challenge.id });
      store.saveImportedProof(proof);
      const label = proof.summary?.label || 'Imported proof';
      const match = proof.challengeId === challenge.id ? '' : ' Warning: this proof belongs to another challenge.';
      setState({ activeChallengeId: challenge.id, screen: 'challenge', message: 'Imported: ' + label + '.' + match });
    } catch (error) {
      setState({ message: error.message });
    }
  }
});

app.addEventListener('change', (event) => {
  if (event.target.matches('[data-action="backup-toggle"]')) setState({ backupConfirmed: event.target.checked });
  if (event.target.matches('[data-activity-toggle]')) toggleActivityFields(event.target.form);
});

function toggleActivityFields(form) {
  if (!form) return;
  const value = form.elements.namedItem('activityType')?.value;
  const isBurpee = value === 'burpees';
  form.querySelectorAll('[data-movement-fields]').forEach((node) => {
    node.hidden = isBurpee;
  });
  form.querySelectorAll('[data-burpee-fields]').forEach((node) => {
    node.hidden = !isBurpee;
  });
  const movementHint = form.querySelector('[data-activity-hint-movement]');
  const burpeeHint = form.querySelector('[data-activity-hint-burpees]');
  if (movementHint) movementHint.hidden = isBurpee;
  if (burpeeHint) burpeeHint.hidden = !isBurpee;
}

app.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'test-gps') testGpsReadiness();
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
    const challenge = normalizeChallengePaymentRequests(store.getChallenge(state.activeChallengeId));
    if (challenge) copy(createInviteText(challenge, appBaseUrl()));
  }
  if (action === 'copy-challenge-settlement') {
    const settlement = activeChallengeSettlement();
    if (settlement) copy(JSON.stringify(proofSettlement(settlement), null, 2));
  }
  if (action === 'copy-group-update') {
    const settlement = activeChallengeSettlement();
    if (settlement) copy(formatGroupUpdate(settlement));
  }
  if (action === 'share-group-update') {
    const settlement = activeChallengeSettlement();
    if (settlement) await shareText({ title: 'Move2Improve final review', text: formatGroupUpdate(settlement) });
  }
  if (action === 'copy-payment-instructions') {
    const settlement = activeChallengeSettlement();
    if (settlement) copy(formatPaymentInstructions(settlement));
  }
  if (action === 'mark-settlement-status') {
    const settlement = activeChallengeSettlement();
    const status = event.target.closest('[data-action]')?.dataset.settlementStatus;
    const option = settlementStatusOption(status);
    if (settlement?.challenge?.id) {
      store.saveSettlementStatus({ challengeId: settlement.challenge.id, status: option.value, updatedAt: Date.now() });
      setState({ screen: 'challenge', message: 'Settlement marked: ' + option.label + '.' });
    }
  }
  if (action === 'copy-settlement-payment-uri') {
    const settlement = activeChallengeSettlement();
    const index = Number(event.target.closest('[data-action]')?.dataset.paymentIndex || 0);
    const request = settlement?.paymentRequests?.[index];
    if (request?.payment_uri) copy(request.payment_uri);
  }
  if (action === 'share-payment-instructions') {
    const settlement = activeChallengeSettlement();
    if (settlement) await shareText({ title: 'Move2Improve payment instructions', text: formatPaymentInstructions(settlement) });
  }
  if (action === 'copy-outcome-envelope') {
    const settlement = activeChallengeSettlement();
    if (settlement) copy(JSON.stringify(createOutcomeEnvelope({ settlement: proofSettlement(settlement) }), null, 2));
  }
  if (action === 'copy-payment-request-envelope') {
    try {
      const settlement = activeChallengeSettlement();
      if (!settlement) return;
      const index = Number(event.target.closest('[data-action]')?.dataset.paymentIndex || 0);
      copy(JSON.stringify(paymentRequestEnvelopeForSettlement(settlement, index), null, 2));
    } catch (error) {
      setState({ message: error.message });
    }
  }
  if (action === 'copy-receipt-envelope') {
    try {
      const settlement = activeChallengeSettlement();
      if (!settlement) return;
      const target = event.target.closest('[data-action]');
      const index = Number(target?.dataset.paymentIndex || 0);
      const paymentRequestEnvelope = settlement.payment_due === true
        ? paymentRequestEnvelopeForSettlement(settlement, index)
        : null;
      const receipt = createReceiptEnvelope({
        settlement: proofSettlement(settlement),
        paymentRequestEnvelope,
        markedBy: localReceiptMarker(),
        note: 'Marked manually after group review.'
      });
      copy(JSON.stringify(receipt, null, 2));
    } catch (error) {
      setState({ message: error.message });
    }
  }
  if (action === 'open-claim') {
    const claimId = event.target.closest('[data-action]')?.dataset.claimId;
    const entry = store.getHistory().find((item) => item.id === claimId);
    setState({ lastSigned: entry, publishResults: entry?.published || [], screen: 'claim', message: '' });
  }
  if (action === 'history') setState({ screen: 'history', message: '' });
  if (action === 'home') setState({ screen: 'home', message: '' });
  if (action === 'settings') setState({ screen: 'settings', message: '' });
  if (action === 'board') setState({ screen: 'board', message: '' });
  if (action === 'challenge') setState({ screen: 'challenge', message: '' });
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
