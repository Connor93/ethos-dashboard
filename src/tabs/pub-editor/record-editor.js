import { esc } from '../../utils/helpers.js';
import { hasPreview, renderGfxPreview } from './gfx-preview.js';
import { hasGraphicPicker, openGraphicPicker } from './graphic-picker.js';

/**
 * Validate a single field value against its schema. Returns null if valid,
 * or an error string. Used inline as the user edits, and in bulk before save.
 */
export function validateField(field, value) {
  if (field.type === 'int') {
    if (!Number.isInteger(value)) return 'must be an integer';
    if (value < field.min || value > field.max) return `out of range (${field.min}–${field.max})`;
    return null;
  }
  if (field.type === 'enum') {
    if (!field.values.includes(value)) return 'invalid enum value';
    return null;
  }
  if (field.type === 'string') {
    if (typeof value !== 'string') return 'must be a string';
    if (value.length > field.maxLen) return `too long (max ${field.maxLen} chars)`;
    return null;
  }
  return null;
}

/**
 * Validate every field of a record. Returns a list of {field, error} objects.
 */
export function validateRecord(schema, record) {
  const errors = [];
  for (const field of schema.fields) {
    if (field.readonly) continue;
    const e = validateField(field, record[field.key]);
    if (e) errors.push({ field: field.label, key: field.key, error: e });
  }
  return errors;
}

/**
 * Render the detail editor for a single record. Sections are derived from
 * the schema's `groups` order; fields are sorted into their group.
 */
export function renderRecordEditor(container, schema, record, onChange) {
  if (!record) {
    container.innerHTML = '<div class="pub-editor-empty">Select a record to view details.</div>';
    return;
  }

  // Bucket fields by group, preserving the per-group declaration order.
  const buckets = new Map();
  for (const g of schema.groups || ['Fields']) buckets.set(g, []);
  for (const field of schema.fields) {
    const g = field.group || 'Fields';
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g).push(field);
  }

  let html = '';
  html += '<div class="pub-record-header">';
  html += '<h3>' + esc(schema.label) + ' #' + record.id + ' — <span class="pub-record-name">' + esc(record.name || '(unnamed)') + '</span></h3>';
  html += '</div>';

  for (const [group, fields] of buckets) {
    if (fields.length === 0) continue;
    // Tighter columns for the small enum-and-stat groups; wider for long-name groups.
    const compact = group === 'Stats' || group === 'Resistances' || group === 'Stat Bonuses' || group === 'Requirements';
    html += `<section class="pub-section" data-group="${esc(group)}">`;
    html += `<h4 class="pub-section-title">${esc(group)}</h4>`;
    html += `<div class="pub-field-grid${compact ? ' pub-field-grid-compact' : ''}">`;

    for (const field of fields) {
      html += renderField(schema, record, field);
    }
    html += '</div></section>';
  }

  container.innerHTML = html;

  // Wire up change handlers + graphic-picker browse buttons + previews.
  container.querySelectorAll('.pub-field-input').forEach(input => {
    input.addEventListener('input', () => handleChange(container, schema, record, input, onChange));
    input.addEventListener('change', () => handleChange(container, schema, record, input, onChange));
  });
  container.querySelectorAll('.pub-field-browse').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const newVal = await openGraphicPicker(schema.type, key, record[key]);
      if (newVal == null) return;
      const input = container.querySelector(`.pub-field-input[data-key="${key}"]`);
      if (input) {
        input.value = String(newVal);
        handleChange(container, schema, record, input, onChange);
      }
    });
  });
  for (const field of schema.fields) {
    if (!hasPreview(schema.type, field.key)) continue;
    const slot = container.querySelector(`.pub-gfx-preview[data-field="${field.key}"]`);
    if (slot) renderGfxPreview(slot, schema.type, field.key, record[field.key]);
  }
}

function renderField(schema, record, field) {
  const value = record[field.key];
  const isGraphic = field.graphic === true;
  const showPreview = hasPreview(schema.type, field.key);
  const showBrowse = hasGraphicPicker(schema.type, field.key);

  // Tooltip for long/cryptic labels
  const titleAttr = field.hint ? ` title="${esc(field.hint)}"` : '';

  let html = '<div class="pub-field' + (isGraphic ? ' pub-field-graphic' : '') + '" data-field-key="' + esc(field.key) + '">';
  html += '<label' + titleAttr + '>' + esc(field.label);
  if (field.readonly) html += ' <span class="pub-field-ro">(read-only)</span>';
  html += '</label>';

  // Render the input + (optional) browse button on one row
  html += '<div class="pub-field-input-row">';
  if (field.readonly) {
    html += '<div class="pub-field-value pub-field-readonly">' + esc(String(value ?? '')) + '</div>';
  } else if (field.type === 'enum') {
    html += '<select class="pub-field-input" data-key="' + esc(field.key) + '">';
    for (let i = 0; i < field.values.length; i++) {
      const v = field.values[i];
      const sel = v === value ? ' selected' : '';
      html += `<option value="${v}"${sel}>${v} — ${esc(field.labels[i])}</option>`;
    }
    html += '</select>';
  } else if (field.type === 'string') {
    html += `<input type="text" class="pub-field-input" data-key="${esc(field.key)}" value="${esc(String(value ?? ''))}" maxlength="${field.maxLen}">`;
  } else {
    html += `<input type="number" class="pub-field-input" data-key="${esc(field.key)}" value="${esc(String(value ?? 0))}" min="${field.min}" max="${field.max}">`;
  }
  if (showBrowse) {
    html += `<button type="button" class="pub-field-browse" data-key="${esc(field.key)}" title="Browse graphics">&#x1F50D;</button>`;
  }
  html += '</div>';

  html += '<div class="pub-field-error" hidden></div>';
  if (showPreview) html += '<div class="pub-gfx-preview" data-field="' + esc(field.key) + '"></div>';
  html += '</div>';
  return html;
}

function handleChange(container, schema, record, input, onChange) {
  const key = input.dataset.key;
  const field = schema.fields.find(f => f.key === key);
  if (!field) return;

  let value;
  if (field.type === 'string') {
    value = input.value;
  } else {
    const raw = input.value.trim();
    value = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value)) value = 0;
    if (field.type === 'int') value = Math.trunc(value);
  }

  record[key] = value;

  const fieldEl = input.closest('.pub-field');
  const errorEl = fieldEl.querySelector('.pub-field-error');
  const err = validateField(field, value);
  if (err) {
    errorEl.textContent = err;
    errorEl.hidden = false;
    fieldEl.classList.add('invalid');
  } else {
    errorEl.hidden = true;
    fieldEl.classList.remove('invalid');
  }

  if (hasPreview(schema.type, key)) {
    const slot = fieldEl.querySelector('.pub-gfx-preview');
    if (slot) renderGfxPreview(slot, schema.type, key, value);
  }
  if (key === 'name') {
    const nameEl = container.querySelector('.pub-record-name');
    if (nameEl) nameEl.textContent = value || '(unnamed)';
  }

  onChange(record, key);
}
