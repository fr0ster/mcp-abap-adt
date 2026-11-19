/**
 * The responsible person is sent wherever a create carries it; the master
 * system only when known. A class and a behavior implementation carry none:
 * SAP stores that attribute on them as the creator, not the responsible
 * (adt-clients 26.0.1), so the vehicle here is a message class.
 *
 * Responsible: the user the system names (`systeminformation`'s `userName`),
 * on every kind of system, over anything configured. Only where an
 * on-premise system has no such function (`404`) — and where the handler
 * runs outside the server, as here — the configuration: its own variable
 * (the tool argument, `x-sap-responsible`, `SAP_RESPONSIBLE` of the
 * destination then of the process), else the login (the destination's
 * `SAP_USERNAME`, `x-sap-login`, the process `SAP_USERNAME`). A create that
 * finds none is refused naming `SAP_RESPONSIBLE`, and nothing is sent — so
 * no empty `adtcore:responsible=""` ever leaves the server.
 *
 * Master system: the system's `systemID`, else (on-premise `404`) its own
 * variable; otherwise it is left out of the request — never refused.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { assertMatchObject } from '../../../src/__tests__/helpers/assertions';
import { setSystemContext } from '../../../src/__tests__/helpers/processSystemContext';
import { recordingConnection } from '../../../src/__tests__/helpers/recordingConnection';
import { handleCreateBehaviorImplementation as handleCreateBehaviorImplementationHigh } from '../../../src/handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleCreateClass } from '../../../src/handlers/class/high/handleCreateClass';
import {
  TOOL_DEFINITION as CreateMessageClassTool,
  handleCreateMessageClass,
} from '../../../src/handlers/message_class/high/handleCreateMessageClass';
import { handleCreateServiceDefinition } from '../../../src/handlers/service_definition/high/handleCreateServiceDefinition';
import { handleCreateTransport } from '../../../src/handlers/transport/high/handleCreateTransport';
import { SYSTEM_LOOKUP_FAILED_WORDS } from '../../../src/lib/auth/serverRefusal';
import { createAdtClient } from '../../../src/lib/clients';
import type { HandlerEntry } from '../../../src/lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../src/lib/handlers/registry/CompositeHandlersRegistry';
import { runWithRequestContext } from '../../../src/lib/requestContext';
import {
  resetSystemContextCache,
  systemContextFromConfiguration,
} from '../../../src/lib/systemContext';
import { MISSING_RESPONSIBLE } from '../../../src/lib/systemContextGuard';
import * as systemInformation from '../../../src/lib/systemInformation';
import { EmbeddableMcpServer } from './helpers/withRules';

/**
 * readSystemInformation replaced on the module that defines it (its callers
 * read it at call time), a fresh mock before each case and restored after
 * it, as Jest's mockReset left it: answering undefined until a case says
 * otherwise, with no implementation left over from an earlier case.
 */
function stubLookup() {
  return mock.method(
    systemInformation,
    'readSystemInformation',
    () => undefined,
  );
}
let lookup: ReturnType<typeof stubLookup>;

const KEYS = [
  'SAP_MASTER_SYSTEM',
  'SAP_RESPONSIBLE',
  'SAP_USERNAME',
  'SAP_SYSTEM_TYPE',
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetSystemContextCache();
  lookup = stubLookup();
});
afterEach(() => {
  lookup.mock.restore();
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetSystemContextCache();
});

const textOf = (result: unknown) =>
  (result as { content: { text: string }[] }).content[0].text;

const CLASS_ARGS = {
  class_name: 'ZCL_PLACEHOLDER',
  description: 'placeholder',
  package_name: 'ZPACKAGE_PLACEHOLDER',
};

const createBody = (connection: ReturnType<typeof recordingConnection>) =>
  String(connection.requests.find((r) => r.method === 'POST')?.data);

const MSAG_ARGS = {
  message_class_name: 'ZMSG_PLACEHOLDER',
  package_name: 'ZPACKAGE_PLACEHOLDER',
  description: 'placeholder',
};

/** The vehicle: a create that carries the responsible person and master system. */
const createMessageClass = async () => {
  const connection = recordingConnection();
  const result = await handleCreateMessageClass(
    { connection, logger: undefined } as never,
    MSAG_ARGS as never,
  );
  return { connection, result };
};

/** A class create, which carries neither. */
const createClass = async () => {
  const connection = recordingConnection();
  const result = await handleCreateClass(
    { connection, logger: undefined } as never,
    CLASS_ARGS,
  );
  return { connection, result };
};

describe('cloud', () => {
  const registry = new CompositeHandlersRegistry([
    {
      getName: () => 'create',
      registerHandlers: () => {},
      getHandlers: (): HandlerEntry[] => [
        {
          toolDefinition: CreateMessageClassTool as never,
          call: handleCreateMessageClass as never,
        },
      ],
    },
  ]);
  const toolsOf = (server: EmbeddableMcpServer) =>
    (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (a: unknown) => Promise<unknown> }
        >;
      }
    )._registeredTools;

  it('nothing stated: both from systeminformation, and the create carries them', async () => {
    lookup.mock.mockImplementation(async () => ({
      user: 'CB_USER',
      systemId: 'CLD',
    }));
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    assert.equal(lookup.mock.callCount(), 1);
    assert.ok(!textOf(result).includes(MISSING_RESPONSIBLE));
    assert.ok(createBody(connection).includes('adtcore:masterSystem="CLD"'));
    assert.ok(createBody(connection).includes('adtcore:responsible="CB_USER"'));
  });

  it('the process SAP_USERNAME is not a cloud login: systeminformation is the responsible', async () => {
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    systemContextFromConfiguration();
    lookup.mock.mockImplementation(async () => ({
      user: 'CB_USER',
      systemId: 'CLD',
    }));
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    assert.equal(lookup.mock.callCount(), 1);
    assert.ok(createBody(connection).includes('adtcore:responsible="CB_USER"'));
  });

  it('a scope login is not a cloud login either; the system user wins over a stated SAP_RESPONSIBLE', async () => {
    lookup.mock.mockImplementation(async () => ({
      user: 'CB_USER',
      systemId: 'CLD',
    }));
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    await runWithRequestContext({ login: 'SCOPE_LOGIN' }, () =>
      toolsOf(server).CreateMessageClass.handler(MSAG_ARGS),
    );
    assert.ok(createBody(connection).includes('adtcore:responsible="CB_USER"'));

    process.env.SAP_RESPONSIBLE = 'STATED_USER';
    systemContextFromConfiguration();
    const stated = recordingConnection();
    const statedServer = new EmbeddableMcpServer({
      connection: stated as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    await toolsOf(statedServer).CreateMessageClass.handler(MSAG_ARGS);
    assert.ok(createBody(stated).includes('adtcore:responsible="CB_USER"'));
  });

  it('a cloud system that answers no user: one step to the error — the process login does not stand in, the call is refused system_lookup_failed, nothing sent', async () => {
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    systemContextFromConfiguration();
    lookup.mock.mockImplementation(async () => ({
      user: undefined,
      systemId: 'CLD',
    }));
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    assertMatchObject(JSON.parse(textOf(result)), {
      error: 'system_lookup_failed',
    });
    assert.ok(!textOf(result).includes('PROCESS_LOGIN'));
    assert.deepStrictEqual(connection.requests, []);
  });

  for (const [systemType, answered] of [
    ['cloud', true],
    ['onprem', true],
    ['onprem', false],
  ] as const) {
    it(
      format(
        'a host scope carrying both keys as undefined (%s, answered %s): the system fills both; on-premise without the function it is refused',
        systemType,
        answered,
      ),
      async () => {
        const filled = answered;
        if (answered) {
          lookup.mock.mockImplementation(async () => ({
            user: 'CB_USER',
            systemId: 'CLD',
          }));
        } else {
          lookup.mock.mockImplementation(async () => {
            throw Object.assign(new Error('placeholder'), {
              response: { status: 404 },
            });
          });
        }
        const connection = recordingConnection();
        const server = new EmbeddableMcpServer({
          connection: connection as never,
          handlersRegistry: registry,
          systemType,
        });
        const result = await runWithRequestContext(
          { responsible: undefined, masterSystem: undefined },
          () => toolsOf(server).CreateMessageClass.handler(MSAG_ARGS),
        );
        if (filled) {
          assert.equal(lookup.mock.callCount(), 1);
          assert.ok(
            createBody(connection).includes('adtcore:masterSystem="CLD"'),
          );
          assert.ok(
            createBody(connection).includes('adtcore:responsible="CB_USER"'),
          );
        } else {
          // No user stated (no login in the scope, none in the connection):
          // refused before the tool.
          assert.equal(lookup.mock.callCount(), 1);
          assert.ok(textOf(result).includes('system_user_unknown'));
          assert.deepStrictEqual(connection.requests, []);
        }
      },
    );
  }

  it('a cloud 500: system_lookup_failed — the process login does not stand in, nothing sent', async () => {
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    systemContextFromConfiguration();
    lookup.mock.mockImplementation(async () => {
      throw Object.assign(new Error('placeholder'), {
        response: { status: 500 },
      });
    });
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    assert.deepStrictEqual(JSON.parse(textOf(result)), {
      error: 'system_lookup_failed',
      message: SYSTEM_LOOKUP_FAILED_WORDS,
    });
    assert.deepStrictEqual(connection.requests, []);
  });

  it('a lookup that fails: the connect fails in fixed words (system_lookup_failed), not as SAP_RESPONSIBLE missing; nothing sent', async () => {
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    systemContextFromConfiguration();
    lookup.mock.mockImplementation(async () => {
      throw new Error('placeholder failure');
    });
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    // The lookup is part of the connect: its failure fails the
    // call before any tool proceeds, in fixed words.
    assert.ok(textOf(result).includes(SYSTEM_LOOKUP_FAILED_WORDS));
    assert.ok(!textOf(result).includes(MISSING_RESPONSIBLE));
    assert.ok(!textOf(result).includes('placeholder failure'));
    assert.ok(!textOf(result).includes('SAP_RESPONSIBLE'));
    assert.ok(!textOf(result).includes('x-sap-responsible'));
    assertMatchObject(JSON.parse(textOf(result)), {
      error: 'system_lookup_failed',
    });
    assert.deepStrictEqual(connection.requests, []);
  });

  it('a cloud system without the endpoint (404): the configuration is inconsistent, cloud_without_systeminformation — the process login does not stand in, nothing sent', async () => {
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    systemContextFromConfiguration();
    lookup.mock.mockImplementation(async () => {
      throw Object.assign(new Error('placeholder'), {
        response: { status: 404 },
      });
    });
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    assert.deepStrictEqual(JSON.parse(textOf(result)), {
      error: 'cloud_without_systeminformation',
      message:
        'the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration or the headers are inconsistent; the tool did not run',
    });
    assert.ok(!textOf(result).includes('PROCESS_LOGIN'));
    assert.deepStrictEqual(connection.requests, []);
  });
});

describe('on-premise, through the server', () => {
  const registry = new CompositeHandlersRegistry([
    {
      getName: () => 'create',
      registerHandlers: () => {},
      getHandlers: (): HandlerEntry[] => [
        {
          toolDefinition: CreateMessageClassTool as never,
          call: handleCreateMessageClass as never,
        },
      ],
    },
  ]);
  // The request's login (`x-sap-login`): what an on-premise system without
  // the function needs stated.
  const create = async (
    scope: { login?: string } = { login: 'LOGIN_PLACEHOLDER' },
  ) => {
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'onprem',
    });
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (a: unknown) => Promise<unknown> }
        >;
      }
    )._registeredTools;
    const result = await runWithRequestContext(scope, () =>
      tools.CreateMessageClass.handler(MSAG_ARGS),
    );
    return { connection, result };
  };
  const status = (code: number) =>
    Object.assign(new Error('placeholder'), { response: { status: code } });

  beforeEach(() => {
    process.env.SAP_USERNAME = 'LOGIN_PLACEHOLDER';
    process.env.SAP_RESPONSIBLE = 'STATED_USER';
    process.env.SAP_MASTER_SYSTEM = 'STATED_SYSTEM';
    systemContextFromConfiguration();
  });

  it('the system names its user: it wins over SAP_RESPONSIBLE, SAP_MASTER_SYSTEM and the login', async () => {
    lookup.mock.mockImplementation(async () => ({
      user: 'OP_USER',
      systemId: 'OPS',
    }));
    const { connection } = await create();
    assert.equal(lookup.mock.callCount(), 1);
    assert.ok(createBody(connection).includes('adtcore:responsible="OP_USER"'));
    assert.ok(createBody(connection).includes('adtcore:masterSystem="OPS"'));
  });

  it('without the function (404): the configured responsible and master system', async () => {
    lookup.mock.mockImplementation(async () => {
      throw status(404);
    });
    const { connection } = await create();
    assert.ok(
      createBody(connection).includes('adtcore:responsible="STATED_USER"'),
    );
    assert.ok(
      createBody(connection).includes('adtcore:masterSystem="STATED_SYSTEM"'),
    );
  });

  it('without the function (404) and only a login: the login', async () => {
    delete process.env.SAP_RESPONSIBLE;
    resetSystemContextCache();
    systemContextFromConfiguration();
    lookup.mock.mockImplementation(async () => {
      throw status(404);
    });
    const { connection } = await create();
    assert.ok(
      createBody(connection).includes(
        'adtcore:responsible="LOGIN_PLACEHOLDER"',
      ),
    );
  });

  it('without the function (404) and only a responsible (no login): the responsible and the master system', async () => {
    lookup.mock.mockImplementation(async () => {
      throw status(404);
    });
    const { connection } = await create({});
    assert.ok(
      createBody(connection).includes('adtcore:responsible="STATED_USER"'),
    );
    assert.ok(
      createBody(connection).includes('adtcore:masterSystem="STATED_SYSTEM"'),
    );
  });

  it('without the function (404) and neither a responsible nor a login: system_user_unknown, nothing sent', async () => {
    delete process.env.SAP_RESPONSIBLE;
    resetSystemContextCache();
    systemContextFromConfiguration();
    lookup.mock.mockImplementation(async () => {
      throw status(404);
    });
    const first = await create({});
    assert.ok(textOf(first.result).includes('system_user_unknown'));
    assert.deepStrictEqual(first.connection.requests, []);
    assert.equal(lookup.mock.callCount(), 1);
  });

  for (const [_case, answer] of [
    [
      'an answer without a user',
      () =>
        lookup.mock.mockImplementation(async () => ({
          user: undefined,
          systemId: 'OPS',
        })),
    ],
    [
      'a lookup answered 500',
      () =>
        lookup.mock.mockImplementation(async () => {
          throw status(500);
        }),
    ],
  ] as const) {
    it(
      format('%s: the configured responsible and master system', _case),
      async () => {
        answer();
        const first = await create();
        assert.ok(
          createBody(first.connection).includes(
            'adtcore:responsible="STATED_USER"',
          ),
        );
        assert.ok(
          createBody(first.connection).includes(
            'adtcore:masterSystem="STATED_SYSTEM"',
          ),
        );
        assert.equal(lookup.mock.callCount(), 1);
      },
    );
  }

  for (const [_case, answer] of [
    [
      'an answer without a user',
      () =>
        lookup.mock.mockImplementation(async () => ({
          user: undefined,
          systemId: 'OPS',
        })),
    ],
    [
      'a lookup answered 500',
      () =>
        lookup.mock.mockImplementation(async () => {
          throw status(500);
        }),
    ],
  ] as const) {
    it(
      format(
        '%s and neither a responsible nor a login: system_user_unknown, nothing sent',
        _case,
      ),
      async () => {
        delete process.env.SAP_RESPONSIBLE;
        resetSystemContextCache();
        systemContextFromConfiguration();
        answer();
        const { connection, result } = await create({});
        assertMatchObject(JSON.parse(textOf(result)), {
          error: 'system_user_unknown',
        });
        assert.deepStrictEqual(connection.requests, []);
      },
    );
  }
});
