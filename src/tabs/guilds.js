import { api } from '../api.js';
import { esc } from '../utils/helpers.js';

export async function loadGuilds() {
  try {
    const d = await api('/api/guilds');
    document.getElementById('guildsCount').textContent = d.length;
    document.getElementById('guildsTable').innerHTML = d.map(g => `<tr>
      <td><strong>${esc(g.tag)}</strong></td><td>${esc(g.name)}</td><td>${g.members}</td>
      <td>${g.level}</td><td>${g.exp.toLocaleString()}</td><td>${g.points.toLocaleString()}</td><td>${g.bank.toLocaleString()}</td>
    </tr>`).join('');
  } catch (e) {}
}
