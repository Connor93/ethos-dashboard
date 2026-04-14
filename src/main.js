/**
 * Etheos Dashboard — Main Entry Point
 * Handles auth, navigation, and orchestrates all tab modules.
 */
import './style.css';
import { api, setAuth, clearAuth, getToken, getUsername, setLogoutCallback } from './api.js';
import { showToast } from './utils/toast.js';
import { initOverview, refreshAll } from './tabs/overview.js';
import { initCommands } from './tabs/commands.js';
import { initChat, startChatPolling, loadCharacters } from './tabs/chat.js';
import { initFiles } from './tabs/files.js';
import { loadGuilds } from './tabs/guilds.js';
import { loadBans } from './tabs/bans.js';
import { loadReports } from './tabs/reports.js';
import { loadConfig } from './tabs/config.js';
import { initPlayerLogs, stopPlogPolling } from './tabs/player-logs.js';
import { initAuditTab } from './tabs/audit.js';
import { loadMaterialTrader } from './tabs/material-trader.js';
import { initAlertsTab } from './tabs/alerts.js';
import { startLogPolling } from './tabs/overview.js';

let refreshTimer = null;

// ---- Auth ----

function doLogout() {
  clearAuth();
  if (refreshTimer) clearInterval(refreshTimer);
  document.getElementById('loginScreen').style.display = '';
  document.getElementById('dashboardScreen').style.display = 'none';
}

setLogoutCallback(doLogout);

async function doLogin(e) {
  e.preventDefault();
  const user = document.getElementById('loginUser').value;
  const pass = document.getElementById('loginPass').value;
  const err = document.getElementById('loginError');
  const btn = e.target.querySelector('button[type="submit"]');
  err.textContent = '';

  const MAX_RETRIES = 3;
  const BASE_DELAY = 500;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      err.textContent = 'Connection failed, retrying... (' + attempt + '/' + MAX_RETRIES + ')';
      err.style.color = 'var(--warning)';
      await new Promise(r => setTimeout(r, BASE_DELAY * Math.pow(2, attempt - 1)));
    }
    if (btn) btn.disabled = true;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const d = await r.json();
      if (!r.ok) {
        err.style.color = '';
        err.textContent = d.error || 'Login failed';
        if (btn) btn.disabled = false;
        return false;
      }
      setAuth(d.token, d.username);
      if (btn) btn.disabled = false;
      showDashboard();
      return false;
    } catch (ex) {
      if (attempt === MAX_RETRIES) {
        err.style.color = '';
        err.textContent = 'Connection failed. Please try again.';
        if (btn) btn.disabled = false;
      }
    }
  }
  return false;
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboardScreen').style.display = 'grid';
  document.getElementById('currentUser').textContent = getUsername();
  refreshAll();
  refreshTimer = setInterval(refreshAll, 10000);
  startLogPolling();
  loadCharacters();
  startChatPolling();
}

// ---- Navigation ----

function initNavigation() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const hamburger = document.getElementById('hamburgerBtn');

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('visible');
  }

  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('visible');
  });
  backdrop.addEventListener('click', closeSidebar);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + item.dataset.tab).classList.add('active');

      // Close sidebar on mobile
      closeSidebar();

      const tab = item.dataset.tab;
      if (tab === 'guilds') loadGuilds();
      if (tab === 'bans') loadBans();
      if (tab === 'reports') loadReports();
      if (tab !== 'playerlogs') stopPlogPolling();
      if (tab === 'config') loadConfig();
      if (tab === 'files') initFiles();
      if (tab === 'playerlogs') initPlayerLogs();
      if (tab === 'audit') initAuditTab();
      if (tab === 'materialtrader') loadMaterialTrader();
      if (tab === 'alerts') initAlertsTab();
    });
  });
}

// ---- Modal close handlers ----

function initModals() {
  // Map modal — close on overlay click or button
  const mapModal = document.getElementById('mapModal');
  mapModal.addEventListener('click', (e) => {
    if (e.target === mapModal) mapModal.style.display = 'none';
  });
  document.getElementById('closeMapModalBtn').addEventListener('click', () => {
    mapModal.style.display = 'none';
  });
}

// ---- Init ----

document.getElementById('loginForm').addEventListener('submit', doLogin);
document.getElementById('logoutBtn').addEventListener('click', doLogout);

initNavigation();
initModals();
initOverview();
initCommands();
initChat();

// Auto-login if token exists
if (getToken()) {
  showDashboard();
}
