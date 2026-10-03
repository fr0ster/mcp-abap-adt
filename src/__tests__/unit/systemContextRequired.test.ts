/**
 * ADT changes are not made without a responsible person and a master system.
 * An operation that sends them and finds neither — not in the tool's
 * arguments, the request's headers, the destination's .env, the process
 * configuration, nor (cloud only) the system's `systeminformation` — is
 * refused by the server, naming the key to set, and nothing is sent to ADT
 * with an empty value. A read is never refused for them.
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
import { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { runWithRequestContext } from '../../lib/requestContext';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import {
  MISSING_MASTER_SYSTEM,
  MISSING_RESPONSIBLE,
} from '../../lib/systemContextGuard';
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

describe('on-premise, nothing configured', () => {
  it('a creating tool is refused naming SAP_MASTER_SYSTEM, and nothing is sent', async () => {
    const connection = recordingConnection();
    const result = (await handleCreateClassLow(
      { connection, logger: undefined } as never,
      CLASS_ARGS,
    )) as { isError?: boolean };
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(MISSING_MASTER_SYSTEM);
    expect(textOf(result)).toContain('SAP_MASTER_SYSTEM');
    expect(textOf(result)).toContain('x-sap-master-system');
    // The server's own refusal, not a claim about the connection.
    expect(JSON.parse(textOf(result))).toMatchObject({
      error: 'system_context_missing',
      tool: 'CreateClassLow',
    });
    expect(connection.requests).toEqual([]);
  });

  it('with the master system only: refused naming SAP_RESPONSIBLE, nothing sent', async () => {
    setSystemContext({ masterSystem: 'SYSTEM_PLACEHOLDER' });
    const connection = recordingConnection();
    const result = await handleCreateClassLow(
      { connection, logger: undefined } as never,
      CLASS_ARGS,
    );
    expect(textOf(result)).toContain(MISSING_RESPONSIBLE);
    expect(textOf(result)).toContain('SAP_RESPONSIBLE');
    expect(textOf(result)).toContain('x-sap-responsible');
    expect(connection.requests).toEqual([]);
  });

  it('a transport without an owner is refused naming SAP_RESPONSIBLE; the owner argument is enough', async () => {
    const refusedConnection = recordingConnection();
    const refused = await handleCreateTransport(
      { connection: refusedConnection, logger: undefined } as never,
      { description: 'placeholder' },
    );
    expect(textOf(refused)).toContain(MISSING_RESPONSIBLE);
    expect(refusedConnection.requests).toEqual([]);

    // The tool's own argument comes first: nothing else is needed.
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

  it('with both configured, the create is sent carrying them', async () => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
    const connection = recordingConnection();
    await handleCreateClassLow(
      { connection, logger: undefined } as never,
      CLASS_ARGS,
    );
    const create = connection.requests.find((r) => r.method === 'POST');
    expect(String(create?.data)).toContain(
      'adtcore:masterSystem="SYSTEM_PLACEHOLDER"',
    );
    expect(String(create?.data)).toContain(
      'adtcore:responsible="USER_PLACEHOLDER"',
    );
  });

  it('a read-only tool is not refused', async () => {
    const connection = recordingConnection();
    const result = await handleReadClass(
      { connection, logger: undefined } as never,
      { class_name: 'ZCL_PLACEHOLDER' },
    );
    expect(textOf(result)).not.toContain(MISSING_MASTER_SYSTEM);
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

  it('systeminformation fills both, and the create carries them', async () => {
    lookup.mockResolvedValue({ systemID: 'CLD', userName: 'CB_USER' });
    const connection = recordingConnection();
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry,
      systemType: 'cloud',
    });
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (a: unknown) => Promise<unknown> }
        >;
      }
    )._registeredTools;
    const result = await tools.CreateClassLow.handler(CLASS_ARGS);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(textOf(result)).not.toContain(MISSING_MASTER_SYSTEM);
    const create = connection.requests.find((r) => r.method === 'POST');
    expect(String(create?.data)).toContain('adtcore:masterSystem="CLD"');
    expect(String(create?.data)).toContain('adtcore:responsible="CB_USER"');
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
      const tools = (
        server as unknown as {
          _registeredTools: Record<
            string,
            { handler: (a: unknown) => Promise<unknown> }
          >;
        }
      )._registeredTools;
      const result = await runWithRequestContext(
        { responsible: undefined, masterSystem: undefined },
        () => tools.CreateClassLow.handler(CLASS_ARGS),
      );
      if (filled) {
        expect(lookup).toHaveBeenCalledTimes(1);
        const create = connection.requests.find((r) => r.method === 'POST');
        expect(String(create?.data)).toContain('adtcore:masterSystem="CLD"');
        expect(String(create?.data)).toContain('adtcore:responsible="CB_USER"');
      } else {
        expect(lookup).not.toHaveBeenCalled();
        expect(textOf(result)).toContain(MISSING_MASTER_SYSTEM);
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
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (a: unknown) => Promise<unknown> }
        >;
      }
    )._registeredTools;
    const result = await tools.CreateClassLow.handler(CLASS_ARGS);
    expect(textOf(result)).toContain(MISSING_MASTER_SYSTEM);
    expect(connection.requests).toEqual([]);
  });
});
