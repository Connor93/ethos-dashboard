// Graphic picker modal. Opens a grid of every available graphic from the
// EGF that backs a given (pubType, fieldKey), letting the user click one
// instead of typing an ID.
//
// Each picker config provides:
//   fileId               — EGF file number
//   candidates(graphicId) — list of resource IDs to try, in preference order;
//                          first one that exists in the EGF is used as the
//                          thumbnail. Some graphic types span multiple
//                          resources (spell effects = 3 layers; NPC = 40 frames)
//                          and the canonical "first" resource may not exist
//                          for every graphicId — e.g. a heal spell might only
//                          have the "transparent" layer at offset +2.
//   ownerGraphicId(r)    — given a resource ID present in the EGF, return
//                          which graphic ID it belongs to (or null if not
//                          part of any block this picker enumerates).

import { GfxLoader } from '../../gfx-loader/gfx-loader.ts';

let loader = null;
function getLoader() {
  if (!loader) loader = new GfxLoader();
  return loader;
}

const PICKERS = {
  eif: {
    graphic: {
      fileId: 23,
      // Inventory carry icon (the ground icon is at +1; we prefer the carry).
      candidates: (g) => g > 0 ? [g * 2 - 1 + 100, g * 2 + 100] : [],
      ownerGraphicId: (r) => {
        const v = (r - 100 + 1) / 2;
        return Number.isInteger(v) && v > 0 ? v : null;
      },
    },
  },
  enf: {
    graphic: {
      fileId: 21,
      // 40 frames per NPC; frame 1 (south-facing, animation idx 0) is the
      // standing pose. Fall back to a later frame if frame 1 happens to be
      // missing for an NPC.
      candidates: (g) => g > 0
        ? [1, 5, 9, 13, 17].map(off => (g - 1) * 40 + off + 100)
        : [],
      ownerGraphicId: (r) => {
        const offset = r - 100 - 1;
        if (offset < 0) return null;
        return Math.floor(offset / 40) + 1;
      },
    },
  },
  esf: {
    icon: {
      fileId: 25,
      candidates: (g) => g > 0 ? [g + 100] : [],
      ownerGraphicId: (r) => {
        const v = r - 100;
        return v > 0 ? v : null;
      },
    },
    graphic: {
      fileId: 24,
      // Spell effects have up to 3 layers: behind (+1), transparent (+2),
      // front (+3). A spell may declare only one or two of those, so we try
      // each in order — the first present is used as the thumbnail.
      candidates: (g) => g > 0
        ? [(g - 1) * 3 + 1 + 100, (g - 1) * 3 + 2 + 100, (g - 1) * 3 + 3 + 100]
        : [],
      ownerGraphicId: (r) => {
        const offset = r - 100 - 1;
        if (offset < 0) return null;
        return Math.floor(offset / 3) + 1;
      },
    },
  },
};

export function hasGraphicPicker(pubType, fieldKey) {
  return !!PICKERS[pubType]?.[fieldKey];
}

/**
 * Pick the best available resource ID for a given graphic, by trying each
 * candidate in preference order until one is in the available set.
 * Falls back to the first candidate (which may 404) if no available set
 * is supplied — used by the inline preview that doesn't preload the EGF.
 */
export function bestResourceFor(pubType, fieldKey, graphicId, availableSet) {
  const cfg = PICKERS[pubType]?.[fieldKey];
  if (!cfg) return null;
  const cands = cfg.candidates(graphicId);
  if (cands.length === 0) return null;
  if (!availableSet) return cands[0];
  for (const r of cands) if (availableSet.has(r)) return r;
  return null;
}

export function pickerFileId(pubType, fieldKey) {
  return PICKERS[pubType]?.[fieldKey]?.fileId ?? null;
}

/**
 * Open the picker modal. Resolves with the chosen graphic ID, or null if
 * the user closed without selecting.
 */
export function openGraphicPicker(pubType, fieldKey, currentValue) {
  const cfg = PICKERS[pubType]?.[fieldKey];
  if (!cfg) return Promise.resolve(null);

  return new Promise(async (resolve) => {
    const modal = document.getElementById('pubGraphicPickerModal');
    const body = document.getElementById('pubGraphicPickerBody');
    const closeBtn = document.getElementById('pubGraphicPickerCloseBtn');
    const titleSpan = document.getElementById('pubGraphicPickerTitle');
    const filterInput = document.getElementById('pubGraphicPickerFilter');

    titleSpan.textContent = `Pick a ${pubType.toUpperCase()} ${fieldKey}`;
    body.innerHTML = '<div class="loading-placeholder">Loading graphics…</div>';
    filterInput.value = '';
    modal.style.display = '';

    let allIds = [];
    let availableSet = null;
    try {
      const resources = await getLoader().listResources(cfg.fileId);
      availableSet = new Set(resources);
      // A graphic ID is "available" if at least one of its candidate
      // resources is in the EGF. This is what was missing before — the
      // single-formula version dropped any graphic whose preferred layer
      // happened to be absent.
      const ids = new Set();
      for (const r of resources) {
        const g = cfg.ownerGraphicId(r);
        if (g != null) ids.add(g);
      }
      allIds = Array.from(ids).sort((a, b) => a - b);
    } catch (e) {
      body.innerHTML = '<div class="pub-error">Failed to enumerate graphics: ' + e.message + '</div>';
      return;
    }

    if (allIds.length === 0) {
      body.innerHTML = '<div class="pub-editor-empty">No graphics found in EGF ' + cfg.fileId + '.</div>';
      return;
    }

    const renderGrid = (filterText) => {
      const f = (filterText || '').trim();
      const ids = f ? allIds.filter((g) => String(g).startsWith(f)) : allIds;

      let html = '<div class="pub-gp-grid">';
      for (const g of ids) {
        const sel = g === currentValue ? ' selected' : '';
        html += `<div class="pub-gp-cell${sel}" data-id="${g}" tabindex="0">`;
        html += `<canvas class="pub-gp-canvas" data-id="${g}"></canvas>`;
        html += `<span class="pub-gp-label">${g}</span>`;
        html += `</div>`;
      }
      html += '</div>';
      body.innerHTML = html;

      body.querySelectorAll('.pub-gp-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          cleanup(parseInt(cell.dataset.id, 10));
        });
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            cleanup(parseInt(cell.dataset.id, 10));
          }
        });
      });

      // Lazy-load thumbnails as cells scroll into view.
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const canvas = entry.target;
          const id = parseInt(canvas.dataset.id, 10);
          observer.unobserve(canvas);
          const resourceId = bestResourceFor(pubType, fieldKey, id, availableSet);
          if (resourceId == null) continue;
          getLoader().loadResource(cfg.fileId, resourceId).then(bm => {
            canvas.width = bm.width;
            canvas.height = bm.height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(bm, 0, 0);
          }).catch(() => { /* placeholder stays blank */ });
        }
      }, { root: body, rootMargin: '200px' });
      body.querySelectorAll('.pub-gp-canvas').forEach(c => observer.observe(c));
    };

    renderGrid('');

    const onFilter = (e) => renderGrid(e.target.value);
    filterInput.addEventListener('input', onFilter);

    function cleanup(value) {
      modal.style.display = 'none';
      modal.removeEventListener('click', overlayHandler);
      filterInput.removeEventListener('input', onFilter);
      closeBtn.onclick = null;
      resolve(value);
    }
    function overlayHandler(e) { if (e.target === modal) cleanup(null); }
    modal.addEventListener('click', overlayHandler);
    closeBtn.onclick = () => cleanup(null);
  });
}
