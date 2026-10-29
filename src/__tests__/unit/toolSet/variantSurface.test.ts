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
import { COMPACT_MEMBER_NEEDS } from '../../../lib/variantToolSet';

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
  /** `<tool>.<argument>` → the members its enum lists, in schema order. */
  members: Record<string, string[]>;
}

type Surface = Record<SapEnvironment, Record<ToolSetKind, KindSurface>>;

/** The members `argument` lists in a listed tool's schema, when it has any. */
function enumOf(inputSchema: unknown, argument: string): string[] | undefined {
  if (typeof inputSchema !== 'object' || inputSchema === null) return;
  const properties: unknown = Reflect.get(inputSchema, 'properties');
  if (typeof properties !== 'object' || properties === null) return;
  const property: unknown = Reflect.get(properties, argument);
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
    for (const tool of tools) {
      const gated = COMPACT_MEMBER_NEEDS.get(tool.name);
      if (gated === undefined) continue;
      const listed = enumOf(tool.inputSchema, gated.argument);
      if (listed !== undefined) {
        members[`${tool.name}.${gated.argument}`] = listed;
      }
    }
    return {
      tools: tools.map((tool) => tool.name).sort(),
      members: Object.fromEntries(
        Object.entries(members).sort(([a], [b]) => a.localeCompare(b)),
      ),
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

  it('the surface is not vacuous: every kind lists tools on onprem and cloud', () => {
    for (const environment of ['onprem', 'cloud'] as const) {
      for (const kind of KINDS) {
        expect(current[environment][kind].tools.length).toBeGreaterThan(10);
      }
    }
  });
});
