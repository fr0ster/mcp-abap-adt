import {
  accessControlDocuments,
  serviceDefinitionDocuments,
  transformationDocuments,
} from '@mcp-abap-adt/adt-clients';

/**
 * The responsible person is sent wherever a create carries it; the master
 * system only when known. A class and a behavior implementation carry none:
 * SAP stores that attribute on them as the creator, not the responsible
 * (adt-clients 26.0.1), so the vehicle here is a message class.
 *
 * A handler run outside the server, with no rules (lib applies none): the
 * responsible is what is stated — the tool argument, `x-sap-responsible`,
 * `SAP_RESPONSIBLE` — and no login stands in for it (that is a host's rule:
 * `@mcp-abap-adt/responsible-rules`, whose suite covers it). A create that
 * finds none is refused naming `SAP_RESPONSIBLE`, and nothing is sent — so
 * no empty `adtcore:responsible=""` ever leaves the server.
 *
 * Master system: its own variable; otherwise it is left out of the request
 * — never refused.
 */
jest.mock('../../lib/systemInformation', () => ({
  ...jest.requireActual('../../lib/systemInformation'),
  readSystemInformation: jest.fn(),
}));

import { handleCreateBehaviorImplementation as handleCreateBehaviorImplementationHigh } from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleCreateClass } from '../../handlers/class/high/handleCreateClass';
import { handleGetClass } from '../../handlers/class/high/handleGetClass';
import {
  TOOL_DEFINITION as CreateMessageClassTool,
  handleCreateMessageClass,
} from '../../handlers/message_class/high/handleCreateMessageClass';
import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport';
import { DEFAULT_ADT_HEADERS } from '../../lib/adtHeaders/defaultPairs';
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
  // The process declares its system type, as every launcher requires: the
  // ADT client is the declared variant's (`variantOf`), never a default.
  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
  });

  it('basic: the stated responsible, no master system is sent, nothing is refused', async () => {
    process.env.SAP_RESPONSIBLE = 'RESPONSIBLE_PLACEHOLDER';
    systemContextFromConfiguration();
    const { connection, result } = await createMessageClass();
    expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
    expect(createBody(connection)).toContain(
      'adtcore:responsible="RESPONSIBLE_PLACEHOLDER"',
    );
    expect(createBody(connection)).not.toContain('adtcore:masterSystem');
  });

  it('no rules: the process SAP_USERNAME is no responsible — refused, nothing sent', async () => {
    process.env.SAP_USERNAME = 'LOGIN_PLACEHOLDER';
    systemContextFromConfiguration();
    const { connection, result } = await createMessageClass();
    expect(textOf(result)).toContain(MISSING_RESPONSIBLE);
    expect(connection.requests).toEqual([]);
  });

  it('no rules: the stated login alone is the responsible', async () => {
    process.env.SAP_USERNAME = 'PROCESS_PLACEHOLDER';
    const { connection, result } = await runWithRequestContext(
      { login: 'LOGIN_PLACEHOLDER' },
      createMessageClass,
    );
    expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
    expect(createBody(connection)).toContain(
      'adtcore:responsible="LOGIN_PLACEHOLDER"',
    );
  });

  it('no rules: the stated responsible beside a stated login', async () => {
    const { connection } = await runWithRequestContext(
      { login: 'LOGIN_PLACEHOLDER', responsible: 'RESPONSIBLE_PLACEHOLDER' },
      createMessageClass,
    );
    expect(createBody(connection)).toContain(
      'adtcore:responsible="RESPONSIBLE_PLACEHOLDER"',
    );
  });

  it('SAP_RESPONSIBLE is taken, the login beside it ignored', async () => {
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
        c.getServiceDefinition(serviceDefinitionDocuments).create(
          {
            serviceDefinitionName: 'ZSD_PLACEHOLDER',
            packageName: 'ZPACKAGE_PLACEHOLDER',
            description: 'placeholder',
          },
          { headers: DEFAULT_ADT_HEADERS['serviceDefinition.create'] },
        ),
    ],
    [
      'transformation',
      (c: ReturnType<typeof createAdtClient>) =>
        c.getTransformation(transformationDocuments).create(
          {
            transformationName: 'ZXSLT_PLACEHOLDER',
            transformationType: 'SimpleTransformation',
            packageName: 'ZPACKAGE_PLACEHOLDER',
            description: 'placeholder',
          },
          { headers: DEFAULT_ADT_HEADERS['transformation.create'] },
        ),
    ],
    [
      'access control',
      (c: ReturnType<typeof createAdtClient>) =>
        c.getAccessControl(accessControlDocuments).create(
          {
            accessControlName: 'ZDCL_PLACEHOLDER',
            packageName: 'ZPACKAGE_PLACEHOLDER',
            description: 'placeholder',
          },
          { headers: DEFAULT_ADT_HEADERS['accessControl.create'] },
        ),
    ],
  ] as const;

  it.each(emptyAttributeBuilders)(
    'a %s create with nothing stated is refused, no responsible="" sent; with a responsible stated it carries it',
    async (_kind, create) => {
      const refusedConnection = recordingConnection();
      const refused = await create(createAdtClient(refusedConnection));
      expect(refused.ok).toBe(false);
      expect(
        (refused as unknown as { getError(): Error }).getError().message,
      ).toBe(MISSING_RESPONSIBLE);
      expect(refusedConnection.requests).toEqual([]);

      process.env.SAP_RESPONSIBLE = 'RESPONSIBLE_PLACEHOLDER';
      systemContextFromConfiguration();
      const sentConnection = recordingConnection();
      await create(createAdtClient(sentConnection));
      expect(createBody(sentConnection)).toContain(
        'adtcore:responsible="RESPONSIBLE_PLACEHOLDER"',
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
      process.env.SAP_RESPONSIBLE = 'RESPONSIBLE_PLACEHOLDER';
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
    const result = await handleGetClass(
      { connection, logger: undefined } as never,
      { class_name: 'ZCL_PLACEHOLDER' },
    );
    expect(textOf(result)).not.toContain(MISSING_RESPONSIBLE);
    expect(connection.requests.length).toBeGreaterThan(0);
  });
});
