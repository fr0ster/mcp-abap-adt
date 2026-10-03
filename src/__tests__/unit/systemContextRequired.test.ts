/**
 * The responsible person is always sent; the master system only when known.
 *
 * Responsible: its own variable (the tool argument, `x-sap-responsible`,
 * `SAP_RESPONSIBLE` of the destination then of the process), else the login
 * (the destination's `SAP_USERNAME`, `x-sap-login`, the process
 * `SAP_USERNAME`; on a cloud system `systeminformation`'s `userName`). A
 * create that finds none is refused naming `SAP_RESPONSIBLE`, and nothing is
 * sent — so no empty `adtcore:responsible=""` ever leaves the server.
 *
 * Master system: its own variable, else the cloud system's `systemID`;
 * otherwise it is left out of the request — never refused.
 */
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  getSystemInformation: jest.fn(),
}));

import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import {
  TOOL_DEFINITION as CreateClassLowTool,
  handleCreateClass as handleCreateClassLow,
} from '../../handlers/class/low/handleCreateClass';
import { handleReadClass } from '../../handlers/class/readonly/handleReadClass';
import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { runWithRequestContext } from '../../lib/requestContext';
import {
  resetSystemContextCache,
  setSystemContext,
  systemContextFromConfiguration,
} from '../../lib/systemContext';
import { MISSING_RESPONSIBLE } from '../../lib/systemContextGuard';
import { recordingConnection } from '../helpers/recordingConnection';

const lookup = getSystemInformation as jest.Mock;

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

const createClass = async () => {
  const connection = recordingConnection();
  const result = await handleCreateClassLow(
    { connection, logger: undefined } as never,
    CLASS_ARGS,
  );
  return { connection, result };
};

describe('on-premise', () => {
  it('basic: the login is the responsible, no master system is sent, nothing is refused', async () => {
    process.env.SAP_USERNAME = 'LOGIN_PLACEHOLDER';
    systemContextFromConfiguration();
    const { connection, result } = await createClass();
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
    const { connection } = await createClass();
    expect(createBody(connection)).toContain(
      'adtcore:responsible="RESPONSIBLE_PLACEHOLDER"',
    );
  });

  it('a stated master system is sent; none stated is left out, never refused', async () => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
    const stated = await createClass();
    expect(createBody(stated.connection)).toContain(
      'adtcore:masterSystem="SYSTEM_PLACEHOLDER"',
    );

    resetSystemContextCache();
    setSystemContext({ responsible: 'USER_PLACEHOLDER' });
    const unstated = await createClass();
    expect(textOf(unstated.result)).not.toContain(MISSING_RESPONSIBLE);
    expect(createBody(unstated.connection)).toContain(
      'adtcore:responsible="USER_PLACEHOLDER"',
    );
    expect(createBody(unstated.connection)).not.toContain(
      'adtcore:masterSystem',
    );
  });

  it('SNC / a handed-over token with nothing stated: refused naming SAP_RESPONSIBLE, nothing sent', async () => {
    const { connection, result } = await createClass();
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(textOf(result)).toContain(MISSING_RESPONSIBLE);
    expect(textOf(result)).toContain('SAP_RESPONSIBLE');
    // The server's own refusal, not a claim about the connection.
    expect(JSON.parse(textOf(result))).toMatchObject({
      error: 'system_context_missing',
      tool: 'CreateClassLow',
    });
    expect(connection.requests).toEqual([]);
  });

  it('a service definition (whose builder would send responsible="") is refused, no empty attribute sent', async () => {
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
          toolDefinition: CreateClassLowTool as never,
          handler: handleCreateClassLow as never,
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
    lookup.mockResolvedValue({ systemID: 'CLD', userName: 'CB_USER' });
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateClassLow.handler(CLASS_ARGS);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
    expect(createBody(connection)).toContain('adtcore:masterSystem="CLD"');
    expect(createBody(connection)).toContain('adtcore:responsible="CB_USER"');
  });

  it.each([
    ['cloud', true],
    ['onprem', false],
  ] as const)(
    'a host scope carrying both keys as undefined (%s): cloud asks the system, on-premise is refused',
    async (systemType, filled) => {
      lookup.mockResolvedValue({ systemID: 'CLD', userName: 'CB_USER' });
      const connection = recordingConnection();
      const server = new EmbeddableMcpServer({
        connection: connection as never,
        handlersRegistry: registry,
        systemType,
      });
      const result = await runWithRequestContext(
        { responsible: undefined, masterSystem: undefined },
        () => toolsOf(server).CreateClassLow.handler(CLASS_ARGS),
      );
      if (filled) {
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(createBody(connection)).toContain('adtcore:masterSystem="CLD"');
        expect(createBody(connection)).toContain(
          'adtcore:responsible="CB_USER"',
        );
      } else {
        expect(lookup).not.toHaveBeenCalled();
        expect(textOf(result)).toContain(MISSING_RESPONSIBLE);
        expect(connection.requests).toEqual([]);
      }
    },
  );

  it('a system that answers nothing leaves the create refused, nothing sent', async () => {
    lookup.mockResolvedValue(null);
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const result = await toolsOf(server).CreateClassLow.handler(CLASS_ARGS);
    expect(textOf(result)).toContain(MISSING_RESPONSIBLE);
    expect(connection.requests).toEqual([]);
  });
});
