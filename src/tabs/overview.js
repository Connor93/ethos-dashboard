import { api } from '../api.js';
import { esc, adminBadge } from '../utils/helpers.js';

let logSinceId = 0;
let logPolling = false;
let logErrorCount = 0;

export function initOverview() {
  // No extra init needed; data loads via refreshAll
}

export async function refreshAll() {
  try {
    const status = await api('/api/status');
    updateStatus(status);
    const players = await api('/api/players');
    const stats = await api('/api/stats');
    const maps = await api('/api/maps');
    const sys = await api('/api/system');
    updateOverviewCards(status, stats, sys);
    updatePlayers(players);
    updateMaps(maps);
  } catch (e) { console.error('Refresh error:', e); }
}

function updateStatus(s) {
  document.getElementById('headerUptime').textContent = s.uptime;
  document.getElementById('headerPlayers').textContent = s.players_online + '/' + s.max_players;
  document.getElementById('headerVersion').textContent = 'v' + s.version;
}

function updateOverviewCards(s, st, sys) {
  const c = document.getElementById('overviewCards');
  const memStr = sys.memory_mb >= 0 ? sys.memory_mb.toFixed(1) + ' MB' : 'N/A';
  c.innerHTML = `
    <div class="card success"><div class="card-label">Players Online</div><div class="card-value">${s.players_online}</div><div class="card-sub">of ${s.max_players} max</div></div>
    <div class="card info"><div class="card-label">Connections</div><div class="card-value">${s.connections}</div><div class="card-sub"><span class="conn-badge conn-ws">WS</span> <span id="wsCount">0</span> &nbsp; <span class="conn-badge conn-tcp">TCP</span> <span id="tcpCount">0</span></div></div>
    <div class="card"><div class="card-label">Accounts</div><div class="card-value">${st.accounts}</div></div>
    <div class="card"><div class="card-label">Characters</div><div class="card-value">${st.characters}</div><div class="card-sub">${st.staff_characters} staff</div></div>
    <div class="card"><div class="card-label">Guilds</div><div class="card-value">${st.guilds}</div></div>
    <div class="card warning"><div class="card-label">Active Bans</div><div class="card-value">${st.bans_active}</div><div class="card-sub">${st.bans_permanent} permanent</div></div>
    <div class="card danger"><div class="card-label">Reports</div><div class="card-value">${st.reports}</div></div>
    <div class="card info"><div class="card-label">Maps Loaded</div><div class="card-value">${s.maps_loaded}</div></div>
    <div class="card"><div class="card-label">Memory Usage</div><div class="card-value">${memStr}</div><div class="card-sub">Process RSS</div></div>
  `;
}

function connBadge(conn) {
  const isWs = conn === 'ws';
  const label = isWs ? 'WS' : 'TCP';
  const cls = isWs ? 'conn-ws' : 'conn-tcp';
  return `<span class="conn-badge ${cls}">${label}</span>`;
}

function updatePlayers(players) {
  document.getElementById('playersCount').textContent = players.length;
  document.getElementById('playersCountDetail').textContent = players.length;

  const wsCount = players.filter(p => p.connection === 'ws').length;
  const tcpCount = players.length - wsCount;
  document.getElementById('wsCount').textContent = wsCount;
  document.getElementById('tcpCount').textContent = tcpCount;

  const ob = document.getElementById('overviewPlayers');
  ob.innerHTML = players.map(p => `<tr>
    <td><strong>${esc(p.name)}</strong></td><td>${p.level}</td><td>${p.class}</td>
    <td>${p.map}</td><td>${esc(p.guild_tag) || '-'}</td><td>${adminBadge(p.admin, p.admin_level)}</td>
    <td>${p.hp}/${p.max_hp}</td><td>${p.tp}/${p.max_tp}</td>
    <td>${connBadge(p.connection)}</td>
  </tr>`).join('');

  const tb = document.getElementById('playersTable');
  tb.innerHTML = players.map(p => `<tr>
    <td><strong>${esc(p.name)}</strong></td><td>${p.level}</td><td>${p.class}</td>
    <td>${p.map}</td><td>${p.x},${p.y}</td><td>${adminBadge(p.admin, p.admin_level)}</td>
    <td>${esc(p.guild_tag) || '-'}</td>
    <td>${p.hp}/${p.max_hp}</td><td>${p.tp}/${p.max_tp}</td>
    <td>${p.str}</td><td>${p.int}</td><td>${p.wis}</td><td>${p.agi}</td><td>${p.con}</td><td>${p.cha}</td>
    <td>${p.weight}/${p.max_weight}</td><td>${p.karma}</td>
    <td>${esc(p.home) || '-'}</td><td>${esc(p.title) || '-'}</td>
    <td>${connBadge(p.connection)}</td>
  </tr>`).join('');
}

function updateMaps(maps) {
  document.getElementById('mapsCount').textContent = maps.length;
  const tb = document.getElementById('mapsTable');
  tb.innerHTML = maps.map(m => `<tr class="clickable" data-map-id="${m.id}">
    <td><strong>${m.id}</strong></td><td>${m.players}</td><td>${m.npcs}</td>
    <td>${m.width}x${m.height}</td><td>${m.pk ? '<span style="color:var(--danger)">Yes</span>' : '-'}</td>
  </tr>`).join('');

  // Attach click handlers for map player modal
  tb.querySelectorAll('tr.clickable').forEach(row => {
    row.addEventListener('click', () => showMapPlayers(parseInt(row.dataset.mapId)));
  });
}

async function showMapPlayers(mapId) {
  document.getElementById('mapModalTitle').textContent = 'Map ' + mapId + ' — Players';
  document.getElementById('mapModalBody').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Loading...</td></tr>';
  document.getElementById('mapModal').style.display = 'flex';
  try {
    const players = await api('/api/maps/' + mapId + '/players');
    if (players.length === 0) {
      document.getElementById('mapModalBody').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No players on this map</td></tr>';
      return;
    }
    document.getElementById('mapModalBody').innerHTML = players.map(p => `<tr>
      <td><strong>${esc(p.name)}</strong></td><td>${p.level}</td><td>${p.class}</td>
      <td>${p.x},${p.y}</td><td>${adminBadge(p.admin, p.admin === 'Player' ? 0 : 1)}</td>
      <td>${esc(p.guild) || '-'}</td>
      <td>${p.hp}/${p.max_hp}</td><td>${p.tp}/${p.max_tp}</td>
    </tr>`).join('');
  } catch (e) {
    document.getElementById('mapModalBody').innerHTML = '<tr><td colspan="8" style="color:var(--danger)">Error loading players</td></tr>';
  }
}

// ---- Server Log Polling ----

export function startLogPolling() {
  if (logPolling) return;
  logPolling = true;
  pollLogs();
}

async function pollLogs() {
  const LOG_INTERVAL = 3000;
  const LOG_BACKOFF_MAX = 15000;
  try {
    const d = await api('/api/logs?since=' + logSinceId);
    logErrorCount = 0;
    if (d.logs && d.logs.length > 0) {
      const body = document.getElementById('logBody');
      const cmdBody = document.getElementById('cmdLogBody');
      if (logSinceId === 0) { body.innerHTML = ''; if (cmdBody) cmdBody.innerHTML = ''; }
      while (body.children.length > 300) body.removeChild(body.firstChild);
      if (cmdBody) while (cmdBody.children.length > 300) cmdBody.removeChild(cmdBody.firstChild);
      for (const log of d.logs) {
        const level = log.level.trim();
        let tagClass = 'info';
        if (level === 'WRN') tagClass = 'wrn';
        else if (level === 'ERR') tagClass = 'err';
        else if (level === 'DBG') tagClass = 'dbg';
        const html = '<span class="log-tag ' + tagClass + '">[' + esc(level) + ']</span><span class="log-msg">' + esc(log.message) + '</span>';
        const el = document.createElement('div');
        el.className = 'log-line'; el.innerHTML = html;
        body.appendChild(el);
        if (cmdBody) { const el2 = document.createElement('div'); el2.className = 'log-line'; el2.innerHTML = html; cmdBody.appendChild(el2); }
        logSinceId = log.id;
      }
      body.scrollTop = body.scrollHeight;
      if (cmdBody) cmdBody.scrollTop = cmdBody.scrollHeight;
    }
    document.getElementById('logStatus').textContent = 'Live \u2014 polling';
    const cmdSt = document.getElementById('cmdLogStatus'); if (cmdSt) cmdSt.textContent = 'Live \u2014 polling';
    setTimeout(pollLogs, LOG_INTERVAL);
  } catch (e) {
    logErrorCount++;
    const delay = Math.min(LOG_INTERVAL + logErrorCount * 5000, LOG_BACKOFF_MAX);
    document.getElementById('logStatus').textContent = 'Reconnecting...';
    const cmdSt = document.getElementById('cmdLogStatus'); if (cmdSt) cmdSt.textContent = 'Reconnecting...';
    setTimeout(pollLogs, delay);
  }
}
