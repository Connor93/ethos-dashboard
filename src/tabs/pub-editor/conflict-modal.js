import { esc } from '../../utils/helpers.js';
import { SCHEMAS } from './schemas/index.js';

/**
 * Show the conflict resolution modal. Returns a promise that resolves with
 * one of: 'keep-mine' | 'discard-mine' | 'cancel'.
 *
 * @param {string} type      pub type (eif|enf|esf|ecf)
 * @param {Array<object>} mine    the user's edited records
 * @param {Array<object>} theirs  the freshly-fetched server-current records
 * @param {Set<number>} dirtyIds  ids the user actually changed
 */
export function showConflictModal(type, mine, theirs, dirtyIds) {
  return new Promise(resolve => {
    const modal = document.getElementById('pubConflictModal');
    const body = document.getElementById('pubConflictBody');
    const closeBtn = document.getElementById('pubConflictCloseBtn');

    const schema = SCHEMAS[type];
    const theirsById = new Map();
    for (const r of theirs) theirsById.set(r.id, r);

    const dirty = [...dirtyIds];
    let html = '';
    html += `<p class="pub-conflict-summary">Someone else saved <strong>${esc(type.toUpperCase())}</strong> while you were editing. `;
    html += `Below are the ${dirty.length} records you changed, alongside the current server values. `;
    html += `Pick how to resolve.</p>`;
    html += '<div class="pub-conflict-table-wrap"><table class="pub-conflict-table"><thead><tr>';
    html += '<th>ID</th><th>Field</th><th>Your value</th><th>Server value</th>';
    html += '</tr></thead><tbody>';

    let rowsRendered = 0;
    for (const id of dirty) {
      const mineRec = mine.find(r => r.id === id);
      const theirsRec = theirsById.get(id);
      if (!mineRec) continue;

      // Compare every field — only show rows where they actually diverge.
      for (const field of schema.fields) {
        const m = mineRec[field.key];
        const t = theirsRec ? theirsRec[field.key] : '(deleted by them)';
        if (theirsRec && m === t) continue;
        rowsRendered++;
        html += '<tr>';
        html += `<td>${id}</td>`;
        html += `<td>${esc(field.label)}</td>`;
        html += `<td class="pub-conflict-mine">${esc(String(m))}</td>`;
        html += `<td class="pub-conflict-theirs">${esc(String(t ?? '(missing)'))}</td>`;
        html += '</tr>';
      }
    }
    if (rowsRendered === 0) {
      html += '<tr><td colspan="4">No field-level conflicts on the records you changed — your edits are compatible with the server\'s state.</td></tr>';
    }
    html += '</tbody></table></div>';

    html += '<div class="pub-conflict-actions">';
    html += '<button class="audit-btn fresh" id="pubConflictDiscardMine">Discard my changes (use server)</button>';
    html += '<button class="audit-btn run"   id="pubConflictKeepMine">Overwrite server with mine</button>';
    html += '<button class="alert-deny-btn"  id="pubConflictCancel">Cancel — keep editing</button>';
    html += '</div>';

    body.innerHTML = html;
    modal.style.display = '';

    function cleanup(decision) {
      modal.style.display = 'none';
      modal.removeEventListener('click', overlayHandler);
      resolve(decision);
    }
    function overlayHandler(e) { if (e.target === modal) cleanup('cancel'); }
    modal.addEventListener('click', overlayHandler);
    closeBtn.onclick = () => cleanup('cancel');
    document.getElementById('pubConflictDiscardMine').onclick = () => cleanup('discard-mine');
    document.getElementById('pubConflictKeepMine').onclick = () => cleanup('keep-mine');
    document.getElementById('pubConflictCancel').onclick = () => cleanup('cancel');
  });
}
