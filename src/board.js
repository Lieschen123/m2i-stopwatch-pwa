/**
 * Board — Coordination Layer V1 (Manual-Share)
 *
 * Renders a per-participant progress view for a challenge, based on
 * locally-held signed claims + imported buddy proofs.
 *
 * Privacy principle: "Wir teilen keine Daten, die jemand nicht selber teilt."
 * - Board reads ONLY from local storage (own claims + imported proofs)
 * - No network calls except when user explicitly clicks "Export" (clipboard)
 *   or "Import" (paste zone)
 * - Freshness timestamp comes from local storage — Board never lies about
 *   knowing what a buddy is doing right now
 *
 * See docs/COORDINATION-V1-SPEC.md for the full design.
 */

import { computeChallengeProgress, importedProofClaimEntries } from './challenge.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build a board view-model for a challenge.
 * Pure function: no side effects, easy to test.
 */
export function buildBoardViewModel({
  challenge,
  history = [],
  importedProofs = [],
  ownNpub = '',
  ownDisplayName = '',
  now = Date.now()
}) {
  if (!challenge) return null;

  const importedEntries = importedProofClaimEntries(importedProofs);
  const allEntries = [...history, ...importedEntries];
  const progress = computeChallengeProgress(challenge, allEntries, now);

  const totalDays = Math.max(1, Math.round((challenge.endsAt - challenge.startsAt) / DAY_MS));
  const daysElapsed = Math.min(totalDays, Math.max(0, Math.ceil((now - challenge.startsAt) / DAY_MS)));
  const timeProgressPct = Math.round((daysElapsed / totalDays) * 100);

  const participants = (progress.participantProgress || []).map((p) => {
    const isOwn = matchesOwn(p, ownNpub, ownDisplayName);
    const source = isOwn ? 'local' : findLatestProofSource(p, importedProofs);
    const lastActivity = findLastActivityForParticipant(p, allEntries);
    const lastActivityAgeMs = lastActivity ? now - lastActivity : null;
    const progressPct = Math.min(100, Math.round((p.validActiveDays / Math.max(1, p.requiredActiveDays)) * 100));
    const pace = computePace(p.validActiveDays, p.requiredActiveDays, daysElapsed, totalDays);

    return {
      id: p.id,
      displayName: p.displayName || p.npub || p.id || 'participant',
      npub: p.npub,
      isOwn,
      validActiveDays: p.validActiveDays,
      requiredActiveDays: p.requiredActiveDays,
      remainingActiveDays: p.remainingActiveDays,
      isComplete: p.isComplete,
      progressPct,
      source,
      lastActivity,
      lastActivityAgeMs,
      pace
    };
  });

  return {
    challengeCode: challenge.code,
    challengeId: challenge.id,
    startsAt: challenge.startsAt,
    endsAt: challenge.endsAt,
    now,
    totalDays,
    daysElapsed,
    daysRemaining: Math.max(0, totalDays - daysElapsed),
    timeProgressPct,
    requiredActiveDays: challenge.requiredActiveDays,
    minMinutesPerActiveDay: challenge.minMinutesPerActiveDay,
    participants,
    isExpired: progress.isExpired,
    isComplete: progress.isComplete,
    settlementForecast: forecastSettlement(participants, progress.isExpired)
  };
}

function matchesOwn(participant, ownNpub, ownDisplayName) {
  if (!participant) return false;
  const partNpub = String(participant.npub || '').trim();
  const partName = String(participant.displayName || '').trim().toLowerCase();
  const oNpub = String(ownNpub || '').trim();
  const oName = String(ownDisplayName || '').trim().toLowerCase();
  if (partNpub && oNpub && partNpub === oNpub) return true;
  if (partName && oName && partName === oName) return true;
  return false;
}

function findLatestProofSource(participant, importedProofs) {
  if (!Array.isArray(importedProofs) || !importedProofs.length) return 'no-data-yet';
  const partNpub = String(participant.npub || '').trim();
  const partName = String(participant.displayName || '').trim().toLowerCase();
  const matches = importedProofs.filter((proof) => {
    const claim = extractClaim(proof);
    if (!claim) return false;
    const claimNpub = String(claim.claimant_npub || '').trim();
    const claimName = String(claim.claimant_display_name || '').trim().toLowerCase();
    if (partNpub && claimNpub && partNpub === claimNpub) return true;
    if (partName && claimName && partName === claimName) return true;
    return false;
  });
  return matches.length ? 'imported' : 'no-data-yet';
}

function findLastActivityForParticipant(participant, allEntries) {
  const partNpub = String(participant.npub || '').trim();
  const partName = String(participant.displayName || '').trim().toLowerCase();
  let latest = 0;
  for (const entry of allEntries) {
    const claim = entry?.claim;
    if (!claim) continue;
    const claimNpub = String(claim.claimant_npub || '').trim();
    const claimName = String(claim.claimant_display_name || '').trim().toLowerCase();
    const match =
      (partNpub && claimNpub && partNpub === claimNpub) ||
      (partName && claimName && partName === claimName);
    if (!match) continue;
    const ts = claim.stopped_at || entry.stoppedAt || 0;
    if (ts > latest) latest = ts;
  }
  return latest || null;
}

function extractClaim(proof) {
  const privateSettlement = proof?.proof?.settlement_model === 'manual-private-settlement' ? proof.proof : null;
  const event = privateSettlement?.signed_event || proof?.envelope?.payload?.historyEntry?.event || proof?.envelope?.payload?.event;
  const claim = parseSignedClaim(event?.content) || proof?.envelope?.payload?.historyEntry?.claim || proof?.envelope?.payload?.claim;
  return claim || null;
}

function parseSignedClaim(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;
  try { return JSON.parse(String(content)); } catch { return null; }
}

/**
 * Pace = ratio of actual completion vs expected linear pace.
 * Returns { label, tone } where tone ∈ 'ahead'|'on-track'|'behind'|'critical'
 */
function computePace(validActiveDays, requiredActiveDays, daysElapsed, totalDays) {
  if (!totalDays) return { label: 'unknown', tone: 'on-track' };
  const expectedAtNow = (requiredActiveDays * daysElapsed) / totalDays;
  if (validActiveDays >= requiredActiveDays) return { label: 'done', tone: 'ahead' };
  const diff = validActiveDays - expectedAtNow;
  if (diff >= 1.5) return { label: 'ahead of pace', tone: 'ahead' };
  if (diff >= -0.5) return { label: 'on pace', tone: 'on-track' };
  if (diff >= -2) return { label: 'behind pace', tone: 'behind' };
  return { label: 'critical', tone: 'critical' };
}

/**
 * Forecast whether stakes are on track to trigger.
 */
function forecastSettlement(participants, isExpired) {
  if (!participants.length) return { status: 'no-participants', text: 'No participants yet.' };
  const incomplete = participants.filter((p) => !p.isComplete);
  if (!incomplete.length) return { status: 'all-complete', text: 'All complete — no stakes due.' };
  if (isExpired) {
    return {
      status: 'missed',
      text: `Missed: ${incomplete.map((p) => p.displayName).join(', ')} — stakes due to team jar.`,
      missing: incomplete.map((p) => p.displayName)
    };
  }
  const critical = incomplete.filter((p) => p.pace.tone === 'critical');
  if (critical.length) {
    return {
      status: 'at-risk',
      text: `At risk: ${critical.map((p) => p.displayName).join(', ')}.`,
      atRisk: critical.map((p) => p.displayName)
    };
  }
  return { status: 'on-track', text: 'On track. Final review at challenge end.' };
}

/**
 * Format "last update" freshness in a human-readable way.
 * Board must never lie about knowing current state.
 */
export function formatFreshness(ageMs) {
  if (ageMs == null) return 'no shared updates yet';
  const min = Math.floor(ageMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

/**
 * Format a Unix ms timestamp as a compact local date.
 */
export function formatDay(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
