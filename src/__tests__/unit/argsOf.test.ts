/**
 * `ArgsOf` is type level only: these assertions hold when the file compiles
 * (`npm run test:check`, and ts-jest's own type check). The one runtime test
 * keeps jest from refusing a file without tests.
 */
import type { ArgsOf } from '../../lib/handlers';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
const assertType = <T extends true>(_: T = true as T) => undefined;

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'A name.' },
    mode: { type: 'string', enum: ['run', 'jump'] },
    count: { type: 'integer' },
    ratio: { type: 'number', default: 10 },
    flag: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    loose: { type: 'array' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'number' } },
        required: ['a'],
      },
    },
    nested: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['x', 'y'] } },
      required: ['kind'],
    },
    bag: { type: 'object' },
    other: { description: 'no type' },
  },
  required: ['name', 'mode'],
} as const;

type Args = ArgsOf<typeof SCHEMA>;

assertType<
  Equal<
    Args,
    {
      name: string;
      mode: 'run' | 'jump';
      count?: number;
      ratio?: number;
      flag?: boolean;
      tags?: string[];
      loose?: unknown[];
      rows?: { a: string; b?: number }[];
      nested?: { kind: 'x' | 'y' };
      bag?: Record<string, unknown>;
      other?: unknown;
    }
  >
>();

// No `required`: every key is optional.
assertType<
  Equal<
    ArgsOf<{ type: 'object'; properties: { a: { type: 'string' } } }>,
    { a?: string }
  >
>();

// An empty `required` likewise.
assertType<
  Equal<
    ArgsOf<{
      type: 'object';
      properties: { a: { type: 'boolean' } };
      required: readonly [];
    }>,
    { a?: boolean }
  >
>();

// A schema without properties takes anything keyed.
assertType<Equal<ArgsOf<{ type: 'object' }>, Record<string, unknown>>>();

const accepts = (_: Args) => undefined;
accepts({ name: 'n', mode: 'run' });
// @ts-expect-error a required key is missing
accepts({ name: 'n' });
// @ts-expect-error a value outside the enum
accepts({ name: 'n', mode: 'walk' });
// @ts-expect-error a string where the schema declares an integer
accepts({ name: 'n', mode: 'run', count: '3' });
// @ts-expect-error a nested required key is missing
accepts({ name: 'n', mode: 'run', nested: {} });

describe('ArgsOf', () => {
  it('is checked by the compiler', () => {
    expect(true).toBe(true);
  });
});
