import { api } from '../api.js';
import { esc } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { showConfirm } from '../utils/confirm.js';

let mtAllItems = [];

export async function loadMaterialTrader() {
  try {
    const d = await api('/api/material-trader');
    const cfg = d.config || {};
    const items = d.items || [];
    const txns = d.transactions || [];
    const stats = d.stats || [];
    let totalGold = 0;
    stats.forEach(s => { totalGold += s.gold_spent + s.gold_earned; });

    // Summary cards
    document.getElementById('mtCards').innerHTML = `
      <div class="card"><div class="card-label">Items Listed</div><div class="card-value">${items.length}</div><div class="card-sub">EIF::Static drops</div></div>
      <div class="card info"><div class="card-label">Spread</div><div class="card-value">${((cfg.spread - 1) * 100).toFixed(0)}%</div><div class="card-sub">Buy markup</div></div>
      <div class="card warning"><div class="card-label">Decay Rate</div><div class="card-value">${cfg.decay_rate}%</div><div class="card-sub">Per tick</div></div>
      <div class="card success"><div class="card-label">Gold Volume</div><div class="card-value">${totalGold.toLocaleString()}</div><div class="card-sub">Total traded</div></div>
    `;

    // Merge active + excluded items
    const excluded = d.excluded_items || [];
    mtAllItems = [
      ...items.map(it => ({ ...it, excluded: false })),
      ...excluded.map(ex => ({ id: ex.id, name: ex.name, excluded: true }))
    ].sort((a, b) => a.id - b.id);

    document.getElementById('mtItemCount').textContent = items.length;

    // Set up search handler (only once)
    const searchEl = document.getElementById('mtSearch');
    if (!searchEl.dataset.bound) {
      searchEl.addEventListener('input', filterMtPrices);
      searchEl.dataset.bound = '1';
    }

    filterMtPrices();

    // Stats table
    if (stats.length === 0) {
      document.getElementById('mtStatsTable').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">No trading activity yet</td></tr>';
    } else {
      const sorted = [...stats].sort((a, b) => (b.total_bought + b.total_sold) - (a.total_bought + a.total_sold));
      document.getElementById('mtStatsTable').innerHTML = sorted.slice(0, 20).map(s => `<tr>
        <td><strong>${esc(s.name || 'ID:' + s.id)}</strong></td>
        <td>${s.total_bought.toLocaleString()}</td>
        <td>${s.total_sold.toLocaleString()}</td>
        <td style="color:var(--danger)">${s.gold_spent.toLocaleString()}g</td>
        <td style="color:var(--success)">${s.gold_earned.toLocaleString()}g</td>
      </tr>`).join('');
    }

    // Transactions table
    document.getElementById('mtTxnCount').textContent = txns.length;
    if (txns.length === 0) {
      document.getElementById('mtTxnTable').innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px">No transactions yet</td></tr>';
    } else {
      document.getElementById('mtTxnTable').innerHTML = txns.map(t => {
        const typeColor = t.type === 'BUY' ? 'var(--info)' : 'var(--success)';
        return `<tr>
          <td style="color:var(--text-muted)">${esc(t.time)}</td>
          <td><strong>${esc(t.player)}</strong></td>
          <td><span style="color:${typeColor};font-weight:600">${t.type}</span></td>
          <td>${esc(t.item_name || 'ID:' + t.item_id)}</td>
          <td>${t.amount}</td>
          <td>${t.price_each}g</td>
          <td style="font-weight:600">${t.total_gold.toLocaleString()}g</td>
        </tr>`;
      }).join('');
    }
  } catch (e) {
    document.getElementById('mtCards').innerHTML = '<div style="color:var(--danger)">Error: ' + esc(e.message) + '</div>';
  }
}

function filterMtPrices() {
  const q = (document.getElementById('mtSearch') || {}).value || '';
  const ql = q.toLowerCase();
  const filtered = ql ? mtAllItems.filter(it => (it.name || '').toLowerCase().includes(ql) || String(it.id).includes(ql)) : mtAllItems;
  const tb = document.getElementById('mtPriceTable');

  if (!filtered.length) {
    tb.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:30px">No items match</td></tr>';
    return;
  }

  tb.innerHTML = filtered.map(it => {
    if (it.excluded) {
      return `<tr style="opacity:.35">
        <td>${it.id}</td>
        <td style="font-style:italic">${esc(it.name || '?')}</td>
        <td colspan="7" style="text-align:center;color:var(--text-muted);font-size:.8rem">Excluded</td>
        <td></td>
        <td><button class="mt-include-btn" data-id="${it.id}" style="padding:4px 8px;border:none;border-radius:6px;background:rgba(16,185,129,.15);color:var(--success);cursor:pointer;font-size:.75rem;font-weight:600" title="Re-add to trader">&#x2714;</button></td>
      </tr>`;
    }
    const chg = it.pct_change;
    const chgColor = chg > 0 ? 'var(--success)' : chg < 0 ? 'var(--danger)' : 'var(--text-muted)';
    const chgStr = (chg > 0 ? '+' : '') + chg.toFixed(1) + '%';
    return `<tr>
      <td>${it.id}</td>
      <td><strong>${esc(it.name || '?')}</strong></td>
      <td style="font-weight:600;color:${it.stock > 0 ? 'var(--success)' : 'var(--danger)'}">${it.stock}</td>
      <td>${it.base_price}</td>
      <td>${it.sell_price}</td>
      <td>${it.buy_price}</td>
      <td style="color:${chgColor};font-weight:600">${chgStr}</td>
      <td style="color:var(--text-muted)">${it.min_price}</td>
      <td style="color:var(--text-muted)">${it.max_price}</td>
      <td><div style="display:flex;gap:4px;align-items:center">
        <input type="number" class="mt-bp-input" data-id="${it.id}" value="${it.base_price}" min="1" style="width:70px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:.8rem;outline:none">
        <button class="mt-bp-btn" data-id="${it.id}" style="padding:4px 10px;border:none;border-radius:6px;background:var(--accent);color:white;cursor:pointer;font-size:.75rem;font-weight:600">Set</button>
      </div></td>
      <td><button class="mt-exclude-btn" data-id="${it.id}" style="padding:4px 8px;border:none;border-radius:6px;background:rgba(239,68,68,.15);color:var(--danger);cursor:pointer;font-size:.75rem;font-weight:600" title="Remove from trader">&#x2716;</button></td>
    </tr>`;
  }).join('');

  // Attach handlers via event delegation on the table body
  tb.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('mt-exclude-btn')) {
      const id = btn.dataset.id;
      const ok = await showConfirm('Remove item ' + id + ' from the material trader?');
      if (!ok) return;
      try {
        await api('/api/material-trader', { method: 'POST', body: { action: 'exclude', item_id: String(id) } });
        showToast('Item ' + id + ' removed from trader', 'success');
        loadMaterialTrader();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    if (btn.classList.contains('mt-include-btn')) {
      const id = btn.dataset.id;
      try {
        await api('/api/material-trader', { method: 'POST', body: { action: 'include', item_id: String(id) } });
        showToast('Item ' + id + ' added back to trader', 'success');
        loadMaterialTrader();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    if (btn.classList.contains('mt-bp-btn')) {
      const id = btn.dataset.id;
      const inp = tb.querySelector(`.mt-bp-input[data-id="${id}"]`);
      if (!inp) return;
      const val = parseInt(inp.value);
      if (!val || val <= 0) { showToast('Invalid price', 'error'); return; }
      try {
        await api('/api/material-trader', { method: 'POST', body: { item_id: String(id), base_price: String(val) } });
        showToast('Base price updated for item ' + id, 'success');
        loadMaterialTrader();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }
  };
}
