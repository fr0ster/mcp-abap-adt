import { answeredObject } from '@mcp-abap-adt/adt-strategies';
import type { AdtTypeCode } from '@mcp-abap-adt/interfaces-adt';

/**
 * A type-code argument as a code of the ADT type tables: the text, upper-cased
 * once, looked up against the tables (`answeredObject`); `undefined` for any
 * other text — a friendly name, a bare main type, a code no table holds.
 *
 * A tool argument comes from outside the type system, so this is where it is
 * checked; past it the code is typed by the tables.
 */
export function tableCodeOf(text: string): AdtTypeCode | undefined {
  return answeredObject(text.toUpperCase()).type;
}

/** The fixed words a type argument that is no code of the tables is refused in. */
export function notATableCode(argument: string, text: string): string {
  return `${argument} "${text}" is not an ADT type code (such as CLAS/OC or DEVC/K); nothing was sent`;
}

/**
 * The names the tools took for a type before adt-clients 38 stopped reading
 * them, each with the code of the tables it addressed: the friendly names of
 * its where-used aliases and the main types its address builder read
 * (adt-clients 37.2.0). The tools' arguments name them, so the server reads
 * them now; the code each maps to is checked against the tables here.
 */
const TYPE_NAMES: Readonly<Record<string, AdtTypeCode>> = {
  class: 'CLAS/OC',
  program: 'PROG/P',
  include: 'PROG/I',
  function: 'FUGR/F',
  functiongroup: 'FUGR/F',
  interface: 'INTF/OI',
  package: 'DEVC/K',
  table: 'TABL/DT',
  structure: 'TABL/DS',
  domain: 'DOMA/DD',
  dataelement: 'DTEL/DE',
  view: 'DDLS/DF',
  functionmodule: 'FUGR/FF',
  function_module: 'FUGR/FF',
  clas: 'CLAS/OC',
  prog: 'PROG/P',
  fugr: 'FUGR/F',
  func: 'FUGR/F',
  tabl: 'TABL/DT',
  stru: 'TABL/DS',
  'stru/ds': 'TABL/DS',
  ddls: 'DDLS/DF',
  dtel: 'DTEL/DE',
  doma: 'DOMA/DD',
  intf: 'INTF/OI',
  ttyp: 'TTYP/DA',
  srvd: 'SRVD/SRV',
  srvb: 'SRVB/SVB',
  ddlx: 'DDLX/EX',
  bdef: 'BDEF/BDO',
  dcls: 'DCLS/DL',
  xslt: 'XSLT/VT',
  ftg2: 'FTG2/FT',
  devc: 'DEVC/K',
};

/**
 * A type argument as a code of the tables: one of the names the tools have
 * always taken ({@link TYPE_NAMES}, either case), else {@link tableCodeOf}.
 */
export function typeCodeOf(text: string): AdtTypeCode | undefined {
  return Object.hasOwn(TYPE_NAMES, text.toLowerCase())
    ? TYPE_NAMES[text.toLowerCase()]
    : tableCodeOf(text);
}
