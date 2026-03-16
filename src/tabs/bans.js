import { api } from '../api.js';
import { esc } from '../utils/helpers.js';

export async function loadBans() {
  try {
    const d = await api('/api/bans');
    document.getElementById('bansCount').textContent = d.length;
    document.getElementById('bansTable').innerHTML = d.map(b => `<tr>
      <td>${esc(b.username) || '-'}</td><td>${esc(b.setter) || '-'}</td>
      <td><span class="badge-admin ${b.expiry_type === 'Permanent' ? 'hgm' : 'gm'}">${b.expiry_type}</span></td>
      <td>${b.expires === 0 ? 'Never' : new Date(b.expires * 1000).toLocaleString()}</td>
    </tr>`).join('');
  } catch (e) {}
}
