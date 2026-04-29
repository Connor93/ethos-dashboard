// ENF (NPCs) schema. Field defs derived from etheos/src/eodata.hpp.

export const ENF_TYPES = [
  'NPC','Passive','Aggressive','Pet','NPCMine','NPCKiller','Shop','Inn',
  'Unknown4','Bank','Barber','Guild','Priest','Law','Skills','Quest',
];

const u16 = (key, label, group, extra = {}) => ({ key, label, type: 'int', min: 0, max: 65535, group, ...extra });
const i32 = (key, label, group, extra = {}) => ({ key, label, type: 'int', min: -2147483648, max: 2147483647, group, ...extra });

export const ENF_SCHEMA = {
  type: 'enf',
  label: 'NPCs',
  groups: ['Identity', 'Display', 'Combat', 'Misc'],
  fields: [
    // Identity
    { key: 'id',   label: 'ID',   type: 'int', min: 1, max: 64000, readonly: true, group: 'Identity' },
    { key: 'name', label: 'Name', type: 'string', maxLen: 64, group: 'Identity' },

    // Display
    i32('graphic',   'Graphic',   'Display', { graphic: true }),
    { key: 'type',   label: 'Type',  type: 'enum', values: ENF_TYPES.map((_, i) => i), labels: ENF_TYPES, group: 'Display' },
    u16('boss',      'Boss',      'Display'),
    u16('child',     'Child',     'Display'),

    // Combat
    i32('hp',        'HP',           'Combat'),
    u16('exp',       'EXP',          'Combat'),
    u16('mindam',    'Min Damage',   'Combat'),
    u16('maxdam',    'Max Damage',   'Combat'),
    u16('accuracy',  'Accuracy',     'Combat'),
    u16('evade',     'Evade',        'Combat'),
    u16('armor',     'Armor',        'Combat'),

    // Misc
    u16('vendor_id', 'Vendor ID', 'Misc'),
  ],
};
