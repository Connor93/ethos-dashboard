import { esc } from './helpers.js';

/** Show a toast notification */
export function showToast(msg, type) {
  type = type || 'info';
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icons = { success: '\u2714', error: '\u2718', info: '\u2139' };
  t.innerHTML = '<span>' + (icons[type] || '') + '</span><span>' + esc(msg) + '</span>';
  c.appendChild(t);
  setTimeout(() => { t.classList.add('fadeout'); setTimeout(() => t.remove(), 300); }, 3000);
}
