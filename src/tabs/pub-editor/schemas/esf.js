// ESF (Spells) schema. Field defs derived from etheos/src/eodata.hpp.

export const ESF_TYPES = ['Heal','Damage','Bard'];
export const ESF_TARGET_RESTRICT = ['NPCOnly','Friendly','Opponent'];
// Target enum has a hole at 2 ('Unknown1'); we keep it visible for round-trip.
export const ESF_TARGETS = ['Normal','Self','Unknown1','Group'];

const u8  = (key, label, group, extra = {}) => ({ key, label, type: 'int', min: 0, max: 255, group, ...extra });
const u16 = (key, label, group, extra = {}) => ({ key, label, type: 'int', min: 0, max: 65535, group, ...extra });

export const ESF_SCHEMA = {
  type: 'esf',
  label: 'Spells',
  groups: ['Identity', 'Display', 'Cast', 'Combat'],
  fields: [
    // Identity
    { key: 'id',    label: 'ID',     type: 'int', min: 1, max: 64000, readonly: true, group: 'Identity' },
    { key: 'name',  label: 'Name',   type: 'string', maxLen: 64, group: 'Identity' },
    { key: 'shout', label: 'Shout',  type: 'string', maxLen: 64, group: 'Identity' },

    // Display
    u16('icon',     'Icon',     'Display', { graphic: true }),
    u16('graphic',  'Graphic',  'Display', { graphic: true }),

    // Cast
    u16('tp',       'TP Cost',     'Cast'),
    u16('sp',       'SP Cost',     'Cast'),
    u8('cast_time', 'Cast Time',   'Cast'),
    { key: 'type',            label: 'Type',     type: 'enum', values: ESF_TYPES.map((_, i) => i),            labels: ESF_TYPES,            group: 'Cast' },
    { key: 'target_restrict', label: 'Restrict', type: 'enum', values: ESF_TARGET_RESTRICT.map((_, i) => i),  labels: ESF_TARGET_RESTRICT,  group: 'Cast' },
    { key: 'target',          label: 'Target',   type: 'enum', values: ESF_TARGETS.map((_, i) => i),          labels: ESF_TARGETS,          group: 'Cast' },

    // Combat
    u16('mindam',   'Min Damage', 'Combat'),
    u16('maxdam',   'Max Damage', 'Combat'),
    u16('accuracy', 'Accuracy',   'Combat'),
    u16('hp',       'HP',         'Combat'),
  ],
};
