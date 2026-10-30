/**
 * The literal scan's own verdicts (`helpers/typeCodeScan.ts`), on small
 * in-memory programs typed through `tsconfig.test.json`: a typed code
 * literal passes, an untyped one fails, a comment naming a code of the
 * tables passes, one naming a code no table holds fails — and so for a code
 * inside a longer string (a tool description), a main type, a search name,
 * the debugger's labels and a projection list.
 */

import { join } from 'node:path';
import { typeCodeFindings } from './helpers/typeCodeScan';

const ROOT = join(__dirname, '../../../..');
const TSCONFIG = join(ROOT, 'tsconfig.test.json');
const FIXTURE = join(ROOT, 'src/__typeCodeScanFixture__/fixture.ts');

/** A template substitution in a fixture's source, spelled without `${` in a plain string. */
const SUBSTITUTION = `${'$'}{name}`;

function scan(text: string): string[] {
  return typeCodeFindings(ROOT, TSCONFIG, [], new Map([[FIXTURE, text]])).map(
    (finding) => finding.line,
  );
}

describe('the literal scan of type codes', () => {
  it('passes a code literal whose contextual type is AdtTypeCode', () => {
    expect(
      scan(
        [
          "import type { AdtTypeCode } from '@mcp-abap-adt/interfaces-adt';",
          "export const code: AdtTypeCode = 'CLAS/OC';",
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('fails a code literal with no code type, naming file and line', () => {
    expect(scan("export const code: string = 'CLAS/OC';")).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:1 'CLAS/OC' — contextual type string is not made of codes, main types, search names or debugger labels",
    ]);
  });

  it('passes a comment naming a code of the tables', () => {
    expect(
      scan(
        ['/** Reads a `CLAS/OC` class. */', 'export const x = 1;'].join('\n'),
      ),
    ).toEqual([]);
  });

  it('fails a comment naming a code no table holds', () => {
    expect(
      scan(['export const x = 1;', '// Reads a `DOMA/DM` domain.'].join('\n')),
    ).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:2 'DOMA/DM' — named in a comment, not a code of the tables",
    ]);
  });

  it('passes a code of the tables inside a longer string or a template span', () => {
    expect(
      scan(
        [
          'export const reference = (name: string) =>',
          `  \`<adtcore:objectReference adtcore:name="${SUBSTITUTION}" adtcore:type="FUGR/I"/>\`;`,
          "export const message = 'pass a code, e.g. CLAS/OC or PROG/P';",
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('fails a code no table holds inside a template span, naming its line', () => {
    expect(
      scan(
        [
          'export const reference = (name: string) =>',
          `  \`<adtcore:objectReference adtcore:name="${SUBSTITUTION}"`,
          '    adtcore:type="FUGR/ZZ"/>`;',
        ].join('\n'),
      ),
    ).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:3 'FUGR/ZZ' — inside a string, not a code of the tables",
    ]);
  });

  it('passes a tool description naming codes of the tables, and fails one naming a code no table holds', () => {
    expect(
      scan(
        [
          'export const TOOL_DEFINITION = {',
          "  name: 'Probe',",
          "  description: 'Takes DOMA/DD or BDEF/BDO.',",
          '};',
          'export const OTHER_DEFINITION = {',
          "  name: 'Other',",
          "  description: 'Takes DOMA/DM or BDEF/BD.',",
          '};',
        ].join('\n'),
      ),
    ).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:7 'DOMA/DM' — inside a string, not a code of the tables",
      "src/__typeCodeScanFixture__/fixture.ts:7 'BDEF/BD' — inside a string, not a code of the tables",
    ]);
  });

  it('passes a main type typed by a projection, and fails one typed string', () => {
    expect(
      scan(
        [
          "import type { AdtTypeCodeOf } from '@mcp-abap-adt/interfaces-adt';",
          "import type { MainTypeOfOne } from '../lib/adtProjections';",
          "export const one: MainTypeOfOne<AdtTypeCodeOf<'onprem'>> = 'CLAS';",
          "export const loose: string = 'ENHO';",
        ].join('\n'),
      ),
    ).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:4 'ENHO' — contextual type string is not made of codes, main types, search names or debugger labels",
    ]);
  });

  it("passes a main type typed by its code's entry and a search name typed by the search names, and fails each typed string", () => {
    expect(
      scan(
        [
          "import type { AdtSearchTypeOf } from '@mcp-abap-adt/interfaces-adt';",
          "import type { TableMainOf } from '../lib/adtProjections';",
          "export const main: TableMainOf<'ENHO/XHH'> = 'ENHO';",
          "export const name: AdtSearchTypeOf<'onprem'> = 'STRU';",
          "export const group: AdtSearchTypeOf<'cloud'> = 'ABAP_TEST_COCKPIT';",
          "export const looseMain: string = 'ENHO';",
          "export const looseName: string = 'STRU';",
          "export const looseGroup: string = 'ABAP_TEST_COCKPIT';",
        ].join('\n'),
      ),
    ).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:6 'ENHO' — contextual type string is not made of codes, main types, search names or debugger labels",
      "src/__typeCodeScanFixture__/fixture.ts:7 'STRU' — contextual type string is not made of codes, main types, search names or debugger labels",
      "src/__typeCodeScanFixture__/fixture.ts:8 'ABAP_TEST_COCKPIT' — contextual type string is not made of codes, main types, search names or debugger labels",
    ]);
  });

  it('reads a search name in prose as prose: only a word of the code shape is a code', () => {
    expect(
      scan(
        [
          '// Searches by STRU or ABAP_TEST_COCKPIT, never by TABL/ZZ.',
          "export const words = 'filter by STRU, DTAB or FUNC';",
        ].join('\n'),
      ),
    ).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:1 'TABL/ZZ' — named in a comment, not a code of the tables",
    ]);
  });

  it("passes the debugger's labels typed by its union, and fails one typed string", () => {
    expect(
      scan(
        [
          "import type { BreakpointLabel } from '../lib/debugger/objectUri';",
          "export const include: BreakpointLabel = 'INCL';",
          "export const loose: string = 'INCL';",
        ].join('\n'),
      ),
    ).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:3 'INCL' — contextual type string is not made of codes, main types, search names or debugger labels",
    ]);
  });

  it('passes a projected list and a satisfies list, and fails a list typed by nothing', () => {
    expect(
      scan(
        [
          'import type {',
          '  AdtTypeCode,',
          '  AdtTypeCodeOf,',
          "} from '@mcp-abap-adt/interfaces-adt';",
          "import { type AdtCodes, projected } from '../lib/adtProjections';",
          'export const BOTH = projected<',
          "  Extract<AdtTypeCodeOf<'onprem'>, AdtCodes<'DOMA/DD'>>,",
          "  Extract<AdtTypeCodeOf<'cloud'>, AdtCodes<'DOMA/DD'>>",
          ">()({ onprem: ['DOMA/DD'], cloud: ['DOMA/DD'] });",
          "export const LISTED = ['DTEL/DE'] as const satisfies readonly AdtTypeCode[];",
          "export const LOOSE = ['DTEL/DE'] as const;",
        ].join('\n'),
      ),
    ).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:11 'DTEL/DE' — no contextual type",
    ]);
  });

  it('passes keys, comparisons and type arguments typed by the codes', () => {
    expect(
      scan(
        [
          "import type { AdtTypeCode } from '@mcp-abap-adt/interfaces-adt';",
          "import type { AdtCodes } from '../lib/adtProjections';",
          'export const keyed = {',
          "  'CLAS/OC': 1,",
          '} satisfies Partial<Record<AdtTypeCode, number>>;',
          'export function isClass(code: AdtTypeCode): boolean {',
          "  return code === 'CLAS/OC';",
          '}',
          "export type Module = AdtCodes<'FUGR/FF' | 'FUGR/I'>;",
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('fails a key, a comparison and a literal type not typed by the codes', () => {
    expect(
      scan(
        [
          "export const keyed = { 'CLAS/OC': 1 };",
          "export const isClass = (code: string) => code === 'CLAS/OC';",
          "export type Code = 'CLAS/OC';",
        ].join('\n'),
      ),
    ).toEqual([
      "src/__typeCodeScanFixture__/fixture.ts:1 'CLAS/OC' — a property name whose object is not keyed by the code types",
      "src/__typeCodeScanFixture__/fixture.ts:2 'CLAS/OC' — compared with string, which is not made of codes, main types, search names or debugger labels",
      "src/__typeCodeScanFixture__/fixture.ts:3 'CLAS/OC' — a literal type outside a type argument constrained to the code types",
    ]);
  });
});
