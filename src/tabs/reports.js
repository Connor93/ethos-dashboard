import { api } from '../api.js';
import { esc } from '../utils/helpers.js';

export async function loadReports() {
  try {
    const d = await api('/api/reports');
    document.getElementById('reportsCount').textContent = d.length;
    document.getElementById('reportsTable').innerHTML = d.map(r => `<tr>
      <td>${esc(r.reporter)}</td><td><strong>${esc(r.reported)}</strong></td>
      <td>${esc(r.reason) || '-'}</td>
      <td>${new Date(r.time * 1000).toLocaleString()}</td>
    </tr>`).join('');
  } catch (e) {}
}
