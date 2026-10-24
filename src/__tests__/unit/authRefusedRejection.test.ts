/**
 * adt-clients 33: a credential the provider refused before SAP was asked
 * (connection's `AuthRefusedError`, no `cause.response`) REJECTS from every
 * member as the same object. Wherever the server walks many objects or holds a
 * lock, that rejection ends the call as the credential failure
 * (`authentication_failed`) — nothing after it is requested, no catch turns it
 * into one item's failure or an empty list, and a held lock is still released.
 */

import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import { handleUpdateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';
import { handleGetEnhancementImpl } from '../../handlers/enhancement/readonly/handleGetEnhancementImpl';
import { handleGetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleGetInclude } from '../../handlers/include/readonly/handleGetInclude';
import { handleGetObjectNodeFromCache } from '../../handlers/system/readonly/handleGetObjectNodeFromCache';
import { handleGetServiceBindingPreviewUrl } from '../../handlers/system/readonly/handleGetServiceBindingPreviewUrl';
import { handleCreateTransportTask } from '../../handlers/transport/high/handleCreateTransportTask';
import { createBatchAvailability } from '../../lib/batch/availability';
import { objectsListCache } from '../../lib/getObjectsListCache';
import { runSearchSource } from '../../lib/search-source/orchestrator';
import { createSourceReaderDeps } from '../../lib/search-source/sourceReader';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

/** The refusal as the connection raises it: SAP was never asked. */
const refused = () =>
  new AuthRefusedError(
    authError.connection({ problem: 'refused-after-renewal', at: 'request' }),
    'request',
  );

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};
const payloadOf = (result: any) => JSON.parse(result.content[0].text);

/** The answer of a credential failure: the chain's, the call ended. */
const expectCredentialAnswer = (result: any) => {
  expect(result.isError).toBe(true);
  const payload = payloadOf(result);
  expect(payload.error).toBe('authentication_failed');
  expect(payload.includes_unread).toBeUndefined();
  expect(payload.partial_result).toBeUndefined();
  expect(payload.cleanup).toBeUndefined();
  return payload;
};

describe('GetEnhancements include_nested: an include whose elements read rejects with AuthRefusedError', () => {
  const EMPTY =
    '<enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements"/>';
  // The sequential version, one include after another: a destination known
  // to have no communication batch. (The batched version reads every
  // include in one envelope: `unit/batch/includeTrees.test.ts`.)
  const notServed = createBatchAvailability();
  notServed.noteOuterStatus(404);
  const run = () =>
    handleGetEnhancements({ ...context, batchAvailability: notServed } as any, {
      object_name: 'ZPROG',
      object_type: 'program',
      program: 'ZPROG',
      include_nested: true,
    }) as Promise<any>;

  it('ends the call with the credential failure; no further include is requested', async () => {
    const read: string[] = [];
    fakeClient = fakeClientOf({
      fetchNodeStructure: async (...args: unknown[]) =>
        (args[2] as { nodeId: string }).nodeId === '000000'
          ? okResponse({ childNodes: [{ type: 'PROG/I', nodeId: 'N1' }] })
          : okResponse({
              objects: [
                { name: 'ZINC1' },
                { name: 'ZINC2' },
                { name: 'ZINC3' },
              ],
            }),
      readEnhancementElements: async (...args: unknown[]) => {
        const config = args[0] as {
          programName?: string;
          includeName?: string;
        };
        read.push(config.includeName ?? config.programName ?? '?');
        if (config.includeName === 'ZINC2') throw refused();
        return okResponse(EMPTY);
      },
    });
    expectCredentialAnswer(await run());
    expect(read).toEqual(['ZPROG', 'ZINC1', 'ZINC2']);
  });

  it('the includes walk rejecting ends the call too, not an empty list of includes', async () => {
    const read: string[] = [];
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => {
        throw refused();
      },
      readEnhancementElements: async (...args: unknown[]) => {
        const config = args[0] as {
          programName?: string;
          includeName?: string;
        };
        read.push(config.includeName ?? config.programName ?? '?');
        return okResponse(EMPTY);
      },
    });
    expectCredentialAnswer(await run());
    expect(read).toEqual(['ZPROG']);
  });
});

describe('SearchSource: a source read through adt-clients rejects with AuthRefusedError', () => {
  const target = (name: string) => ({
    name,
    type: 'PROG/P',
    packageName: 'ZPKG',
    isPackage: false,
  });

  it('the run rejects with that same object; no object after it is read', async () => {
    const read: string[] = [];
    const failure = refused();
    fakeClient = fakeClientOf({
      read: async (config: any) => {
        read.push(config.programName);
        if (config.programName === 'ZB') throw failure;
        return okResponse('REPORT x.\n* marker');
      },
    });
    const run = runSearchSource(
      {
        fetchPackageContents: async () =>
          [target('ZA'), target('ZB'), target('ZC')] as never,
        sourceReader: createSourceReaderDeps(context as any),
        resolvePackages: async (entries) => entries,
      },
      {
        query: 'marker',
        packages: ['ZPKG'],
        object_types: ['PROG'],
        concurrency: 1,
      },
    );
    await expect(run).rejects.toBe(failure);
    expect(read).toEqual(['ZA', 'ZB']);
  });
});

describe('withLock: AuthRefusedError inside a locked write', () => {
  const update = (args: Record<string, unknown> = {}) =>
    handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
      ...args,
    }) as Promise<any>;

  it('the unlock refused after a successful write: the credential failure is the answer, nothing is activated', async () => {
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => (calls.push('lock'), okResponse('handle-1')),
      update: async () => (
        calls.push('update'), okResponse(reading(undefined, '', 200))
      ),
      unlock: async () => {
        calls.push('unlock');
        throw refused();
      },
      activate: async () => (calls.push('activate'), okResponse(undefined)),
    });
    expectCredentialAnswer(await update({ activate: true }));
    expect(calls).toEqual(['lock', 'update', 'unlock']);
  });

  it('the write refused: the unlock is still attempted, and the credential failure is the answer', async () => {
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => (calls.push('lock'), okResponse('handle-1')),
      update: async () => {
        calls.push('update');
        throw refused();
      },
      unlock: async () => (calls.push('unlock'), okResponse(undefined)),
    });
    expectCredentialAnswer(await update());
    expect(calls).toEqual(['lock', 'update', 'unlock']);
  });

  it('the write refused and the unlock refused by SAP: the credential failure, not the held-lock wrapper', async () => {
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => (calls.push('lock'), okResponse('handle-1')),
      update: async () => {
        calls.push('update');
        throw refused();
      },
      unlock: async () => (
        calls.push('unlock'),
        refusedResponse('Unlock refused', {
          response: { status: 403, data: '' },
        } as any)
      ),
    });
    expectCredentialAnswer(await update());
    expect(calls).toEqual(['lock', 'update', 'unlock']);
  });

  it('the activation refused after an unlock SAP refused: the credential failure, not the held-lock wrapper', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      check: async () => okResponse(reading(undefined, '', 200)),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () =>
        refusedResponse('Unlock refused', {
          response: { status: 403, data: '' },
        } as any),
      activate: async () => {
        throw refused();
      },
    });
    expectCredentialAnswer(await update({ activate: true }));
  });
});

describe('a best-effort wait after a write rejects with AuthRefusedError', () => {
  it('UpdateBehaviorDefinition: the call ends with the credential failure; nothing is activated', async () => {
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => okResponse(undefined),
      read: async () => {
        calls.push('read');
        throw refused();
      },
      activate: async () => (calls.push('activate'), okResponse(undefined)),
    });
    const result = await handleUpdateBehaviorDefinition(context as any, {
      name: 'ZBDEF',
      source_code: 'x',
    });
    expectCredentialAnswer(result);
    expect(calls).toEqual(['read']);
  });
});

describe('GetServiceBindingPreviewUrl: the system lookup rejects with AuthRefusedError', () => {
  it('ends the call with the credential failure; the binding is not read', async () => {
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      read: async () => (calls.push('read'), okResponse(reading('', '', 200))),
    });
    const connection = {
      getBaseUrl: async () => 'https://example.invalid',
      makeAdtRequest: async () => {
        throw refused();
      },
    };
    const result = await handleGetServiceBindingPreviewUrl(
      { connection, logger: undefined } as any,
      { service_binding_name: 'ZSB' },
    );
    expectCredentialAnswer(result);
    expect(calls).toEqual([]);
  });
});

describe('a direct request the credential refused ends the call as the credential failure', () => {
  /** A connection whose every request is refused before SAP is asked. */
  const refusing = () =>
    ({
      getBaseUrl: async () => 'https://example.invalid',
      makeAdtRequest: async () => {
        throw refused();
      },
    }) as any;

  it('GetInclude: the chain answer, not its message as text', async () => {
    fakeClient = fakeClientOf({
      getInclude: async () => {
        throw refused();
      },
    });
    const result = await handleGetInclude(
      { connection: refusing(), logger: undefined } as any,
      { include_name: 'ZINC' },
    );
    expectCredentialAnswer(result);
  });

  it('GetObjectNodeFromCache: the chain answer, not a note in the node', async () => {
    objectsListCache.setCache({
      objects: [
        {
          OBJECT_TYPE: 'PROG/P',
          OBJECT_NAME: 'ZPROG',
          TECH_NAME: 'ZPROG',
          OBJECT_URI: '/sap/bc/adt/programs/programs/zprog',
        },
      ],
    });
    const result = await handleGetObjectNodeFromCache(
      { connection: refusing(), logger: undefined } as any,
      { object_type: 'PROG/P', object_name: 'ZPROG', tech_name: 'ZPROG' },
    );
    expectCredentialAnswer(result);
  });

  it("GetEnhancementImpl: the type search's refusal is the answer, not the words of an unknown collection", async () => {
    // The search is adt-clients' `getUtils().search` (#235), which rejects
    // with the connection's refusal as it came.
    fakeClient = fakeClientOf({
      search: async () => {
        throw refused();
      },
    });
    const result = await handleGetEnhancementImpl(
      { connection: refusing(), logger: undefined } as any,
      { enhancement_spot: 'zspot', enhancement_name: 'ZENH' },
    );
    expectCredentialAnswer(result);
  });
});

describe("a 401 SAP answered to a cleanup step is the call's credential failure", () => {
  const unauthorized = () =>
    refusedResponse('Unauthorized', {
      response: { status: 401, data: '' },
    } as any);

  it("withLock: the unlock answered 401 after a successful write: the unlock's error with its step, no cleanup entry, nothing activated", async () => {
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      check: async () => okResponse(reading(undefined, '', 200)),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => (calls.push('unlock'), unauthorized()),
      activate: async () => (calls.push('activate'), okResponse(undefined)),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
      activate: true,
    });
    expect(result.isError).toBe(true);
    const payload = payloadOf(result);
    expect(payload).toMatchObject({ status: 401, step: 'unlock' });
    expect(payload.cleanup).toBeUndefined();
    expect(calls).toEqual(['unlock']);
  });

  it('CreateTransportTask: the task type change answered 401: its error with its step, not a cleanup note', async () => {
    fakeClient = fakeClientOf({
      createTask: async () =>
        okResponse(reading({ '@': { 'tm:number': 'SIDK907073' } } as never)),
      changeTaskType: async () => unauthorized(),
    });
    const result: any = await handleCreateTransportTask(context as any, {
      transport_number: 'SIDK907072',
      target_user: 'DEVELOPER',
    });
    expect(result.isError).toBe(true);
    const payload = payloadOf(result);
    expect(payload).toMatchObject({ status: 401, step: 'change task type' });
    expect(payload.cleanup).toBeUndefined();
  });
});
