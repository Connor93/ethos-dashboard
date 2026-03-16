/** HTML-escape a string */
export function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render an admin badge */
export function adminBadge(admin, level) {
  if (level <= 0) return '';
  const cls = admin === 'HGM' ? 'hgm' : admin === 'GM' ? 'gm' : admin === 'Guardian' ? 'guardian' : 'guide';
  return `<span class="badge-admin ${cls}">${admin}</span>`;
}

/** Player log category badge */
export function plogCatBadge(cat) {
  let cls = '';
  if (cat.indexOf('XP') >= 0) cls = 'xp';
  else if (cat.indexOf('TRADE') >= 0) cls = 'trade';
  else if (
    cat.indexOf('ITEM') >= 0 || cat.indexOf('SHOP') >= 0 || cat.indexOf('BANK') >= 0 ||
    cat.indexOf('CHEST') >= 0 || cat.indexOf('LOCKER') >= 0 || cat.indexOf('GIFTBOX') >= 0 ||
    cat.indexOf('QUEST_ITEM') >= 0 || cat.indexOf('ACHIEVEMENT_ITEM') >= 0
  ) cls = 'item';
  else if (cat === 'WARP') cls = 'warp';
  else if (cat === 'LOGOUT') cls = 'danger';
  return `<span class="plog-cat-badge ${cls}">${esc(cat)}</span>`;
}

/** Format a unix timestamp to locale time string */
export function chatTimeStr(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
