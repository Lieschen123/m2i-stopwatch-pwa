/**
 * Board View — DOM renderer.
 *
 * Pure "render this view-model into this container" function.
 * No side effects except DOM mutation of the passed root element.
 * Event handlers are wired via callbacks, so main.js stays in control
 * of storage/state.
 */

import { formatFreshness, formatDay } from './board.js';

/**
 * Render board view-model into a container.
 *
 * @param {HTMLElement} root — target container
 * @param {object} viewModel — from buildBoardViewModel()
 * @param {object} handlers — { onExport(), onImport(text) => Promise<{ok,error,addedCount}> }
 */
export function renderBoard(root, viewModel, handlers = {}) {
  if (!root) return;
  if (!viewModel) {
    root.innerHTML = '<div class="board-empty">No active challenge. Create or join one first.</div>';
    return;
  }

  const {
    challengeCode,
    startsAt,
    endsAt,
    daysElapsed,
    totalDays,
    daysRemaining,
    timeProgressPct,
    requiredActiveDays,
    minMinutesPerActiveDay,
    participants,
    isExpired,
    isComplete,
    settlementForecast
  } = viewModel;

  root.innerHTML = `
    <section class="board" data-challenge-code="${escapeHtml(challengeCode)}">
      <header class="board-header">
        <div class="board-title">
          <h2>Board <span class="board-code">${escapeHtml(challengeCode)}</span></h2>
          <div class="board-meta">
            ${requiredActiveDays} active days × ≥${minMinutesPerActiveDay} min
          </div>
        </div>
        <div class="board-time">
          <div class="board-days">
            Day ${daysElapsed}/${totalDays} · ${daysRemaining} left
          </div>
          <div class="board-timebar">
            <div class="board-timebar-fill" style="width: ${timeProgressPct}%"></div>
          </div>
          <div class="board-dates">
            ${formatDay(startsAt)} → ${formatDay(endsAt)}
          </div>
        </div>
      </header>

      <div class="board-forecast board-forecast--${settlementForecast.status}">
        ${escapeHtml(settlementForecast.text)}
      </div>

      <ul class="board-participants">
        ${participants.map(renderParticipant).join('')}
      </ul>

      <div class="board-actions">
        <button type="button" class="board-btn board-btn--primary" data-board-action="export">
          Share my update
        </button>
        <button type="button" class="board-btn" data-board-action="import-open">
          Import buddy update
        </button>
      </div>

      <div class="board-import" data-board-import hidden>
        <label for="board-import-text" class="board-import-label">
          Paste buddy's share text here:
        </label>
        <textarea
          id="board-import-text"
          class="board-import-textarea"
          rows="6"
          placeholder='{"m2i_share":"buddy-update",...}'
        ></textarea>
        <div class="board-import-actions">
          <button type="button" class="board-btn board-btn--primary" data-board-action="import-submit">
            Import
          </button>
          <button type="button" class="board-btn" data-board-action="import-cancel">
            Cancel
          </button>
        </div>
        <div class="board-import-status" data-board-import-status></div>
      </div>

      <div class="board-footer">
        <div class="board-privacy-note">
          🔒 Board reads only local data. Nothing is shared unless you click "Share my update".
        </div>
        ${isExpired && !isComplete ? '<div class="board-badge board-badge--missed">CHALLENGE MISSED</div>' : ''}
        ${isExpired && isComplete ? '<div class="board-badge board-badge--complete">ALL COMPLETE ✓</div>' : ''}
      </div>
    </section>
  `;

  wireHandlers(root, handlers);
}

function renderParticipant(p) {
  const paceClass = `board-pace--${p.pace.tone}`;
  const freshness = p.isOwn ? 'you (local)' : formatFreshness(p.lastActivityAgeMs);
  const sourceIcon = p.isOwn ? '📱' : (p.source === 'imported' ? '📥' : '⏳');

  return `
    <li class="board-participant ${p.isComplete ? 'board-participant--complete' : ''}">
      <div class="board-participant-row">
        <div class="board-participant-name">
          <span class="board-participant-icon">${sourceIcon}</span>
          <span class="board-participant-display">${escapeHtml(p.displayName)}</span>
          ${p.isOwn ? '<span class="board-participant-you">you</span>' : ''}
        </div>
        <div class="board-participant-count">
          ${p.validActiveDays}/${p.requiredActiveDays}
        </div>
      </div>
      <div class="board-progressbar">
        <div class="board-progressbar-fill ${paceClass}" style="width: ${p.progressPct}%"></div>
      </div>
      <div class="board-participant-meta">
        <span class="board-pace ${paceClass}">${escapeHtml(p.pace.label)}</span>
        <span class="board-participant-freshness">last: ${escapeHtml(freshness)}</span>
      </div>
    </li>
  `;
}

function wireHandlers(root, handlers) {
  root.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-board-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-board-action');
    const importBox = root.querySelector('[data-board-import]');
    const importTextarea = root.querySelector('#board-import-text');
    const importStatus = root.querySelector('[data-board-import-status]');

    if (action === 'export' && typeof handlers.onExport === 'function') {
      const result = await handlers.onExport();
      if (result?.ok) {
        btn.textContent = 'Copied ✓';
        setTimeout(() => { btn.textContent = 'Share my update'; }, 2000);
      } else {
        btn.textContent = 'Copy failed';
        setTimeout(() => { btn.textContent = 'Share my update'; }, 2000);
      }
    }

    if (action === 'import-open') {
      if (importBox) {
        importBox.hidden = false;
        importTextarea?.focus();
      }
    }

    if (action === 'import-cancel') {
      if (importBox) {
        importBox.hidden = true;
        if (importTextarea) importTextarea.value = '';
        if (importStatus) importStatus.textContent = '';
      }
    }

    if (action === 'import-submit' && typeof handlers.onImport === 'function') {
      const text = importTextarea?.value || '';
      if (!text.trim()) {
        if (importStatus) importStatus.textContent = 'Paste something first.';
        return;
      }
      const result = await handlers.onImport(text);
      if (result?.ok) {
        if (importStatus) {
          importStatus.textContent = `Imported ${result.addedCount || 0} claim(s). ✓`;
        }
        if (importTextarea) importTextarea.value = '';
      } else {
        if (importStatus) importStatus.textContent = 'Error: ' + (result?.error || 'import failed');
      }
    }
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
