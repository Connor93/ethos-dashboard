import { api } from '../api.js';
import { esc } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { showConfirm } from '../utils/confirm.js';

let cmdLogEntries = [];

export function initCommands() {
  // Quick commands grid
  const grid = document.getElementById('cmdGrid');
  grid.innerHTML = `
    <button class="cmd-btn" data-cmd="rehash">&#x21BB; Rehash Config</button>
    <button class="cmd-btn" data-cmd="repub">&#x21BB; Reload Pubs</button>
    <button class="cmd-btn" data-cmd="repub" data-args="announce">&#x1F4E2; Repub + Announce</button>
    <button class="cmd-btn" data-cmd="request">&#x21BB; Reload Quests</button>
    <button class="cmd-btn" data-cmd="uptime">&#x231B; Uptime</button>
    <button class="cmd-btn" data-cmd="cancel">&#x2716; Cancel Shutdown</button>
    <button class="cmd-btn danger" data-cmd="reload" data-confirm="Schedule server reload?">&#x21BA; Reload Server</button>
    <button class="cmd-btn danger" data-cmd="shutdown" data-confirm="Schedule server shutdown?">&#x23FB; Shutdown</button>
  `;

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('.cmd-btn');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    const args = btn.dataset.args ? btn.dataset.args.split(',') : [];
    if (btn.dataset.confirm) {
      const ok = await showConfirm(btn.dataset.confirm, true);
      if (!ok) return;
    }
    runCmd(cmd, args);
  });

  // Announce
  const announceInput = document.getElementById('announceMsg');
  announceInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAnnounce(); });
  document.getElementById('announceSendBtn').addEventListener('click', sendAnnounce);

  // Remap
  document.getElementById('remapBtn').addEventListener('click', () => {
    const val = document.getElementById('remapId').value;
    runCmd('remap', val ? [val] : []);
  });

  // Custom command
  const customInput = document.getElementById('customCmd');
  customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runCustom(); });
  document.getElementById('customCmdBtn').addEventListener('click', runCustom);

  // Rehash button in file editor
  document.getElementById('rehashBtn').addEventListener('click', () => runCmd('rehash'));
}

async function runCmd(cmd, args) {
  args = args || [];
  const time = new Date().toLocaleTimeString();
  try {
    const d = await api('/api/command', { method: 'POST', body: { command: cmd, args: args } });
    addLog(time, cmd + (args.length ? ' ' + args.join(' ') : ''), d.output || 'OK', 'out');
    showToast(cmd + ': ' + (d.output || 'OK'), 'success');
  } catch (e) {
    addLog(time, cmd, 'Error: ' + e.message, 'err');
    showToast(cmd + ' failed: ' + e.message, 'error');
  }
}

// Exported for use by the files tab
export { runCmd };

function runCustom() {
  const input = document.getElementById('customCmd');
  const parts = input.value.trim().split(/\s+/);
  if (!parts[0]) return;
  runCmd(parts[0], parts.slice(1));
  input.value = '';
}

async function sendAnnounce() {
  const input = document.getElementById('announceMsg');
  const msg = input.value.trim();
  if (!msg) return;
  try {
    await api('/api/announce', { method: 'POST', body: { message: msg } });
    const time = new Date().toLocaleTimeString();
    addLog(time, 'announce: ' + msg, 'Sent to all players', 'out');
    showToast('Announcement sent', 'success');
    input.value = '';
  } catch (e) {
    const time = new Date().toLocaleTimeString();
    addLog(time, 'announce', 'Error: ' + e.message, 'err');
    showToast('Announce failed: ' + e.message, 'error');
  }
}

function addLog(time, cmd, output, cls) {
  cmdLogEntries.unshift({ time, cmd, output, cls });
  if (cmdLogEntries.length > 50) cmdLogEntries.pop();
  const log = document.getElementById('cmdLog');
  log.innerHTML = cmdLogEntries.map(e => `<div class="cmd-log-entry">
    <span class="time">[${esc(e.time)}]</span> <span class="cmd">${esc(e.cmd)}</span>
    <span class="${e.cls}"> ${esc(e.output)}</span>
  </div>`).join('');
}
