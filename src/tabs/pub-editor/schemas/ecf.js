// ECF (Classes) schema. Field defs derived from etheos/src/eodata.hpp.

const u8  = (key, label, group, extra = {}) => ({ key, label, type: 'int', min: 0, max: 255, group, ...extra });
const i16 = (key, label, group, extra = {}) => ({ key, label, type: 'int', min: -32768, max: 32767, group, ...extra });

export const ECF_SCHEMA = {
  type: 'ecf',
  label: 'Classes',
  groups: ['Identity', 'Class', 'Stat Bonuses'],
  fields: [
    // Identity
    { key: 'id',   label: 'ID',   type: 'int', min: 1, max: 64000, readonly: true, group: 'Identity' },
    { key: 'name', label: 'Name', type: 'string', maxLen: 64, group: 'Identity' },

    // Class
    u8('base', 'Base Class',    'Class'),
    u8('type', 'Type',          'Class'),

    // Stat Bonuses
    i16('str',  'STR', 'Stat Bonuses'),
    i16('intl', 'INT', 'Stat Bonuses'),
    i16('wis',  'WIS', 'Stat Bonuses'),
    i16('agi',  'AGI', 'Stat Bonuses'),
    i16('con',  'CON', 'Stat Bonuses'),
    i16('cha',  'CHA', 'Stat Bonuses'),
  ],
};
