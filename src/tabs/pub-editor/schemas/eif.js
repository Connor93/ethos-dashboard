// EIF (Items) schema. Field defs derived from etheos/src/eodata.hpp.
// Each field: key, label, type ('int'|'string'|'enum'), group (for sectioned
// rendering), and either {min,max} for int / {maxLen} for string /
// {values,labels} for enum. `graphic: true` flags fields that should get
// the graphic picker affordance.

export const EIF_TYPES = [
  'Static','UnknownType1','Money','Heal','Teleport','Transform',
  'EXPReward','SkillReward','Visual','Key','Weapon','Shield','Armor',
  'Hat','Boots','Gloves','Accessory','Belt','Necklace','Ring','Armlet',
  'Bracer','Beer','EffectPotion','HairDye','CureCurse','Title',
];

export const EIF_SUBTYPES = ['None','Ranged','Arrows','Wings','TwoHanded'];

export const EIF_SPECIALS = ['Normal','Rare','UnknownSpecial2','Unique','Lore','Cursed'];

export const EIF_SIZES = ['Size1x1','Size1x2','Size1x3','Size1x4','Size2x1','Size2x2','Size2x3','Size2x4'];

const u8  = (key, label, group, extra = {}) => ({ key, label, type: 'int', min: 0, max: 255, group, ...extra });
const u16 = (key, label, group, extra = {}) => ({ key, label, type: 'int', min: 0, max: 65535, group, ...extra });
const i32 = (key, label, group, extra = {}) => ({ key, label, type: 'int', min: -2147483648, max: 2147483647, group, ...extra });

export const EIF_SCHEMA = {
  type: 'eif',
  label: 'Items',
  // Display order for groups in the editor pane.
  groups: ['Identity', 'Display', 'Combat', 'Stats', 'Resistances', 'Special', 'Requirements', 'Misc'],
  fields: [
    // Identity
    { key: 'id',        label: 'ID',        type: 'int', min: 1, max: 64000, readonly: true, group: 'Identity' },
    { key: 'name',      label: 'Name',      type: 'string', maxLen: 64, group: 'Identity' },

    // Display
    u16('graphic',  'Graphic',  'Display', { graphic: true }),
    { key: 'type',      label: 'Type',      type: 'enum', values: EIF_TYPES.map((_, i) => i), labels: EIF_TYPES, group: 'Display' },
    { key: 'subtype',   label: 'Subtype',   type: 'enum', values: EIF_SUBTYPES.map((_, i) => i), labels: EIF_SUBTYPES, group: 'Display' },
    { key: 'special',   label: 'Special',   type: 'enum', values: EIF_SPECIALS.map((_, i) => i), labels: EIF_SPECIALS, group: 'Display' },
    { key: 'size',      label: 'Size',      type: 'enum', values: EIF_SIZES.map((_, i) => i),   labels: EIF_SIZES,    group: 'Display' },

    // Combat
    u16('hp',       'HP',           'Combat'),
    u16('tp',       'TP',           'Combat'),
    u16('mindam',   'Min Damage',   'Combat'),
    u16('maxdam',   'Max Damage',   'Combat'),
    u16('accuracy', 'Accuracy',     'Combat'),
    u16('evade',    'Evade',        'Combat'),
    u16('armor',    'Armor',        'Combat'),

    // Stats (the six base attributes)
    u8('str',  'STR', 'Stats'),
    u8('intl', 'INT', 'Stats'),
    u8('wis',  'WIS', 'Stats'),
    u8('agi',  'AGI', 'Stats'),
    u8('con',  'CON', 'Stats'),
    u8('cha',  'CHA', 'Stats'),

    // Resistances (6 elements)
    u8('light', 'Light', 'Resistances'),
    u8('dark',  'Dark',  'Resistances'),
    u8('earth', 'Earth', 'Resistances'),
    u8('air',   'Air',   'Resistances'),
    u8('water', 'Water', 'Resistances'),
    u8('fire',  'Fire',  'Resistances'),

    // Special (union fields — meaning depends on item type)
    i32('spec1', 'Spec1', 'Special', { hint: 'scrollmap / dollgraphic / expreward / haircolor / effect / key' }),
    u8('spec2',  'Spec2', 'Special', { hint: 'gender / scrollx' }),
    u8('spec3',  'Spec3', 'Special', { hint: 'scrolly / dual_wield_dollgraphic' }),

    // Requirements
    u16('levelreq', 'Level',  'Requirements'),
    u16('classreq', 'Class',  'Requirements'),
    u16('strreq',   'STR',    'Requirements'),
    u16('intreq',   'INT',    'Requirements'),
    u16('wisreq',   'WIS',    'Requirements'),
    u16('agireq',   'AGI',    'Requirements'),
    u16('conreq',   'CON',    'Requirements'),
    u16('chareq',   'CHA',    'Requirements'),

    // Misc
    u8('weight', 'Weight', 'Misc'),
  ],
};
