/**
 * Board Share — Manual export/import of buddy proofs.
 *
 * Privacy principle: nothing leaves the device except by explicit user action.
 * Both directions (Export + Import) require a button click by the user.
 *
 * Export format v1:
 *   {
 *     "m2i_share": "buddy-update",
 *     "version": 1,
 *     "challengeCode": "M2I-XXXX",
 *     "sharedAt": <epoch_ms>,
 *     "claims": [ <signed nostr event>, ... ]
 *   }
 *
 * The receiver's PWA parses this, verifies signatures (via existing envelope
 * code), and stores accepted claims as importedProofs.
 */

const SHARE_MARKER = 'm2i_share';
const SHARE_VERSION = 1;

/**
 * Build a shareable export string for the current user's claims in a challenge.
 * Only includes claims linked to the given challenge.
 */
export function buildShareExport({ challenge, history = [], ownNpub = '', ownDisplayName = '' }) {
  if (!challenge) return null;
  const linked = history.filter((entry) => {
    const claim = entry?.claim;
    if (!claim) return false;
    return claim.challenge_id === challenge.id || entry.challengeId === challenge.id;
  });
  const ownEntries = linked.filter((entry) => {
    const claim = entry?.claim;
    if (!claim) return false;
    if (ownNpub && claim.claimant_npub === ownNpub) return true;
    if (ownDisplayName && String(claim.claimant_display_name || '').trim().toLowerCase() === ownDisplayName.trim().toLowerCase()) return true;
    return false;
  });

  const events = ownEntries
    .map((entry) => entry.event || entry.privateSettlement?.signed_event)
    .filter(Boolean);

  const payload = {
    [SHARE_MARKER]: 'buddy-update',
    version: SHARE_VERSION,
    challengeCode: challenge.code,
    challengeId: challenge.id,
    sharedAt: Date.now(),
    claimant: {
      displayName: ownDisplayName || '',
      npub: ownNpub || ''
    },
    claimCount: events.length,
    claims: events
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Parse an incoming share text and return normalized proofs.
 * Returns { ok, error, proofs, claimant, challengeCode, sharedAt }
 */
export function parseShareImport(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: 'Empty input' };
  }
  let payload;
  try {
    payload = JSON.parse(text.trim());
  } catch (err) {
    return { ok: false, error: 'Not valid JSON: ' + err.message };
  }
  if (payload?.[SHARE_MARKER] !== 'buddy-update') {
    return { ok: false, error: 'Not an M2I buddy-update share' };
  }
  if (payload.version !== SHARE_VERSION) {
    return { ok: false, error: `Unknown share version ${payload.version}` };
  }
  const claims = Array.isArray(payload.claims) ? payload.claims : [];
  if (!claims.length) {
    return { ok: false, error: 'No claims in share' };
  }

  const proofs = claims.map((event, index) => normalizeShareEventToProof(event, {
    challengeId: payload.challengeId,
    challengeCode: payload.challengeCode,
    sharedAt: payload.sharedAt,
    claimant: payload.claimant,
    index
  })).filter(Boolean);

  return {
    ok: true,
    proofs,
    claimant: payload.claimant || null,
    challengeCode: payload.challengeCode || '',
    sharedAt: payload.sharedAt || 0
  };
}

function normalizeShareEventToProof(event, meta) {
  if (!event?.id || !event?.sig || !event?.content) return null;
  const claim = tryParseContent(event.content);
  if (!claim) return null;

  const proofId = event.id;
  return {
    id: proofId,
    challengeId: meta.challengeId || claim.challenge_id || '',
    importedAt: Date.now(),
    source: 'manual-share',
    envelope: {
      payload: {
        historyEntry: {
          event,
          claim
        }
      }
    },
    proof: {
      settlement_model: 'manual-private-settlement',
      signed_event: event
    }
  };
}

function tryParseContent(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;
  try { return JSON.parse(String(content)); } catch { return null; }
}

/**
 * Copy text to clipboard, returns Promise<boolean>.
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // Fallback for insecure contexts
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  document.body.removeChild(el);
  return ok;
}
