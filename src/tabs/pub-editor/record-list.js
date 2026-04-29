import { esc } from '../../utils/helpers.js';

// Virtualized scroll list. EIF/ENF can have 800+ records; rendering them all
// as DOM nodes is too slow. We render only the visible window (~60 rows) in
// an absolutely-positioned inner div, sized so the scrollbar reflects the
// full record count. On scroll, we recompute the visible slice.

const ROW_HEIGHT = 32; // px — matches .pub-row in style.css
const OVERSCAN = 8;    // extra rows above/below the visible window

/**
 * Render a virtualized record list into `container`.
 *
 * @param {HTMLElement} container - The scrollable wrapper (must have a fixed height in CSS).
 * @param {Array<object>} records - The full record array. Entries with id===0 are hidden.
 * @param {Set<number>} dirtyIds - IDs that have been edited since load (highlighted).
 * @param {(record: object) => void} onSelect - Click handler.
 * @returns {{ refresh: () => void, scrollToId: (id:number) => void, getActiveId: () => number, setActiveId: (id:number) => void }}
 */
export function createRecordList(container, records, dirtyIds, onSelect) {
  // Filter once: skip "empty" records (id 0) which pad the pub array but
  // aren't meaningful to edit. Keep their original index so we can write
  // back to the same slot on save.
  const visible = [];
  for (let i = 0; i < records.length; i++) {
    if (records[i].id !== 0) visible.push({ rec: records[i], idx: i });
  }

  let activeId = visible.length > 0 ? visible[0].rec.id : -1;
  let filterText = '';
  let filtered = visible;

  container.classList.add('pub-record-list');
  container.innerHTML = '<div class="pub-list-spacer"></div><div class="pub-list-window"></div>';
  const spacer = container.querySelector('.pub-list-spacer');
  const window_ = container.querySelector('.pub-list-window');

  function applyFilter() {
    if (!filterText) {
      filtered = visible;
    } else {
      const f = filterText.toLowerCase();
      filtered = visible.filter(({ rec }) => {
        const name = (rec.name || '').toLowerCase();
        return name.includes(f) || String(rec.id).startsWith(f);
      });
    }
    spacer.style.height = (filtered.length * ROW_HEIGHT) + 'px';
  }

  function render() {
    const scrollTop = container.scrollTop;
    const viewport = container.clientHeight;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);

    let html = '';
    for (let i = startIdx; i < endIdx; i++) {
      const { rec } = filtered[i];
      const top = i * ROW_HEIGHT;
      const isActive = rec.id === activeId;
      const isDirty = dirtyIds.has(rec.id);
      const cls = ['pub-row', isActive ? 'active' : '', isDirty ? 'dirty' : ''].filter(Boolean).join(' ');
      html += `<div class="${cls}" style="top:${top}px;height:${ROW_HEIGHT}px" data-idx="${i}">`;
      html += `<span class="pub-row-id">${rec.id}</span>`;
      html += `<span class="pub-row-name">${esc(rec.name || '(unnamed)')}</span>`;
      if (isDirty) html += '<span class="pub-row-dirty">•</span>';
      html += '</div>';
    }
    window_.innerHTML = html;

    window_.querySelectorAll('.pub-row').forEach(row => {
      row.addEventListener('click', () => {
        const i = parseInt(row.dataset.idx, 10);
        if (filtered[i]) {
          activeId = filtered[i].rec.id;
          render();
          onSelect(filtered[i].rec);
        }
      });
    });
  }

  applyFilter();
  render();

  // Re-render on scroll. requestAnimationFrame coalesces scroll storms.
  let scheduled = false;
  container.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  });

  return {
    refresh: render,
    scrollToId(id) {
      const i = filtered.findIndex(({ rec }) => rec.id === id);
      if (i >= 0) container.scrollTop = i * ROW_HEIGHT;
    },
    getActiveId() { return activeId; },
    setActiveId(id) { activeId = id; render(); },
    setFilter(text) { filterText = text; applyFilter(); render(); },
    getFilteredCount() { return filtered.length; },
    getTotalCount() { return visible.length; },
    // Append a record to the visible set after the caller has already pushed
    // it to the underlying records array. The list holds its own `visible`
    // copy, so we re-derive it here.
    addVisibleRecord(rec, idx) {
      visible.push({ rec, idx });
      activeId = rec.id;
      applyFilter();
      render();
      // Scroll to the new row so it's in view.
      const i = filtered.findIndex(({ rec: r }) => r.id === rec.id);
      if (i >= 0) container.scrollTop = i * ROW_HEIGHT;
    },
  };
}
