/**
 * The tool set each declared variant registers, read from the server as a
 * client reads it (`tools/list`, stdio over an in-memory transport): for each
 * of the four kinds of binary, the tools listed and, for the tools whose
 * members pick the API, the members their enum lists and the properties
 * their schema lists.
 *
 * The variant is the process's declared system type (`SAP_SYSTEM_TYPE`):
 * `onprem` and `legacy` read `ADT_TYPES_ONPREM`, `cloud` reads
 * `ADT_TYPES_CLOUD` (`variantToolSet.ts`); `available_in` filters beside it.
 * The fixture shows exactly which tools each variant gets.
 *
 * `WRITE_VARIANT_SURFACE=1 npm test -- src/__tests__/unit/toolSet/variantSurface.test.ts`
 * writes the fixture first (refused under CI).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import type { ToolSetKind } from '../../../lib/toolSet';
import {
  type VariantSurface,
  variantSurface,
} from '../../helpers/fixtureRenderings';

jest.setTimeout(120_000);

const FIXTURE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'tools',
  'variant-surface.json',
);

const KINDS: readonly ToolSetKind[] = [
  'core',
  'core-ro',
  'compact',
  'compact-ro',
];

type Surface = VariantSurface;

describe('the tool set of each declared variant (WRITE_VARIANT_SURFACE=1 rewrites the fixture)', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  let current: Surface;

  beforeAll(async () => {
    current = await variantSurface();
    if (process.env.WRITE_VARIANT_SURFACE === '1') {
      if (process.env.CI) {
        throw new Error('WRITE_VARIANT_SURFACE is refused under CI');
      }
      fs.writeFileSync(FIXTURE, `${JSON.stringify(current, null, 2)}\n`);
    }
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
    resetProcessLatchForTests();
  });

  const frozen = (): Surface => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

  it('onprem (ADT_TYPES_ONPREM) registers the fixture’s tools and members', () => {
    expect(current.onprem).toEqual(frozen().onprem);
  });

  it('cloud (ADT_TYPES_CLOUD) registers the fixture’s tools and members', () => {
    expect(current.cloud).toEqual(frozen().cloud);
  });

  it('legacy (an on-premise system: ADT_TYPES_ONPREM, available_in legacy) registers the fixture’s tools and members', () => {
    expect(current.legacy).toEqual(frozen().legacy);
  });

  it('cloud serves a program’s read, check, versions and unit run (ADT_TYPES_CLOUD), and none of its writes', () => {
    const programReads = [
      'CheckProgram',
      'GetProgram',
      'GetProgramVersionDiff',
      'GetProgramVersionSource',
      'GetProgramVersions',
      'RunProgramUnitTest',
    ];
    const programWrites = [
      'ActivateProgram',
      'CreateProgram',
      'DeleteProgram',
      'UpdateProgram',
    ];
    expect(current.cloud.core.tools).toEqual(
      expect.arrayContaining(programReads),
    );
    expect(current.cloud['core-ro'].tools).toContain('GetProgram');
    for (const write of programWrites) {
      expect(current.cloud.core.tools).not.toContain(write);
    }
    expect(current.cloud.compact.members['HandlerGet.object_type']).toContain(
      'PROGRAM',
    );
    expect(
      current.cloud.compact.members['HandlerCreate.object_type'],
    ).not.toContain('PROGRAM');
  });

  it('the surface is not vacuous: every kind lists tools on onprem and cloud', () => {
    for (const environment of ['onprem', 'cloud'] as const) {
      for (const kind of KINDS) {
        expect(current[environment][kind].tools.length).toBeGreaterThan(10);
      }
    }
  });
});
