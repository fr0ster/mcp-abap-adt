/**
 * The create tools refuse an argument their schema does not declare (the
 * owner, 24.0.0): before any request, the refusal naming the argument and
 * saying it is not an argument of the tool. One case per full `Create*`
 * tool, on a variant that serves it: its required arguments (from its listed
 * schema) and one undeclared argument.
 */

import { listedTool, statedEnvironment } from '../../lib/listedTool';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import {
  declaredRequired,
  type JsonSchema,
  jsonFind,
  listedJson,
} from '../helpers/listedJson';
import { recordCase, servedEntries } from '../helpers/pinCases';
import type { SystemKind } from '../helpers/servedTools';

beforeEach(() => {
  setSystemContext({ responsible: 'PIN_RESPONSIBLE' });
});
afterEach(() => {
  resetSystemContextCache();
});

const VARIANTS: readonly SystemKind[] = ['onprem', 'cloud'];

/** A value of `node`'s type: its first listed value, else one of its kind. */
function sample(node: JsonSchema | undefined): unknown {
  const listed = node?.enum?.[0];
  if (listed !== undefined) return listed;
  switch (node?.type) {
    case 'boolean':
      return true;
    case 'number':
    case 'integer':
      return 1;
    case 'array':
      return [];
    default:
      return 'ZPIN_X';
  }
}

/** Every full `Create*` tool, on the first variant that lists it, with its required arguments. */
const CASES = [
  ...new Set(VARIANTS.flatMap((v) => [...servedEntries(v).keys()])),
]
  .filter((tool) => tool.startsWith('Create'))
  .sort()
  .map((tool) => {
    const variant = VARIANTS.find((v) => servedEntries(v).has(tool));
    const entry =
      variant === undefined ? undefined : servedEntries(variant).get(tool);
    if (variant === undefined || entry === undefined) {
      throw new Error(`no variant lists ${tool}`);
    }
    const listed = listedTool(entry.toolDefinition, statedEnvironment(variant));
    if (!listed.listed) throw new Error(`${variant} lists no ${tool}`);
    const schema = listedJson(listed.inputSchema);
    const args: Record<string, unknown> = {};
    for (const name of declaredRequired(listed.inputSchema)) {
      args[name] = sample(jsonFind(schema, name));
    }
    return { tool, variant, args };
  });

describe('a create tool refuses an argument its schema does not declare', () => {
  it('runs every full Create* tool', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(27);
  });

  it.each(CASES)('$tool ($variant)', async ({ tool, variant, args }) => {
    const recording = await recordCase({
      tool,
      variant,
      stand: 'recording',
      args: { ...args, not_an_argument: 'X' },
      expected: 'none',
    });
    expect(recording.requests).toEqual([]);
    const message =
      recording.thrown instanceof Error ? recording.thrown.message : '';
    expect(message).toContain(
      `Input validation error: Invalid arguments for tool ${tool}: `,
    );
    expect(message).toContain(`not_an_argument is not an argument of ${tool}`);
  });
});
