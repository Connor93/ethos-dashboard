import { api, getUsername } from '../../api.js';
import { showToast } from '../../utils/toast.js';
import { showConfirm } from '../../utils/confirm.js';
import { esc } from '../../utils/helpers.js';
import { saveBackup } from '../../utils/backups.js';
import { SCHEMAS, PUB_TYPES } from './schemas/index.js';
import { createRecordList } from './record-list.js';
import { renderRecordEditor, validateRecord } from './record-editor.js';
import { showConflictModal } from './conflict-modal.js';

let initialized = false;
let currentType = 'eif';
const cache = {};        // type -> { hash, records, listCtl }
const dirtyIds = {};     // type -> Set<number>
let presenceTimer = null;
let heartbeatTimer = null;

const HEARTBEAT_INTERVAL_MS = 30_000;
const PRESENCE_POLL_INTERVAL_MS = 15_000;
const SAVE_TIMEOUT_MS = 30_000; // binary write + ReloadPub can take a few seconds on a loaded server

export function initPubEditor() {
  startTimers(currentType);

  if (initialized) return;
  initialized = true;

  const root = document.getElementById('pubEditorRoot');
  root.innerHTML = `
    <div class="pub-toolbar">
      <div class="pub-tabs" id="pubTypeTabs"></div>
      <div class="pub-toolbar-actions">
        <span class="pub-dirty-count" id="pubDirtyCount" hidden></span>
        <button class="cmd-btn" id="pubNewRecordBtn">&#x2795; New</button>
        <button class="cmd-btn" id="pubBackupsBtn">&#x1F551; Backups</button>
        <button class="cmd-btn" id="pubReloadBtn">&#x1F504; Reload</button>
        <button class="cmd-btn" id="pubSaveBtn" disabled>&#x1F4BE; Save changes</button>
      </div>
    </div>
    <div class="pub-presence" id="pubPresence" hidden></div>
    <div class="pub-backups-panel" id="pubBackupsPanel" hidden></div>
    <div class="pub-layout">
      <div class="pub-list-pane">
        <div class="pub-list-toolbar">
          <input type="text" id="pubFilter" placeholder="Filter by name or ID…" />
          <span class="pub-list-count" id="pubListCount"></span>
        </div>
        <div class="pub-list-scroll" id="pubListScroll"></div>
      </div>
      <div class="pub-editor-pane" id="pubEditorPane">
        <div class="pub-editor-empty">Select a record to view details.</div>
      </div>
    </div>
  `;

  renderTypeTabs();
  document.getElementById('pubFilter').addEventListener('input', onFilterChange);
  document.getElementById('pubReloadBtn').addEventListener('click', onReload);
  document.getElementById('pubSaveBtn').addEventListener('click', onSave);
  document.getElementById('pubBackupsBtn').addEventListener('click', toggleBackupsPanel);
  document.getElementById('pubNewRecordBtn').addEventListener('click', onAddNewRecord);
  loadType(currentType);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.tab !== 'pubeditor') stopTimers();
      else startTimers(currentType);
    });
  });
  window.addEventListener('beforeunload', stopTimers);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimers();
    else if (document.querySelector('.nav-item.active')?.dataset.tab === 'pubeditor') {
      startTimers(currentType);
    }
  });
}

function renderTypeTabs() {
  const tabs = document.getElementById('pubTypeTabs');
  let html = '';
  for (const t of PUB_TYPES) {
    const cls = t === currentType ? 'pub-tab active' : 'pub-tab';
    const dirtyMark = dirtyIds[t]?.size ? ` <span class="pub-tab-dirty">●</span>` : '';
    html += `<button class="${cls}" data-type="${t}">${esc(SCHEMAS[t].label)} <span class="pub-tab-key">${t.toUpperCase()}</span>${dirtyMark}</button>`;
  }
  tabs.innerHTML = html;
  tabs.querySelectorAll('.pub-tab').forEach(btn => {
    btn.addEventListener('click', () => switchType(btn.dataset.type));
  });
}

async function switchType(type) {
  if (type === currentType) return;
  // Warn if leaving a type with unsaved edits.
  const dirtyCount = dirtyIds[currentType]?.size || 0;
  if (dirtyCount > 0) {
    const ok = await showConfirm(
      `You have ${dirtyCount} unsaved record(s) in ${currentType.toUpperCase()}. ` +
      `Switching tabs keeps those edits in memory but you'll need to come back and save before reloading.`
    );
    if (!ok) return;
  }
  currentType = type;
  document.getElementById('pubFilter').value = '';
  renderTypeTabs();
  startTimers(type);
  loadType(type);
  // If the backups panel is open, re-render it for the new type. Otherwise
  // it would still be showing the old type's backups, which is confusing.
  const backupsPanel = document.getElementById('pubBackupsPanel');
  if (backupsPanel && !backupsPanel.hidden) {
    renderBackupsPanel();
  }
  // Refresh the presence banner immediately for the new type instead of
  // waiting on the next 15s poll.
  pollPresence(type);
}

async function loadType(type) {
  const scrollEl = document.getElementById('pubListScroll');
  const editorEl = document.getElementById('pubEditorPane');
  scrollEl.innerHTML = '<div class="loading-placeholder">Loading ' + esc(type.toUpperCase()) + '…</div>';
  editorEl.innerHTML = '<div class="pub-editor-empty">Select a record to view details.</div>';

  try {
    const data = await api('/api/pub/read?type=' + encodeURIComponent(type));
    if (!dirtyIds[type]) dirtyIds[type] = new Set();
    cache[type] = { hash: data.hash, records: data.records, listCtl: null };

    const ctl = createRecordList(scrollEl, data.records, dirtyIds[type], (rec) => {
      renderRecordEditor(editorEl, SCHEMAS[type], rec, onRecordEdited);
    });
    cache[type].listCtl = ctl;
    updateCount(ctl);
    refreshSaveButton();

    if (ctl.getActiveId() > 0) {
      const first = data.records.find(r => r.id === ctl.getActiveId());
      if (first) renderRecordEditor(editorEl, SCHEMAS[type], first, onRecordEdited);
    }
  } catch (e) {
    scrollEl.innerHTML = '<div class="pub-error">Failed to load: ' + esc(e.message) + '</div>';
    showToast('Failed to load pub: ' + e.message, 'error');
  }
}

function onRecordEdited(record, fieldKey) {
  // Mark dirty and trigger UI updates. We track at record granularity rather
  // than field — the conflict modal shows field-level diffs separately.
  if (!dirtyIds[currentType]) dirtyIds[currentType] = new Set();
  dirtyIds[currentType].add(record.id);
  cache[currentType]?.listCtl?.refresh();
  refreshSaveButton();
  renderTypeTabs(); // dirty marker on tab
}

function refreshSaveButton() {
  const btn = document.getElementById('pubSaveBtn');
  const counter = document.getElementById('pubDirtyCount');
  const n = dirtyIds[currentType]?.size || 0;
  btn.disabled = n === 0;
  if (n > 0) {
    counter.hidden = false;
    counter.textContent = `${n} unsaved record${n === 1 ? '' : 's'}`;
  } else {
    counter.hidden = true;
  }
}

async function onReload() {
  const dirtyCount = dirtyIds[currentType]?.size || 0;
  if (dirtyCount > 0) {
    const ok = await showConfirm(
      `Reloading will discard ${dirtyCount} unsaved record(s). Continue?`,
      true,
    );
    if (!ok) return;
  }
  dirtyIds[currentType] = new Set();
  refreshSaveButton();
  renderTypeTabs();
  loadType(currentType);
}

function onFilterChange(e) {
  const ctl = cache[currentType]?.listCtl;
  if (!ctl) return;
  ctl.setFilter(e.target.value.trim());
  updateCount(ctl);
}

function updateCount(ctl) {
  const el = document.getElementById('pubListCount');
  const filtered = ctl.getFilteredCount();
  const total = ctl.getTotalCount();
  el.textContent = filtered === total ? `${total} records` : `${filtered} / ${total}`;
}

// ---- Save ----

async function onSave() {
  const type = currentType;
  const c = cache[type];
  if (!c || !dirtyIds[type]?.size) return;

  // Validate every dirty record before sending anything to the server.
  const allErrors = [];
  for (const id of dirtyIds[type]) {
    const rec = c.records.find(r => r.id === id);
    if (!rec) continue;
    const errs = validateRecord(SCHEMAS[type], rec);
    for (const e of errs) allErrors.push(`#${id} ${e.field}: ${e.error}`);
  }
  if (allErrors.length > 0) {
    showToast(`Fix ${allErrors.length} validation error(s) before saving:\n` + allErrors.slice(0, 5).join('\n'), 'error');
    return;
  }

  const saveBtn = document.getElementById('pubSaveBtn');
  saveBtn.disabled = true;
  const originalLabel = saveBtn.innerHTML;
  saveBtn.innerHTML = 'Saving…';

  try {
    // Pre-save snapshot to the shared backup sidecar — independent of the
    // server-side .bak files, so the user can recover their JSON view even
    // if the server save itself succeeds and they later regret it.
    try {
      await saveBackup(`pub/${type}`, JSON.stringify(c.records), getUsername());
    } catch (e) {
      showToast('Pre-save backup failed (continuing): ' + e.message, 'error');
    }

    await doSave(type, c.hash, c.records);
  } catch (e) {
    if (e.status === 409 && e.body?.error === 'conflict') {
      await handleConflict(type, c.records);
    } else if (e.status === 413 && e.body?.error === 'too_many_split_files') {
      showToast(
        `This pub would need ${e.body.chunks_needed} split files but the OG client only loads ` +
        `dat001/002/003. Reduce records or shorten name fields, then save again.`,
        'error',
      );
    } else {
      showToast('Save failed: ' + e.message, 'error');
    }
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalLabel;
    refreshSaveButton();
  }
}

async function doSave(type, baseHash, records) {
  const result = await api('/api/pub/save', {
    method: 'POST',
    timeout: SAVE_TIMEOUT_MS,
    body: { type, base_hash: baseHash, records },
  });
  cache[type].hash = result.new_hash;
  dirtyIds[type] = new Set();
  cache[type].listCtl?.refresh();
  refreshSaveButton();
  renderTypeTabs();
  showToast(`Saved ${type.toUpperCase()} (${result.records_written} records)`, 'success');
}

async function handleConflict(type, mine) {
  // Fetch fresh server state so the user can see what they're conflicting with.
  let theirs;
  try {
    const data = await api('/api/pub/read?type=' + encodeURIComponent(type));
    theirs = data.records;
    // Update our cached hash to whatever the server has now — needed to retry.
    cache[type].hash = data.hash;
  } catch (e) {
    showToast('Could not fetch current server state: ' + e.message, 'error');
    return;
  }

  const decision = await showConflictModal(type, mine, theirs, dirtyIds[type]);
  if (decision === 'cancel') return;

  if (decision === 'discard-mine') {
    // listCtl holds an internal reference to the *old* records array, so we
    // can't just swap cache[type].records and refresh — we have to recreate
    // the list against the fresh data.
    dirtyIds[type] = new Set();
    cache[type].records = theirs;
    const scrollEl = document.getElementById('pubListScroll');
    const editorEl = document.getElementById('pubEditorPane');
    const prevActive = cache[type].listCtl?.getActiveId();
    const ctl = createRecordList(scrollEl, theirs, dirtyIds[type], (rec) => {
      renderRecordEditor(editorEl, SCHEMAS[type], rec, onRecordEdited);
    });
    cache[type].listCtl = ctl;
    if (prevActive > 0) ctl.setActiveId(prevActive);
    updateCount(ctl);
    refreshSaveButton();
    renderTypeTabs();
    const activeId = ctl.getActiveId();
    if (activeId > 0) {
      const fresh = theirs.find(r => r.id === activeId);
      if (fresh) renderRecordEditor(editorEl, SCHEMAS[type], fresh, onRecordEdited);
    }
    showToast('Discarded your edits, loaded current server version.', 'success');
    return;
  }

  if (decision === 'keep-mine') {
    // Retry with the new base hash. This will succeed unless yet another save
    // has landed in the meantime (in which case the user gets the modal again).
    try {
      await doSave(type, cache[type].hash, mine);
    } catch (e) {
      if (e.status === 409 && e.body?.error === 'conflict') {
        await handleConflict(type, mine);
      } else {
        showToast('Retry failed: ' + e.message, 'error');
      }
    }
  }
}

// ---- Presence + Heartbeat ----

function startTimers(type) {
  stopTimers();
  sendHeartbeat(type);
  pollPresence(type);
  heartbeatTimer = setInterval(() => sendHeartbeat(type), HEARTBEAT_INTERVAL_MS);
  presenceTimer = setInterval(() => pollPresence(type), PRESENCE_POLL_INTERVAL_MS);
}

function stopTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (presenceTimer)  { clearInterval(presenceTimer);  presenceTimer  = null; }
}

async function sendHeartbeat(type) {
  try { await api('/api/pub/heartbeat', { method: 'POST', body: { type } }); } catch {}
}

function buildDefaultRecord(schema, id) {
  const rec = { id };
  for (const field of schema.fields) {
    if (field.key === 'id') continue;
    if (field.type === 'string') rec[field.key] = '';
    else if (field.type === 'enum') rec[field.key] = field.values[0] ?? 0;
    else rec[field.key] = 0;
  }
  return rec;
}

function onAddNewRecord() {
  const type = currentType;
  const c = cache[type];
  if (!c) return;
  const schema = SCHEMAS[type];

  // New ID = max existing + 1. The records array is array-index = id for
  // real entries plus a null at index 0, so length is enough most of the time.
  let maxId = 0;
  for (const r of c.records) if (r.id > maxId) maxId = r.id;
  const newId = maxId + 1;

  const rec = buildDefaultRecord(schema, newId);
  rec.name = 'new ' + type + ' ' + newId;
  c.records.push(rec);

  if (!dirtyIds[type]) dirtyIds[type] = new Set();
  dirtyIds[type].add(newId);

  // Tell the list about the new entry; idx in the underlying records array
  // is the last position we just pushed to.
  c.listCtl?.addVisibleRecord(rec, c.records.length - 1);

  // Open the new record in the detail editor and clear any active filter
  // so the user actually sees it (if their filter excludes the placeholder name).
  document.getElementById('pubFilter').value = '';
  c.listCtl?.setFilter('');
  renderRecordEditor(document.getElementById('pubEditorPane'), schema, rec, onRecordEdited);

  refreshSaveButton();
  renderTypeTabs();
  updateCount(c.listCtl);
  showToast(`New ${type.toUpperCase()} record at id ${newId} — edit fields and Save`, 'success');
}

async function toggleBackupsPanel() {
  const panel = document.getElementById('pubBackupsPanel');
  if (!panel.hidden) { panel.hidden = true; return; }
  await renderBackupsPanel();
  panel.hidden = false;
}

async function renderBackupsPanel() {
  const panel = document.getElementById('pubBackupsPanel');
  const type = currentType;
  panel.innerHTML = '<div class="loading-placeholder">Loading backups…</div>';
  try {
    const data = await api('/api/pub/backups?type=' + encodeURIComponent(type));
    if (!data.backups?.length) {
      panel.innerHTML = `<div class="pub-backups-empty">No server backups for ${esc(type.toUpperCase())} yet — they\'re created automatically each time you save.</div>`;
      return;
    }
    let html = `<div class="pub-backups-header">Edit history for ${esc(type.toUpperCase())} <span class="pub-backups-hint">(latest 10 retained, every save creates an entry)</span></div>`;
    html += '<ul class="pub-backups-list">';
    for (const b of data.backups) {
      const when = new Date(b.ts * 1000).toLocaleString();
      const kb = (b.size / 1024).toFixed(1);
      const actor = b.actor || 'unknown';
      html += '<li class="pub-backups-item">';
      html += `<div class="pub-backups-meta">`;
      html += `<div class="pub-backups-when"><strong>${esc(actor)}</strong> · ${esc(when)}</div>`;
      html += `<div class="pub-backups-filename">${esc(b.filename)} · ${kb} KB</div>`;
      html += `</div>`;
      html += `<button class="pub-backups-restore" data-filename="${esc(b.filename)}">Restore</button>`;
      html += '</li>';
    }
    html += '</ul>';
    html += `<div class="pub-backups-footer">Restoring overwrites the live ${esc(type.toUpperCase())} on disk and reloads it in the running server. The current file is itself backed up first, so you can step forward again.</div>`;
    panel.innerHTML = html;
    panel.querySelectorAll('.pub-backups-restore').forEach(btn => {
      btn.addEventListener('click', () => onRestoreBackup(btn.dataset.filename));
    });
  } catch (e) {
    panel.innerHTML = `<div class="pub-error">Failed to load backups: ${esc(e.message)}</div>`;
  }
}

async function onRestoreBackup(filename) {
  const dirtyCount = dirtyIds[currentType]?.size || 0;
  let warn = `Restore ${currentType.toUpperCase()} from "${filename}"? This overwrites the live pub on disk and reloads the running server.`;
  if (dirtyCount > 0) warn += `\n\nYou have ${dirtyCount} unsaved record(s) — they will be discarded.`;
  const ok = await showConfirm(warn, true);
  if (!ok) return;
  try {
    await api('/api/pub/restore-backup', {
      method: 'POST',
      timeout: SAVE_TIMEOUT_MS,
      body: { type: currentType, filename },
    });
    dirtyIds[currentType] = new Set();
    document.getElementById('pubBackupsPanel').hidden = true;
    showToast(`Restored ${currentType.toUpperCase()} from ${filename}`, 'success');
    await loadType(currentType);
    renderTypeTabs();
  } catch (e) {
    showToast('Restore failed: ' + e.message, 'error');
  }
}

async function pollPresence(type) {
  const banner = document.getElementById('pubPresence');
  if (!banner) return;
  try {
    const data = await api('/api/pub/editors?type=' + encodeURIComponent(type));
    const me = getUsername() || '';
    const meLower = me.toLowerCase();
    const others = (data.editors || []).filter(e => (e.username || '').toLowerCase() !== meLower);
    banner.hidden = false;
    banner.classList.remove('pub-presence-warn', 'pub-presence-solo');
    if (others.length === 0) {
      banner.classList.add('pub-presence-solo');
      banner.innerHTML = `<span class="pub-presence-icon">&#x1F464;</span> ` +
        `You (<strong>${esc(me || 'you')}</strong>) are the only editor in ${esc(type.toUpperCase())} right now.`;
    } else {
      banner.classList.add('pub-presence-warn');
      const names = others.map(e => '<strong>' + esc(e.username) + '</strong>').join(', ');
      banner.innerHTML = `<span class="pub-presence-icon">&#x26A0;</span> ` +
        `Also editing ${esc(type.toUpperCase())} right now: ${names}. ` +
        `Coordinate to avoid conflict-modal collisions.`;
    }
  } catch {
    // Network blip — keep whatever was there. Don't churn the banner.
  }
}
