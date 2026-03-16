import { api } from '../api.js';
import { esc } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { showConfirm } from '../utils/confirm.js';
import { runCmd } from './commands.js';

let currentFilePath = '';
let fileTreeLoaded = false;

export function initFiles() {
  if (fileTreeLoaded) return;
  loadFileTree();

  document.getElementById('saveFileBtn').addEventListener('click', saveCurrentFile);
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
  try {
    const d = await api('/api/file?path=' + encodeURIComponent(path));
    document.getElementById('fileEditorArea').innerHTML = '<textarea id="fileEditor" spellcheck="false">' + esc(d.content) + '</textarea>';
    document.getElementById('saveFileBtn').disabled = false;
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
  try {
    await api('/api/file', { method: 'POST', body: { path: currentFilePath, content: editor.value } });
    showToast('File saved: ' + currentFilePath, 'success');
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}
