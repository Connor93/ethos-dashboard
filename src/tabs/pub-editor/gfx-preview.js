// Inline GFX preview component. Wraps the ported em-web-client GfxLoader
// to render EGF resources to a small canvas. Multi-candidate resource
// lookup mirrors the picker's behavior — spell effects, NPC frames, and
// item icons may have only some of their potential layers/frames present
// in the EGF, and we fall through candidates until one loads.

import { GfxLoader } from '../../gfx-loader/gfx-loader.ts';
import { hasGraphicPicker, pickerFileId, bestResourceFor } from './graphic-picker.js';

let loader = null;
function getLoader() {
  if (!loader) loader = new GfxLoader();
  return loader;
}

export function hasPreview(pubType, fieldKey) {
  return hasGraphicPicker(pubType, fieldKey);
}

export async function renderGfxPreview(container, pubType, fieldKey, value) {
  container.innerHTML = '';
  const fileId = pickerFileId(pubType, fieldKey);
  if (fileId == null || !value || value <= 0) {
    container.innerHTML = '<span class="pub-gfx-empty">no preview</span>';
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'pub-gfx-canvas';
  canvas.width = 64;
  canvas.height = 64;
  container.appendChild(canvas);

  // Make sure the EGF is loaded so we can pick the best candidate. The
  // loader caches per-file across the session.
  let availableSet = null;
  try {
    const resources = await getLoader().listResources(fileId);
    availableSet = new Set(resources);
  } catch {}

  const resourceId = bestResourceFor(pubType, fieldKey, value, availableSet);
  if (resourceId == null) {
    container.innerHTML = '<span class="pub-gfx-empty">no preview</span>';
    return;
  }

  try {
    const bitmap = await getLoader().loadResource(fileId, resourceId);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);
  } catch {
    container.innerHTML = '<span class="pub-gfx-empty">no preview</span>';
  }
}
