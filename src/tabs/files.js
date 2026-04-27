import { api, getUsername } from '../api.js';
import { esc } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { showConfirm } from '../utils/confirm.js';
import { saveBackup, listBackups, getBackup } from '../utils/backups.js';
import { runCmd } from './commands.js';

let currentFilePath = '';
let fileTreeLoaded = false;

export function initFiles() {
  if (fileTreeLoaded) return;
  loadFileTree();

  document.getElementById('saveFileBtn').addEventListener('click', saveCurrentFile);
  document.getElementById('historyBtn').addEventListener('click', toggleHistoryPanel);
}

async function loadFileTree() {
  const tree = document.getElementById('fileTree');
  tree.innerHTML = 'Loading...';
  try {
    const [cfg, dat] = await Promise.all([api('/api/files?dir=config'), api('/api/files?dir=data')]);
    let html = '';
    html += buildTreeGroup('config', cfg.files);
    html += buildTreeGroup('data', dat.files);
    tree.innerHTML = html;
    fileTreeLoaded = true;

    // Attach click handlers
    tree.querySelectorAll('.file-tree-label').forEach(label => {
      label.addEventListener('click', () => toggleTreeGroup(label));
    });
    tree.querySelectorAll('.file-tree-item').forEach(item => {
      item.addEventListener('click', () => openFile(item, item.dataset.path));
    });
  } catch (e) {
    tree.innerHTML = '<div style="padding:16px;color:var(--danger)">Error loading files</div>';
  }
}

function buildTreeGroup(dir, files) {
  let html = '<div class="file-tree-group">';
  html += '<div class="file-tree-label"><span class="arrow open">&#x25B6;</span> ' + dir.toUpperCase() + ' (' + files.length + ')</div>';
  html += '<div class="file-tree-items">';
  for (const f of files) {
    const path = dir + '/' + f;
    html += '<div class="file-tree-item" data-path="' + esc(path) + '">' + esc(f) + '</div>';
  }
  html += '</div></div>';
  return html;
}

function toggleTreeGroup(label) {
  const items = label.nextElementSibling;
  const arrow = label.querySelector('.arrow');
  if (items.style.display === 'none') {
    items.style.display = '';
    arrow.classList.add('open');
  } else {
    items.style.display = 'none';
    arrow.classList.remove('open');
  }
}

async function openFile(el, path) {
  document.querySelectorAll('.file-tree-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  currentFilePath = path;
  document.getElementById('editorFileName').textContent = path;
  document.getElementById('fileEditorArea').innerHTML = '<div class="file-editor-empty">Loading...</div>';
  hideHistoryPanel();
  try {
    const d = await api('/api/file?path=' + encodeURIComponent(path));
    document.getElementById('fileEditorArea').innerHTML = '<textarea id="fileEditor" spellcheck="false">' + esc(d.content) + '</textarea>';
    document.getElementById('saveFileBtn').disabled = false;
    document.getElementById('historyBtn').disabled = false;
  } catch (e) {
    document.getElementById('fileEditorArea').innerHTML = '<div class="file-editor-empty" style="color:var(--danger)">Error loading file</div>';
  }
}

async function saveCurrentFile() {
  if (!currentFilePath) return;
  const editor = document.getElementById('fileEditor');
  if (!editor) return;
  const ok = await showConfirm('Save changes to ' + currentFilePath + '?');
  if (!ok) return;

  const newContent = editor.value;
  const saveBtn = document.getElementById('saveFileBtn');
  saveBtn.disabled = true;
  const originalLabel = saveBtn.innerHTML;
  saveBtn.innerHTML = 'Saving...';

  try {
    // Step 1: snapshot the current on-disk version via the backup sidecar
    // before we touch it. If the POST below truncates the file, the last
    // good version is still recoverable from History.
    try {
      const pre = await api('/api/file?path=' + encodeURIComponent(currentFilePath));
      await saveBackup(currentFilePath, pre.content, getUsername());
    } catch (e) {
      // Don't block the save on a backup failure, but make it visible.
      // (Far worse to refuse to save than to save without a backup.)
      showToast('Backup failed (continuing save): ' + e.message, 'error');
    }

    // Step 2: write
    await api('/api/file', { method: 'POST', body: { path: currentFilePath, content: newContent } });

    // Step 3: re-read and verify the on-disk content matches what we sent.
    // This catches the silent-truncation class of bug at the dashboard
    // boundary even if a server-side regression slips through.
    const verify = await api('/api/file?path=' + encodeURIComponent(currentFilePath));
    if (verify.content !== newContent) {
      const sentLen = newContent.length;
      const gotLen = verify.content.length;
      showToast(
        'Save mismatch: sent ' + sentLen + ' bytes, server has ' + gotLen +
        '. The previous version is in History.',
        'error'
      );
    } else {
      showToast('File saved: ' + currentFilePath, 'success');
    }
  } catch (e) {
    showToast('Save failed: ' + e.message + '. The previous version is in History.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalLabel;
  }
}

// ---- History panel ----

function hideHistoryPanel() {
  const panel = document.getElementById('fileHistoryPanel');
  if (panel) panel.hidden = true;
}

async function toggleHistoryPanel() {
  const panel = document.getElementById('fileHistoryPanel');
  if (!panel) return;
  if (!panel.hidden) { panel.hidden = true; return; }
  await renderHistoryPanel();
  panel.hidden = false;
}

async function renderHistoryPanel() {
  const panel = document.getElementById('fileHistoryPanel');
  if (!panel || !currentFilePath) return;
  panel.innerHTML = '<div class="file-history-loading">Loading backups...</div>';
  let backups;
  try {
    backups = await listBackups(currentFilePath);
  } catch (e) {
    panel.innerHTML = '<div class="file-history-empty" style="color:var(--danger)">Could not read backups: ' + esc(e.message) + '</div>';
    return;
  }
  if (!backups.length) {
    panel.innerHTML = '<div class="file-history-empty">No backups yet. A backup is saved automatically each time you save this file.</div>';
    return;
  }
  let html = '<div class="file-history-header">Backups for ' + esc(currentFilePath) + '</div>';
  html += '<ul class="file-history-list">';
  for (const b of backups) {
    const when = new Date(b.ts).toLocaleString();
    html += '<li class="file-history-item" data-id="' + esc(b.id) + '">';
    const who = b.username ? esc(b.username) : 'unknown';
    html += '<div class="file-history-meta">';
    html += '<span class="file-history-when">' + esc(when) + '</span>';
    html += '<span class="file-history-who">by ' + who + '</span>';
    const sizeBytes = typeof b.size === 'number' ? b.size : 0;
    html += '<span class="file-history-size">' + sizeBytes + ' bytes</span>';
    html += '</div>';
    html += '<button class="file-history-restore" data-id="' + esc(b.id) + '">Restore into editor</button>';
    html += '</li>';
  }
  html += '</ul>';
  html += '<div class="file-history-footnote">Restore loads the backup into the editor for review. Click Save to commit it.</div>';
  panel.innerHTML = html;

  panel.querySelectorAll('.file-history-restore').forEach(btn => {
    btn.addEventListener('click', () => restoreBackup(btn.dataset.id, currentFilePath));
  });
}

async function restoreBackup(id, path) {
  const editor = document.getElementById('fileEditor');
  if (!editor) {
    showToast('Open a file first', 'error');
    return;
  }
  let rec;
  try {
    rec = await getBackup(id, path);
  } catch (e) {
    showToast('Could not load backup: ' + e.message, 'error');
    return;
  }
  if (!rec) { showToast('Backup not found', 'error'); return; }
  editor.value = rec.content;
  hideHistoryPanel();
  showToast('Backup loaded into editor — review and click Save to commit', 'success');
}
