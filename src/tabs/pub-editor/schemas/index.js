import { EIF_SCHEMA } from './eif.js';
import { ENF_SCHEMA } from './enf.js';
import { ESF_SCHEMA } from './esf.js';
import { ECF_SCHEMA } from './ecf.js';

export const SCHEMAS = {
  eif: EIF_SCHEMA,
  enf: ENF_SCHEMA,
  esf: ESF_SCHEMA,
  ecf: ECF_SCHEMA,
};

export const PUB_TYPES = ['eif', 'enf', 'esf', 'ecf'];
