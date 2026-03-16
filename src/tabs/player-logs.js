import { api } from '../api.js';
import { esc, plogCatBadge } from '../utils/helpers.js';

let plogOffset = 0;
let plogLimit = 500;
let plogInited = false;
let plogDatesLoaded = false;
let plogPollTimer = null;

export function initPlayerLogs() {
  if (!plogInited) {
    plogInited = true;
    document.getElementById('plogPlayer').addEventListener('keydown', e => { if (e.key === 'Enter') searchPlayerLogs(); });
    document.getElementById('plogSearch').addEventListener('keydown', e => { if (e.key === 'Enter') searchPlayerLogs(); });
    document.getElementById('plogSearchBtn').addEventListener('click', searchPlayerLogs);
    document.getElementById('plogDate').addEventListener('change', searchPlayerLogs);
    document.getElementById('plogCategory').addEventListener('change', searchPlayerLogs);
    document.getElementById('plogPrev').addEventListener('click', plogPrevPage);
    document.getElementById('plogNext').addEventListener('click', plogNextPage);
    fetchPlayerLogDates();
  }
  startPlogPolling();
}

function startPlogPolling() {
  stopPlogPolling();
  plogPollTimer = setInterval(() => loadPlayerLogs(), 30000);
}

export function stopPlogPolling() {
  if (plogPollTimer) { clearInterval(plogPollTimer); plogPollTimer = null; }
}

async function fetchPlayerLogDates() {
  if (plogDatesLoaded) return;
  try {
    const d = await api('/api/player-logs?limit=0');
    const sel = document.getElementById('plogDate');
    sel.innerHTML = '';
    if (d.dates && d.dates.length > 0) {
      d.dates.forEach(dt => {
        const opt = document.createElement('option');
        opt.value = dt; opt.textContent = dt;
        sel.appendChild(opt);
      });
      plogDatesLoaded = true;
      searchPlayerLogs();
    } else {
      sel.innerHTML = '<option value="">No logs available</option>';
    }
  } catch (e) { console.error('fetchPlayerLogDates error:', e); }
}

async function searchPlayerLogs() {
  plogOffset = 0;
  await loadPlayerLogs();
}

async function loadPlayerLogs() {
  const date = document.getElementById('plogDate').value;
  const player = document.getElementById('plogPlayer').value.trim();
  const category = document.getElementById('plogCategory').value;
  const search = document.getElementById('plogSearch').value.trim();

  let url = '/api/player-logs?limit=' + plogLimit + '&offset=' + plogOffset;
  if (date) url += '&date=' + encodeURIComponent(date);
  if (player) url += '&player=' + encodeURIComponent(player);
  if (category) url += '&category=' + encodeURIComponent(category);
  if (search) url += '&search=' + encodeURIComponent(search);

  const tb = document.getElementById('plogTable');
  tb.innerHTML = '<tr><td colspan="4"><div class="loading-placeholder">Searching...</div></td></tr>';

  try {
    const d = await api(url);
    document.getElementById('plogTotal').textContent = d.total;

    if (d.dates && d.dates.length > 0 && !plogDatesLoaded) {
      const sel = document.getElementById('plogDate');
      sel.innerHTML = '';
      d.dates.forEach(dt => {
        const opt = document.createElement('option');
        opt.value = dt; opt.textContent = dt;
        sel.appendChild(opt);
      });
      if (d.date) sel.value = d.date;
      plogDatesLoaded = true;
    }

    if (!d.entries || d.entries.length === 0) {
      tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:40px">No log entries found matching your filters.</td></tr>';
    } else {
      tb.innerHTML = d.entries.map(e => `<tr>
        <td style="white-space:nowrap;font-size:.8rem">${esc(e.timestamp)}</td>
        <td><strong>${esc(e.player)}</strong></td>
        <td class="plog-cat">${plogCatBadge(e.category)}</td>
        <td class="plog-detail">${esc(e.detail)}</td>
      </tr>`).join('');
    }

    const showing = Math.min(d.entries ? d.entries.length : 0, plogLimit);
    const start = plogOffset + 1;
    const end = plogOffset + showing;
    document.getElementById('plogInfo').textContent = d.total > 0 ? ('Showing ' + start + '-' + end + ' of ' + d.total) : '';
    document.getElementById('plogPrev').disabled = plogOffset <= 0;
    document.getElementById('plogNext').disabled = (plogOffset + plogLimit) >= d.total;
  } catch (e) {
    tb.innerHTML = '<tr><td colspan="4" style="color:var(--danger)">Error loading logs: ' + esc(e.message) + '</td></tr>';
  }
}

function plogPrevPage() { plogOffset = Math.max(0, plogOffset - plogLimit); loadPlayerLogs(); }
function plogNextPage() { plogOffset += plogLimit; loadPlayerLogs(); }
