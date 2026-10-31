/**
 * The tool set each declared variant registers, read from the server as a
 * client reads it (`tools/list`, stdio over an in-memory transport): for each
 * of the four kinds of binary, the tools listed and, for the compact tools
 * whose members pick the API, the members their enum lists.
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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactRoSet } from '../../../../compact-ro/src/launcher';
import { readOnlyToolSet as coreRoSet } from '../../../../core-ro/src/launcher';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import type { SapEnvironment } from '../../../lib/handlers/interfaces';
import {
  fullToolSet,
  registryOf,
  type ToolSet,
  type ToolSetKind,
} from '../../../lib/toolSet';
import {
  argumentSchema,
  PROJECTED_ARGUMENTS,
} from '../../helpers/projectedArguments';

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

const SETS: Readonly<Record<ToolSetKind, ToolSet>> = {
  core: fullToolSet,
  'core-ro': coreRoSet,
  compact: compactToolSet,
  'compact-ro': compactRoSet,
};

const KINDS: readonly ToolSetKind[] = [
  'core',
  'core-ro',
  'compact',
  'compact-ro',
];

/** What one kind of binary registers for a variant. */
interface KindSurface {
  /** The tools listed, sorted. */
  tools: string[];
  /**
   * `<tool>.<argument>` → the members its enum lists, in schema order, for
   * each argument projected from the tables (`PROJECTED_ARGUMENTS`).
   */
  members: Record<string, string[]>;
  /** `<tool>.<argument>` → its description, for the same arguments. */
  argumentDescriptions: Record<string, string>;
  /** The description of each tool with a projected argument. */
  descriptions: Record<string, string>;
}

type Surface = Record<SapEnvironment, Record<ToolSetKind, KindSurface>>;

/** The members `argument` lists in a listed tool's schema, when it has any. */
function enumOf(inputSchema: unknown, argument: string): string[] | undefined {
  const property = argumentSchema(inputSchema, argument);
  if (typeof property !== 'object' || property === null) return;
  const listed: unknown = Reflect.get(property, 'enum');
  if (Array.isArray(listed)) return listed.map(String);
  // One member left is registered as a literal (`schemaUtils`): `const`.
  const only: unknown = Reflect.get(property, 'const');
  return typeof only === 'string' ? [only] : undefined;
}

async function surfaceOf(
  environment: SapEnvironment,
  kind: ToolSetKind,
): Promise<KindSurface> {
  process.env.SAP_SYSTEM_TYPE = environment;
  const server = new StdioServer(registryOf(SETS[kind], 'stdio'), undefined);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.start(undefined, serverSide);
  const client = new Client({ name: 'variant-surface', version: '1' });
  await client.connect(clientSide);
  try {
    const { tools } = await client.listTools();
    const members: Record<string, string[]> = {};
    const argumentDescriptions: Record<string, string> = {};
    const descriptions: Record<string, string> = {};
    for (const tool of tools) {
      for (const projected of PROJECTED_ARGUMENTS) {
        if (projected.tool !== tool.name) continue;
        const key = `${tool.name}.${projected.argument}`;
        const listed = enumOf(tool.inputSchema, projected.argument);
        if (listed !== undefined) members[key] = listed;
        const described: unknown = Reflect.get(
          Object(argumentSchema(tool.inputSchema, projected.argument)),
          'description',
        );
        if (typeof described === 'string') {
          argumentDescriptions[key] = described;
        }
        descriptions[tool.name] = tool.description ?? '';
      }
    }
    const sorted = <T>(record: Record<string, T>): Record<string, T> =>
      Object.fromEntries(
        Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
      );
    return {
      tools: tools.map((tool) => tool.name).sort(),
      members: sorted(members),
      argumentDescriptions: sorted(argumentDescriptions),
      descriptions: sorted(descriptions),
    };
  } finally {
    await client.close();
  }
}

/** Every kind's surface for `environment`, one server each. */
async function kindsOf(
  environment: SapEnvironment,
): Promise<Record<ToolSetKind, KindSurface>> {
  return {
    core: await surfaceOf(environment, 'core'),
    'core-ro': await surfaceOf(environment, 'core-ro'),
    compact: await surfaceOf(environment, 'compact'),
    'compact-ro': await surfaceOf(environment, 'compact-ro'),
  };
}

async function surface(): Promise<Surface> {
  return {
    onprem: await kindsOf('onprem'),
    cloud: await kindsOf('cloud'),
    legacy: await kindsOf('legacy'),
  };
}

describe('the tool set of each declared variant (WRITE_VARIANT_SURFACE=1 rewrites the fixture)', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  let current: Surface;

  beforeAll(async () => {
    current = await surface();
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
