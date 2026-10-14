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
jest.mock('../../lib/systemInformation', () => ({
  ...jest.requireActual('../../lib/systemInformation'),
  readSystemInformation: jest.fn(),
}));

import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import { handleCreateBehaviorImplementation as handleCreateBehaviorImplementationHigh } from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleCreateClass } from '../../handlers/class/high/handleCreateClass';
import { handleReadClass } from '../../handlers/class/readonly/handleReadClass';
import {
  TOOL_DEFINITION as CreateMessageClassTool,
  handleCreateMessageClass,
} from '../../handlers/message_class/high/handleCreateMessageClass';
import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport';
import { SYSTEM_LOOKUP_FAILED_WORDS } from '../../lib/auth/serverRefusal';
import { createAdtClient } from '../../lib/clients';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { runWithRequestContext } from '../../lib/requestContext';
import {
  resetSystemContextCache,
  setSystemContext,
  systemContextFromConfiguration,
} from '../../lib/systemContext';
import { MISSING_RESPONSIBLE } from '../../lib/systemContextGuard';
import { readSystemInformation } from '../../lib/systemInformation';
import { recordingConnection } from '../helpers/recordingConnection';

const lookup = readSystemInformation as jest.Mock;

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
  lookup.mockReset();
});
afterEach(() => {
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

describe('on-premise', () => {
  it('basic: the login is the responsible, no master system is sent, nothing is refused', async () => {
    process.env.SAP_USERNAME = 'LOGIN_PLACEHOLDER';
    systemContextFromConfiguration();
    const { connection, result } = await createMessageClass();
    expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
    expect(createBody(connection)).toContain(
      'adtcore:responsible="LOGIN_PLACEHOLDER"',
    );
    expect(createBody(connection)).not.toContain('adtcore:masterSystem');
  });

  it('SAP_RESPONSIBLE beats the login', async () => {
    process.env.SAP_USERNAME = 'LOGIN_PLACEHOLDER';
    process.env.SAP_RESPONSIBLE = 'RESPONSIBLE_PLACEHOLDER';
    systemContextFromConfiguration();
    const { connection } = await createMessageClass();
    expect(createBody(connection)).toContain(
      'adtcore:responsible="RESPONSIBLE_PLACEHOLDER"',
    );
  });

  it('a stated master system is sent; none stated is left out, never refused', async () => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
    const stated = await createMessageClass();
    expect(createBody(stated.connection)).toContain(
      'adtcore:masterSystem="SYSTEM_PLACEHOLDER"',
    );

    resetSystemContextCache();
    setSystemContext({ responsible: 'USER_PLACEHOLDER' });
    const unstated = await createMessageClass();
    expect(textOf(unstated.result)).not.toContain(MISSING_RESPONSIBLE);
    expect(createBody(unstated.connection)).toContain(
      'adtcore:responsible="USER_PLACEHOLDER"',
    );
    expect(createBody(unstated.connection)).not.toContain(
      'adtcore:masterSystem',
    );
  });

  it('SNC / a handed-over token with nothing stated: refused naming SAP_RESPONSIBLE, nothing sent', async () => {
    const { connection, result } = await createMessageClass();
    // On-premise the login is SAP_USERNAME, or x-sap-login with x-sap-url;
    // on ABAP Cloud only the system's user.
    expect(textOf(result)).toContain('x-sap-login with x-sap-url');
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(textOf(result)).toContain(MISSING_RESPONSIBLE);
    expect(textOf(result)).toContain('SAP_RESPONSIBLE');
    // The server's own refusal, not a claim about the connection.
    expect(JSON.parse(textOf(result))).toMatchObject({
      error: 'system_context_missing',
      tool: 'CreateMessageClass',
    });
    expect(connection.requests).toEqual([]);
  });

  it('a service definition through its tool (whose builder would send responsible="") is refused, nothing sent', async () => {
    const connection = recordingConnection();
    const result = await handleCreateServiceDefinition(
      { connection, logger: undefined } as never,
      {
        service_definition_name: 'ZSD_PLACEHOLDER',
        package_name: 'ZPACKAGE_PLACEHOLDER',
      },
    );
    expect(textOf(result)).toContain(MISSING_RESPONSIBLE);
    for (const request of connection.requests) {
      expect(String(request.data)).not.toContain('adtcore:responsible=""');
    }
    expect(connection.requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  // The three adt-clients builders that write adtcore:responsible="" when the
  // value is empty: the guard is what keeps that from being sent.
  const emptyAttributeBuilders = [
    [
      'service definition',
      (c: ReturnType<typeof createAdtClient>) =>
        c.getServiceDefinition().create({
          serviceDefinitionName: 'ZSD_PLACEHOLDER',
          packageName: 'ZPACKAGE_PLACEHOLDER',
          description: 'placeholder',
        }),
    ],
    [
      'transformation',
      (c: ReturnType<typeof createAdtClient>) =>
        c.getTransformation().create({
          transformationName: 'ZXSLT_PLACEHOLDER',
          transformationType: 'SimpleTransformation',
          packageName: 'ZPACKAGE_PLACEHOLDER',
          description: 'placeholder',
        }),
    ],
    [
      'access control',
      (c: ReturnType<typeof createAdtClient>) =>
        c.getAccessControl().create({
          accessControlName: 'ZDCL_PLACEHOLDER',
          packageName: 'ZPACKAGE_PLACEHOLDER',
          description: 'placeholder',
        }),
    ],
  ] as const;

  it.each(emptyAttributeBuilders)(
    'a %s create with nothing stated is refused, no responsible="" sent; with a login it carries the login',
    async (_kind, create) => {
      const refusedConnection = recordingConnection();
      const refused = await create(createAdtClient(refusedConnection));
      expect(refused.ok).toBe(false);
      expect(
        (refused as unknown as { getError(): Error }).getError().message,
      ).toBe(MISSING_RESPONSIBLE);
      expect(refusedConnection.requests).toEqual([]);

      process.env.SAP_USERNAME = 'LOGIN_PLACEHOLDER';
      systemContextFromConfiguration();
      const sentConnection = recordingConnection();
      await create(createAdtClient(sentConnection));
      expect(createBody(sentConnection)).toContain(
        'adtcore:responsible="LOGIN_PLACEHOLDER"',
      );
    },
  );

  const BIMP_ARGS = {
    class_name: 'ZBP_PLACEHOLDER',
    behavior_definition: 'ZBDEF_PLACEHOLDER',
    description: 'placeholder',
    package_name: 'ZPACKAGE_PLACEHOLDER',
  };
  const bimpTools = [['high', handleCreateBehaviorImplementationHigh]] as const;

  it.each(bimpTools)(
    'CreateBehaviorImplementation (%s), basic: no responsible attribute, no master system, not refused',
    async (_tier, handler) => {
      process.env.SAP_USERNAME = 'LOGIN_PLACEHOLDER';
      systemContextFromConfiguration();
      const connection = recordingConnection();
      const result = await handler(
        { connection, logger: undefined } as never,
        BIMP_ARGS as never,
      );
      expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
      // adt-clients 26.0.1: SAP reads it as the creator, so it is not sent.
      expect(createBody(connection)).not.toContain('adtcore:responsible');
      expect(createBody(connection)).not.toContain('adtcore:masterSystem');
    },
  );

  it('a class create carries no responsible attribute, whatever the context says', async () => {
    // adt-clients 26.0.1, measured on premise: SAP stores adtcore:responsible on
    // a class create as the creator, and records the logon user as responsible.
    setSystemContext({ responsible: 'USER_PLACEHOLDER' });
    const { connection, result } = await createClass();
    expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
    expect(createBody(connection)).not.toContain('adtcore:responsible');
  });

  it.each(bimpTools)(
    'CreateBehaviorImplementation (%s), nothing stated: refused naming SAP_RESPONSIBLE, nothing sent',
    async (_tier, handler) => {
      const connection = recordingConnection();
      const result = await handler(
        { connection, logger: undefined } as never,
        BIMP_ARGS as never,
      );
      expect(textOf(result)).toContain(MISSING_RESPONSIBLE);
      expect(JSON.parse(textOf(result))).toMatchObject({
        error: 'system_context_missing',
      });
      expect(connection.requests).toEqual([]);
    },
  );

  it('CreateBehaviorImplementation sends a stated master system', async () => {
    setSystemContext({
      responsible: 'USER_PLACEHOLDER',
      masterSystem: 'SYSTEM_PLACEHOLDER',
    });
    const connection = recordingConnection();
    await handleCreateBehaviorImplementationHigh(
      { connection, logger: undefined } as never,
      BIMP_ARGS as never,
    );
    expect(createBody(connection)).toContain(
      'adtcore:masterSystem="SYSTEM_PLACEHOLDER"',
    );
  });

  it('a message class is no exception: refused without a responsible, sent with one', async () => {
    // adt-clients 25.0.1: a message class create sends `adtcore:responsible`
    // from the system context, where up to 24.x it took none and the system
    // filled its own default.
    const MSAG_ARGS = {
      message_class_name: 'ZMSG_PLACEHOLDER',
      package_name: 'ZPACKAGE_PLACEHOLDER',
      description: 'placeholder',
    };
    const refusedConnection = recordingConnection();
    const refused = await handleCreateMessageClass(
      { connection: refusedConnection, logger: undefined } as never,
      MSAG_ARGS as never,
    );
    expect(textOf(refused)).toContain(MISSING_RESPONSIBLE);
    expect(refusedConnection.requests).toEqual([]);

    setSystemContext({ responsible: 'USER_PLACEHOLDER' });
    const sentConnection = recordingConnection();
    await handleCreateMessageClass(
      { connection: sentConnection, logger: undefined } as never,
      MSAG_ARGS as never,
    );
    expect(createBody(sentConnection)).toContain(
      'adtcore:responsible="USER_PLACEHOLDER"',
    );
  });

  it('a transport without an owner is refused naming SAP_RESPONSIBLE; the owner argument is enough', async () => {
    const refusedConnection = recordingConnection();
    const refused = await handleCreateTransport(
      { connection: refusedConnection, logger: undefined } as never,
      { description: 'placeholder' },
    );
    expect(textOf(refused)).toContain(MISSING_RESPONSIBLE);
    expect(refusedConnection.requests).toEqual([]);

    const sentConnection = recordingConnection();
    await handleCreateTransport(
      { connection: sentConnection, logger: undefined } as never,
      { description: 'placeholder', owner: 'OWNER_PLACEHOLDER' },
    );
    expect(sentConnection.requests.map((r) => r.method)).toContain('POST');
    expect(String(sentConnection.requests[0].data)).toContain(
      'OWNER_PLACEHOLDER',
    );
  });

  it('a read-only tool is not refused', async () => {
    const connection = recordingConnection();
    const result = await handleReadClass(
      { connection, logger: undefined } as never,
      { class_name: 'ZCL_PLACEHOLDER' },
    );
    expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
    expect(connection.requests.length).toBeGreaterThan(0);
  });
});

describe('cloud', () => {
  const registry = new CompositeHandlersRegistry([
    {
      getName: () => 'create',
      registerHandlers: () => {},
      getHandlers: (): HandlerEntry[] => [
        {
          toolDefinition: CreateMessageClassTool as never,
          handler: handleCreateMessageClass as never,
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
    lookup.mockResolvedValue({
      user: 'CB_USER',
      systemId: 'CLD',
    });
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
    expect(createBody(connection)).toContain('adtcore:masterSystem="CLD"');
    expect(createBody(connection)).toContain('adtcore:responsible="CB_USER"');
  });

  it('the process SAP_USERNAME is not a cloud login: systeminformation is the responsible', async () => {
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    systemContextFromConfiguration();
    lookup.mockResolvedValue({
      user: 'CB_USER',
      systemId: 'CLD',
    });
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(createBody(connection)).toContain('adtcore:responsible="CB_USER"');
  });

  it('a scope login is not a cloud login either; the system user wins over a stated SAP_RESPONSIBLE', async () => {
    lookup.mockResolvedValue({
      user: 'CB_USER',
      systemId: 'CLD',
    });
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    await runWithRequestContext({ login: 'SCOPE_LOGIN' }, () =>
      toolsOf(server).CreateMessageClass.handler(MSAG_ARGS),
    );
    expect(createBody(connection)).toContain('adtcore:responsible="CB_USER"');

    process.env.SAP_RESPONSIBLE = 'STATED_USER';
    systemContextFromConfiguration();
    const stated = recordingConnection();
    const statedServer = new EmbeddableMcpServer({
      connection: stated as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    await toolsOf(statedServer).CreateMessageClass.handler(MSAG_ARGS);
    expect(createBody(stated)).toContain('adtcore:responsible="CB_USER"');
  });

  it('a cloud system that answers no user: not a valid system — the process login does not stand in, the call is refused system_without_user, nothing sent', async () => {
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    systemContextFromConfiguration();
    lookup.mockResolvedValue({
      user: undefined,
      systemId: 'CLD',
    });
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    expect(textOf(result)).toContain('system_without_user');
    expect(textOf(result)).not.toContain('PROCESS_LOGIN');
    expect(connection.requests).toEqual([]);
  });

  it.each([
    ['cloud', true],
    ['onprem', true],
    ['onprem', false],
  ] as const)(
    'a host scope carrying both keys as undefined (%s, answered %s): the system fills both; on-premise without the function it is refused',
    async (systemType, answered) => {
      const filled = answered;
      if (answered) {
        lookup.mockResolvedValue({
          user: 'CB_USER',
          systemId: 'CLD',
        });
      } else {
        lookup.mockRejectedValue(
          Object.assign(new Error('placeholder'), {
            response: { status: 404 },
          }),
        );
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
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(createBody(connection)).toContain('adtcore:masterSystem="CLD"');
        expect(createBody(connection)).toContain(
          'adtcore:responsible="CB_USER"',
        );
      } else {
        // No user stated (no login in the scope, none in the connection):
        // refused before the tool.
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(textOf(result)).toContain('system_user_unknown');
        expect(connection.requests).toEqual([]);
      }
    },
  );

  it('a lookup that fails: the connect fails in fixed words (system_lookup_failed), not as SAP_RESPONSIBLE missing; nothing sent', async () => {
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    systemContextFromConfiguration();
    lookup.mockRejectedValue(new Error('placeholder failure'));
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    // The lookup is part of the connect (spec §5.7): its failure fails the
    // call before any tool proceeds, in fixed words.
    expect(textOf(result)).toContain(SYSTEM_LOOKUP_FAILED_WORDS);
    expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
    expect(textOf(result)).not.toContain('placeholder failure');
    expect(textOf(result)).not.toContain('SAP_RESPONSIBLE');
    expect(textOf(result)).not.toContain('x-sap-responsible');
    expect(JSON.parse(textOf(result))).toMatchObject({
      error: 'system_lookup_failed',
    });
    expect(connection.requests).toEqual([]);
  });

  it('a cloud system without the endpoint (404): not a valid ABAP Cloud system, cloud_without_systeminformation — the process login does not stand in, nothing sent', async () => {
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    systemContextFromConfiguration();
    lookup.mockRejectedValue(
      Object.assign(new Error('placeholder'), { response: { status: 404 } }),
    );
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateMessageClass.handler(MSAG_ARGS);
    expect(JSON.parse(textOf(result))).toEqual({
      error: 'cloud_without_systeminformation',
      message:
        'the ABAP Cloud system answered without systeminformation, which every ABAP Cloud system has: the destination is not a valid ABAP Cloud system; the tool did not run',
    });
    expect(textOf(result)).not.toContain('PROCESS_LOGIN');
    expect(connection.requests).toEqual([]);
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
          handler: handleCreateMessageClass as never,
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
    lookup.mockResolvedValue({ user: 'OP_USER', systemId: 'OPS' });
    const { connection } = await create();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(createBody(connection)).toContain('adtcore:responsible="OP_USER"');
    expect(createBody(connection)).toContain('adtcore:masterSystem="OPS"');
  });

  it('without the function (404): the configured responsible and master system', async () => {
    lookup.mockRejectedValue(status(404));
    const { connection } = await create();
    expect(createBody(connection)).toContain(
      'adtcore:responsible="STATED_USER"',
    );
    expect(createBody(connection)).toContain(
      'adtcore:masterSystem="STATED_SYSTEM"',
    );
  });

  it('without the function (404) and only a login: the login', async () => {
    delete process.env.SAP_RESPONSIBLE;
    resetSystemContextCache();
    systemContextFromConfiguration();
    lookup.mockRejectedValue(status(404));
    const { connection } = await create();
    expect(createBody(connection)).toContain(
      'adtcore:responsible="LOGIN_PLACEHOLDER"',
    );
  });

  it('without the function (404) and no user stated (only the process configuration): system_user_unknown, nothing sent', async () => {
    lookup.mockRejectedValue(status(404));
    const first = await create({});
    expect(textOf(first.result)).toContain('system_user_unknown');
    expect(first.connection.requests).toEqual([]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('an answer without a user: system_without_user, nothing configured stands in, nothing sent', async () => {
    lookup.mockResolvedValue({ user: undefined, systemId: 'OPS' });
    const { connection, result } = await create();
    expect(textOf(result)).toContain('system_without_user');
    expect(connection.requests).toEqual([]);
  });

  it('a lookup answered 500: system_lookup_failed, nothing configured stands in, nothing sent', async () => {
    lookup.mockRejectedValue(status(500));
    const { connection, result } = await create();
    expect(textOf(result)).toContain(SYSTEM_LOOKUP_FAILED_WORDS);
    expect(connection.requests).toEqual([]);
  });
});
