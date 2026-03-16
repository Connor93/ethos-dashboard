import { api } from '../api.js';
import { esc } from '../utils/helpers.js';
import { showConfirm } from '../utils/confirm.js';

let auditDatesLoaded = false;

export async function initAuditTab() {
  if (!auditDatesLoaded) {
    document.getElementById('auditRunBtn').addEventListener('click', runAudit);
    document.getElementById('auditFreshBtn').addEventListener('click', runFreshAudit);
    document.getElementById('auditDate').addEventListener('change', runAudit);

    try {
      const d = await api('/api/player-logs?limit=1');
      if (d.dates && d.dates.length > 0) {
        const sel = document.getElementById('auditDate');
        sel.innerHTML = '<option value="">Today</option>';
        d.dates.forEach(dt => {
          const opt = document.createElement('option');
          opt.value = dt; opt.textContent = dt;
          sel.appendChild(opt);
        });
        auditDatesLoaded = true;
      }
    } catch (e) {}
  }
}

async function runAudit() {
  const date = document.getElementById('auditDate').value;
  const tb = document.getElementById('auditTable');
  tb.innerHTML = '<tr><td colspan="4"><div class="audit-loading">&#x23F3; Running audit...</div></td></tr>';

  try {
    const url = '/api/audit' + (date ? '?date=' + encodeURIComponent(date) : '');
    const d = await api(url);

    document.getElementById('auditTotal').textContent = d.total || 0;
    document.getElementById('auditSummary').style.display = 'flex';
    document.getElementById('auditHigh').textContent = d.summary ? d.summary.high : 0;
    document.getElementById('auditMedium').textContent = d.summary ? d.summary.medium : 0;
    document.getElementById('auditLow').textContent = d.summary ? d.summary.low : 0;

    if (!d.alerts || d.alerts.length === 0) {
      tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--success);padding:40px">&#x2705; No suspicious activity detected!</td></tr>';
    } else {
      const order = { high: 0, medium: 1, low: 2 };
      d.alerts.sort((a, b) => (order[a.severity] || 3) - (order[b.severity] || 3));

      tb.innerHTML = d.alerts.map(a => `<tr>
        <td><strong>${esc(a.player)}</strong></td>
        <td><span class="audit-severity ${a.severity}">${a.severity}</span></td>
        <td>${esc(a.rule)}${a.needs_review ? '<span class="audit-review">NEEDS REVIEW</span>' : ''}</td>
        <td class="plog-detail">${esc(a.detail)}</td>
      </tr>`).join('');
    }
  } catch (e) {
    tb.innerHTML = '<tr><td colspan="4" style="color:var(--danger)">Error: ' + esc(e.message) + '</td></tr>';
  }
}

async function runFreshAudit() {
  const ok = await showConfirm('This will delete cached audit results and re-process all logs. Continue?', true);
  if (!ok) return;
  const date = document.getElementById('auditDate').value;
  try {
    const url = '/api/audit/fresh' + (date ? '?date=' + encodeURIComponent(date) : '');
    await api(url, { method: 'POST' });
    await runAudit();
  } catch (e) {
    showConfirm('Error: ' + e.message);
  }
}
