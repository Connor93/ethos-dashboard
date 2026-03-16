import { api } from '../api.js';
import { esc } from '../utils/helpers.js';

export async function loadConfig() {
  try {
    const d = await api('/api/config');
    document.getElementById('configGrid').innerHTML = Object.entries(d).map(([k, v]) => `
      <div class="config-item"><span class="config-key">${esc(k)}</span><span class="config-val">${esc(String(v))}</span></div>
    `).join('');
  } catch (e) {}
}
