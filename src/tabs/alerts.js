import { api } from '../api.js';
import { esc } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { getUsername } from '../api.js';

let initialized = false;
let currentFilter = '';
let currentPage = 0;
const PAGE_SIZE = 50;
let detailAlertId = null;

export function initAlertsTab() {
  if (initialized) {
    loadAlerts();
    return;
  }

  document.getElementById('alertFilterAll').addEventListener('click', () => setFilter(''));
  document.getElementById('alertFilterPending').addEventListener('click', () => setFilter('pending'));
  document.getElementById('alertFilterConfirmed').addEventListener('click', () => setFilter('confirmed'));
  document.getElementById('alertFilterDenied').addEventListener('click', () => setFilter('denied'));
  document.getElementById('alertRefreshBtn').addEventListener('click', loadAlerts);

  // Detail modal close
  document.getElementById('alertDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'alertDetailModal') closeDetail();
  });
  document.getElementById('alertDetailCloseBtn').addEventListener('click', closeDetail);

  // Review buttons
  document.getElementById('alertConfirmBtn').addEventListener('click', () => submitReview('confirmed'));
  document.getElementById('alertDenyBtn').addEventListener('click', () => submitReview('denied'));

  // Pagination
  document.getElementById('alertPrev').addEventListener('click', () => { if (currentPage > 0) { currentPage--; loadAlerts(); } });
  document.getElementById('alertNext').addEventListener('click', () => { currentPage++; loadAlerts(); });

  initialized = true;
  loadAlerts();
  loadWeights();
}

function setFilter(f) {
  currentFilter = f;
  currentPage = 0;
  document.querySelectorAll('.alert-filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(f ? 'alertFilter' + f.charAt(0).toUpperCase() + f.slice(1) : 'alertFilterAll').classList.add('active');
  loadAlerts();
}

async function loadAlerts() {
  const tb = document.getElementById('alertsTableBody');
  tb.innerHTML = '<tr><td colspan="6"><div class="loading-placeholder">Loading alerts...</div></td></tr>';

  try {
    let url = '/api/alerts?limit=' + PAGE_SIZE + '&offset=' + (currentPage * PAGE_SIZE);
    if (currentFilter) url += '&status=' + currentFilter;
    const d = await api(url);
    const alerts = d.alerts || [];

    // Update counts
    document.getElementById('alertsBadge').textContent = alerts.length;

    if (alerts.length === 0) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--success);padding:40px">&#x2705; No alerts found</td></tr>';
    } else {
      tb.innerHTML = alerts.map(a => `<tr class="clickable" data-alert-id="${a.alert_id}">
        <td><strong>${esc(a.character_name)}</strong></td>
        <td>${scoreBar(a.composite_score)}</td>
        <td>${statusBadge(a.status)}</td>
        <td>${esc(a.map_name)}</td>
        <td>${formatDuration(a.session_duration)}</td>
        <td>${formatTimestamp(a.timestamp)}</td>
      </tr>`).join('');

      tb.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => openDetail(parseInt(row.dataset.alertId)));
      });
    }

    // Pagination
    document.getElementById('alertPrev').disabled = currentPage === 0;
    document.getElementById('alertNext').disabled = alerts.length < PAGE_SIZE;
    document.getElementById('alertPageInfo').textContent = alerts.length > 0 ? 'Page ' + (currentPage + 1) : '';
  } catch (e) {
    tb.innerHTML = '<tr><td colspan="6" style="color:var(--danger)">Error: ' + esc(e.message) + '</td></tr>';
  }
}

async function loadWeights() {
  try {
    const d = await api('/api/alerts/weights');
    const wc = document.getElementById('alertWeightsBody');
    if (!d.weights || d.weights.length === 0) {
      wc.innerHTML = '<div class="loading-placeholder">No weight data</div>';
      return;
    }
    wc.innerHTML = d.weights.map(w => {
      const total = w.thumbs_up + w.thumbs_down;
      const pct = total > 0 ? Math.round((w.thumbs_up / total) * 100) : 50;
      return `<div class="weight-row">
        <span class="weight-name">${formatSignalName(w.signal_name)}</span>
        <div class="weight-bar-track">
          <div class="weight-bar-fill" style="width:${Math.round(w.current_weight * 100)}%"></div>
        </div>
        <span class="weight-value">${w.current_weight.toFixed(2)}</span>
        <span class="weight-feedback">${w.thumbs_up}&#x1F44D; ${w.thumbs_down}&#x1F44E;</span>
      </div>`;
    }).join('');
  } catch (e) {}
}

async function openDetail(alertId) {
  detailAlertId = alertId;
  const modal = document.getElementById('alertDetailModal');
  const body = document.getElementById('alertDetailBody');
  body.innerHTML = '<div class="loading-placeholder">Loading alert details...</div>';
  modal.style.display = 'flex';

  // Hide review actions initially
  document.getElementById('alertReviewActions').style.display = 'none';

  try {
    const d = await api('/api/alerts/' + alertId);

    const scores = d.signal_scores || {};

    let html = `
      <div class="alert-detail-header">
        <div>
          <h3>${esc(d.character_name)}</h3>
          <div class="alert-detail-meta">
            ${statusBadge(d.status)}
            <span>Map: ${esc(d.map_name)}</span>
            <span>Session: ${formatDuration(d.session_duration)}</span>
            <span>${formatTimestamp(d.timestamp)}</span>
          </div>
        </div>
        <div class="alert-detail-score">${d.composite_score.toFixed(2)}</div>
      </div>

      <h4>Signal Breakdown</h4>
      <div class="signal-grid">
        ${signalRow('action_regularity', 'Action Regularity', scores.action_regularity)}
        ${signalRow('positional_monotony', 'Positional Monotony', scores.positional_monotony)}
        ${signalRow('social_silence', 'Social Silence', scores.social_silence)}
        ${signalRow('target_diversity', 'Target Diversity', scores.target_diversity)}
        ${signalRow('break_absence', 'Break Absence', scores.break_absence)}
      </div>
    `;

    if (d.escalated_from > 0) {
      html += `<div class="alert-escalation">&#x26A0; Escalated from alert #${d.escalated_from}</div>`;
    }

    if (d.history && d.history.length > 0) {
      html += `<h4>Past Alerts for ${esc(d.character_name)}</h4>
        <table class="alert-history-table"><thead><tr>
          <th>ID</th><th>Score</th><th>Status</th><th>Time</th>
        </tr></thead><tbody>
        ${d.history.map(h => `<tr>
          <td>#${h.alert_id}</td>
          <td>${h.composite_score.toFixed(2)}</td>
          <td>${statusBadge(h.status)}</td>
          <td>${formatTimestamp(h.timestamp)}</td>
        </tr>`).join('')}
        </tbody></table>`;
    }

    if (d.status === 'pending') {
      document.getElementById('alertReviewActions').style.display = '';
      // Reset feedback buttons
      document.querySelectorAll('.signal-feedback-btn').forEach(b => b.classList.remove('selected'));
      document.getElementById('alertReviewNotes').value = '';
    }

    if (d.reviewed_by) {
      html += `<div class="alert-review-info">Reviewed by <strong>${esc(d.reviewed_by)}</strong> on ${formatTimestamp(d.reviewed_at)}</div>`;
      if (d.review_notes) html += `<div class="alert-review-notes">${esc(d.review_notes)}</div>`;
    }

    body.innerHTML = html;

    // Bind feedback buttons
    body.querySelectorAll('.signal-feedback-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const signal = btn.dataset.signal;
        const dir = btn.dataset.dir;
        // Deselect sibling
        body.querySelectorAll(`.signal-feedback-btn[data-signal="${signal}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  } catch (e) {
    body.innerHTML = '<div style="color:var(--danger);padding:20px">Error loading alert: ' + esc(e.message) + '</div>';
  }
}

function closeDetail() {
  document.getElementById('alertDetailModal').style.display = 'none';
  detailAlertId = null;
}

async function submitReview(status) {
  if (!detailAlertId) return;

  // Collect signal feedback
  const feedback = {};
  document.querySelectorAll('.signal-feedback-btn.selected').forEach(btn => {
    feedback[btn.dataset.signal] = btn.dataset.dir;
  });

  const notes = document.getElementById('alertReviewNotes').value.trim();

  try {
    await api('/api/alerts/' + detailAlertId + '/review', {
      method: 'POST',
      body: {
        status: status,
        reviewed_by: getUsername(),
        notes: notes,
        signal_feedback: JSON.stringify(feedback)
      }
    });

    showToast('Alert ' + status, 'success');
    closeDetail();
    loadAlerts();
    loadWeights();
  } catch (e) {
    showToast('Review failed: ' + e.message, 'error');
  }
}

// --- Helpers ---

function scoreBar(score) {
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? 'var(--danger)' : score >= 0.65 ? 'var(--warning)' : 'var(--info)';
  return `<div class="alert-score-cell">
    <div class="alert-score-bar"><div class="alert-score-fill" style="width:${pct}%;background:${color}"></div></div>
    <span>${score.toFixed(2)}</span>
  </div>`;
}

function signalRow(key, label, value) {
  const v = value || 0;
  const pct = Math.round(v * 100);
  const color = v >= 0.8 ? 'var(--danger)' : v >= 0.5 ? 'var(--warning)' : 'var(--success)';
  return `<div class="signal-row">
    <span class="signal-label">${label}</span>
    <div class="signal-bar-track"><div class="signal-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="signal-value">${v.toFixed(2)}</span>
    <button class="signal-feedback-btn up" data-signal="${key}" data-dir="up" title="Good indicator">&#x1F44D;</button>
    <button class="signal-feedback-btn down" data-signal="${key}" data-dir="down" title="Not meaningful">&#x1F44E;</button>
  </div>`;
}

function statusBadge(status) {
  const cls = status === 'confirmed' ? 'high' : status === 'pending' ? 'medium' : 'low';
  return `<span class="audit-severity ${cls}">${status}</span>`;
}

function formatDuration(seconds) {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

function formatTimestamp(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatSignalName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
