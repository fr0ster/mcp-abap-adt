/**
 * Five tools declare `available_in` including `'legacy'` and reach a factory
 * `AdtClientLegacy` declares never available — `getCdsUnitTest` (four
 * handlers) and `getStructure`/`getTable` (one) all `throw` synchronously on
 * that class, per `AdtClientLegacy.js`, rather than answering a failure the
 * way `AdtPackageLegacy`/`AdtUtilsLegacy` do. Undisclosed and unguarded, that
 * throw either surfaces as a raw exception (three of the four CDS handlers
 * built the client *before* `answer()`'s callback, so nothing there was
 * catching it) or an unlabelled generic error (the fourth, and
 * `GetStructuresList`, both sit inside their own `try`/`catch`).
 *
 * Each of the five now guards with `isLegacyConnection()` before making any
 * call, tested the way the program family's cloud guard is: a legacy
 * connection refuses with a message and the mocked factory is never invoked;
 * a non-legacy connection reaches it.
 */
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';

let client: Record<string, unknown>;
jest.mock('../../lib/clients', () => ({
  createAdtClient: () => client,
}));

import { handleGetStructuresList } from '../../handlers/structure/readonly/handleGetStructuresList';
import { handleCreateCdsUnitTest } from '../../handlers/unit_test/high/handleCreateCdsUnitTest';
import { handleGetCdsUnitTest } from '../../handlers/unit_test/high/handleGetCdsUnitTest';
import { handleGetCdsUnitTestResult } from '../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import { handleGetCdsUnitTestStatus } from '../../handlers/unit_test/high/handleGetCdsUnitTestStatus';

const context = { connection: {} as any, logger: undefined };

/** Throws if reached — the shape `AdtClientLegacy`'s own factory takes. */
function throwingFactory(name: string) {
  return jest.fn(() => {
    throw new Error(`${name} is not supported on this SAP system.`);
  });
}

afterEach(() => {
  resetSystemContextCache();
});

const rows: Array<
  [
    string,
    (...args: any[]) => Promise<unknown>,
    Record<string, unknown>,
    () => Record<string, unknown>,
  ]
> = [
  [
    'CreateCdsUnitTest',
    handleCreateCdsUnitTest,
    {
      class_name: 'ZCL_X',
      package_name: 'ZP',
      cds_view_name: 'Z_MY_VIEW',
    },
    () => ({
      getCdsUnitTest: throwingFactory('CDS Unit Test'),
      getClass: throwingFactory('Class'),
    }),
  ],
  [
    'GetCdsUnitTest',
    handleGetCdsUnitTest,
    { run_id: 'run-1' },
    () => ({ getCdsUnitTest: throwingFactory('CDS Unit Test') }),
  ],
  [
    'GetCdsUnitTestResult',
    handleGetCdsUnitTestResult,
    { run_id: 'run-1' },
    () => ({ getCdsUnitTest: throwingFactory('CDS Unit Test') }),
  ],
  [
    'GetCdsUnitTestStatus',
    handleGetCdsUnitTestStatus,
    { run_id: 'run-1' },
    () => ({ getCdsUnitTest: throwingFactory('CDS Unit Test') }),
  ],
  [
    'GetStructuresList',
    handleGetStructuresList,
    { structure_name: 'Z_MY_STRUCT' },
    () => ({
      getStructure: throwingFactory('Structure'),
      getTable: throwingFactory('Table'),
      getUtils: throwingFactory('Utils'),
    }),
  ],
];

/** A benign answer shape most of these handlers' downstream code tolerates. */
const okAnswer = () => ({
  ok: true,
  getResult: () => ({ value: {} }),
  getError: () => undefined,
});

/** A non-throwing stand-in for each row's factory set, for the pass-through half. */
const nonLegacyClients: Record<string, () => Record<string, unknown>> = {
  CreateCdsUnitTest: () => ({
    getCdsUnitTest: jest.fn(() => ({
      checkCdsTestDoubles: jest.fn(async () => okAnswer()),
    })),
    getClass: jest.fn(() => ({
      create: jest.fn(async () => okAnswer()),
    })),
  }),
  GetCdsUnitTest: () => ({
    getCdsUnitTest: jest.fn(() => ({
      getStatus: jest.fn(async () => okAnswer()),
      getResult: jest.fn(async () => okAnswer()),
    })),
  }),
  GetCdsUnitTestResult: () => ({
    getCdsUnitTest: jest.fn(() => ({
      getStatus: jest.fn(async () => okAnswer()),
      getResult: jest.fn(async () => okAnswer()),
    })),
  }),
  GetCdsUnitTestStatus: () => ({
    getCdsUnitTest: jest.fn(() => ({
      getStatus: jest.fn(async () => okAnswer()),
    })),
  }),
  GetStructuresList: () => ({
    getStructure: jest.fn(() => ({ read: jest.fn(async () => ({})) })),
    getTable: jest.fn(() => ({ read: jest.fn(async () => ({})) })),
    getUtils: jest.fn(() => ({})),
  }),
};

describe('the legacy throwing-factory guard — declared in available_in, enforced here', () => {
  it.each(
    rows,
  )('%s refuses on a legacy connection and never reaches the throwing factory', async (_name, handler, args, buildClient) => {
    client = buildClient();
    setSystemContext({ isLegacy: true });

    const result: any = await handler(context as any, args);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toMatch(/legacy/i);
    for (const [member, fn] of Object.entries(client)) {
      expect(fn as jest.Mock).not.toHaveBeenCalled();
    }
  });

  it.each(
    rows,
  )('%s proceeds on a non-legacy connection and reaches its factory', async (name, handler, args) => {
    client = nonLegacyClients[name]();
    setSystemContext({ isLegacy: false });

    await handler(context as any, args);

    const calledSomething = Object.values(client).some(
      (fn) => (fn as jest.Mock).mock.calls.length > 0,
    );
    expect(calledSomething).toBe(true);
  });
});
