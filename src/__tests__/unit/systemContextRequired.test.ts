import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import {
  accessControlDocuments,
  serviceDefinitionDocuments,
  transformationDocuments,
} from '@mcp-abap-adt/adt-clients';
import { assertMatchObject } from '../helpers/assertions';
import { setSystemContext } from '../helpers/processSystemContext';

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
  systemContextFromConfiguration,
} from '../../lib/systemContext';
import { MISSING_RESPONSIBLE } from '../../lib/systemContextGuard';
import * as systemInformation from '../../lib/systemInformation';
import { recordingConnection } from '../helpers/recordingConnection';

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
    assert.ok(!textOf(result).includes(MISSING_RESPONSIBLE));
    assert.ok(
      createBody(connection).includes(
        'adtcore:responsible="RESPONSIBLE_PLACEHOLDER"',
      ),
    );
    assert.ok(!createBody(connection).includes('adtcore:masterSystem'));
  });

  it('no rules: the process SAP_USERNAME is no responsible — refused, nothing sent', async () => {
    process.env.SAP_USERNAME = 'LOGIN_PLACEHOLDER';
    systemContextFromConfiguration();
    const { connection, result } = await createMessageClass();
    assert.ok(textOf(result).includes(MISSING_RESPONSIBLE));
    assert.deepStrictEqual(connection.requests, []);
  });

  it('no rules: the stated login alone is the responsible', async () => {
    process.env.SAP_USERNAME = 'PROCESS_PLACEHOLDER';
    const { connection, result } = await runWithRequestContext(
      { login: 'LOGIN_PLACEHOLDER' },
      createMessageClass,
    );
    assert.ok(!textOf(result).includes(MISSING_RESPONSIBLE));
    assert.ok(
      createBody(connection).includes(
        'adtcore:responsible="LOGIN_PLACEHOLDER"',
      ),
    );
  });

  it('no rules: the stated responsible beside a stated login', async () => {
    const { connection } = await runWithRequestContext(
      { login: 'LOGIN_PLACEHOLDER', responsible: 'RESPONSIBLE_PLACEHOLDER' },
      createMessageClass,
    );
    assert.ok(
      createBody(connection).includes(
        'adtcore:responsible="RESPONSIBLE_PLACEHOLDER"',
      ),
    );
  });

  it('SAP_RESPONSIBLE is taken, the login beside it ignored', async () => {
    process.env.SAP_USERNAME = 'LOGIN_PLACEHOLDER';
    process.env.SAP_RESPONSIBLE = 'RESPONSIBLE_PLACEHOLDER';
    systemContextFromConfiguration();
    const { connection } = await createMessageClass();
    assert.ok(
      createBody(connection).includes(
        'adtcore:responsible="RESPONSIBLE_PLACEHOLDER"',
      ),
    );
  });

  it('a stated master system is sent; none stated is left out, never refused', async () => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
    const stated = await createMessageClass();
    assert.ok(
      createBody(stated.connection).includes(
        'adtcore:masterSystem="SYSTEM_PLACEHOLDER"',
      ),
    );

    resetSystemContextCache();
    setSystemContext({ responsible: 'USER_PLACEHOLDER' });
    const unstated = await createMessageClass();
    assert.ok(!textOf(unstated.result).includes(MISSING_RESPONSIBLE));
    assert.ok(
      createBody(unstated.connection).includes(
        'adtcore:responsible="USER_PLACEHOLDER"',
      ),
    );
    assert.ok(
      !createBody(unstated.connection).includes('adtcore:masterSystem'),
    );
  });

  it('SNC / a handed-over token with nothing stated: refused naming SAP_RESPONSIBLE, nothing sent', async () => {
    const { connection, result } = await createMessageClass();
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.ok(textOf(result).includes(MISSING_RESPONSIBLE));
    assert.ok(textOf(result).includes('SAP_RESPONSIBLE'));
    // The server's own refusal, not a claim about the connection.
    assertMatchObject(JSON.parse(textOf(result)), {
      error: 'system_context_missing',
      tool: 'CreateMessageClass',
    });
    assert.deepStrictEqual(connection.requests, []);
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
    assert.ok(textOf(result).includes(MISSING_RESPONSIBLE));
    for (const request of connection.requests) {
      assert.ok(!String(request.data).includes('adtcore:responsible=""'));
    }
    assert.deepStrictEqual(
      connection.requests.filter((r) => r.method === 'POST'),
      [],
    );
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

  for (const [_kind, create] of emptyAttributeBuilders) {
    it(
      format(
        'a %s create with nothing stated is refused, no responsible="" sent; with a responsible stated it carries it',
        _kind,
      ),
      async () => {
        const refusedConnection = recordingConnection();
        const refused = await create(createAdtClient(refusedConnection));
        assert.equal(refused.ok, false);
        assert.equal(
          (refused as unknown as { getError(): Error }).getError().message,
          MISSING_RESPONSIBLE,
        );
        assert.deepStrictEqual(refusedConnection.requests, []);

        process.env.SAP_RESPONSIBLE = 'RESPONSIBLE_PLACEHOLDER';
        systemContextFromConfiguration();
        const sentConnection = recordingConnection();
        await create(createAdtClient(sentConnection));
        assert.ok(
          createBody(sentConnection).includes(
            'adtcore:responsible="RESPONSIBLE_PLACEHOLDER"',
          ),
        );
      },
    );
  }

  const BIMP_ARGS = {
    class_name: 'ZBP_PLACEHOLDER',
    behavior_definition: 'ZBDEF_PLACEHOLDER',
    description: 'placeholder',
    package_name: 'ZPACKAGE_PLACEHOLDER',
  };
  const bimpTools = [['high', handleCreateBehaviorImplementationHigh]] as const;

  for (const [_tier, handler] of bimpTools) {
    it(
      format(
        'CreateBehaviorImplementation (%s), basic: no responsible attribute, no master system, not refused',
        _tier,
      ),
      async () => {
        process.env.SAP_RESPONSIBLE = 'RESPONSIBLE_PLACEHOLDER';
        systemContextFromConfiguration();
        const connection = recordingConnection();
        const result = await handler(
          { connection, logger: undefined } as never,
          BIMP_ARGS as never,
        );
        assert.ok(!textOf(result).includes(MISSING_RESPONSIBLE));
        // adt-clients 26.0.1: SAP reads it as the creator, so it is not sent.
        assert.ok(!createBody(connection).includes('adtcore:responsible'));
        assert.ok(!createBody(connection).includes('adtcore:masterSystem'));
      },
    );
  }

  it('a class create carries no responsible attribute, whatever the context says', async () => {
    // adt-clients 26.0.1, measured on premise: SAP stores adtcore:responsible on
    // a class create as the creator, and records the logon user as responsible.
    setSystemContext({ responsible: 'USER_PLACEHOLDER' });
    const { connection, result } = await createClass();
    assert.ok(!textOf(result).includes(MISSING_RESPONSIBLE));
    assert.ok(!createBody(connection).includes('adtcore:responsible'));
  });

  for (const [_tier, handler] of bimpTools) {
    it(
      format(
        'CreateBehaviorImplementation (%s), nothing stated: refused naming SAP_RESPONSIBLE, nothing sent',
        _tier,
      ),
      async () => {
        const connection = recordingConnection();
        const result = await handler(
          { connection, logger: undefined } as never,
          BIMP_ARGS as never,
        );
        assert.ok(textOf(result).includes(MISSING_RESPONSIBLE));
        assertMatchObject(JSON.parse(textOf(result)), {
          error: 'system_context_missing',
        });
        assert.deepStrictEqual(connection.requests, []);
      },
    );
  }

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
    assert.ok(
      createBody(connection).includes(
        'adtcore:masterSystem="SYSTEM_PLACEHOLDER"',
      ),
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
    assert.ok(textOf(refused).includes(MISSING_RESPONSIBLE));
    assert.deepStrictEqual(refusedConnection.requests, []);

    setSystemContext({ responsible: 'USER_PLACEHOLDER' });
    const sentConnection = recordingConnection();
    await handleCreateMessageClass(
      { connection: sentConnection, logger: undefined } as never,
      MSAG_ARGS as never,
    );
    assert.ok(
      createBody(sentConnection).includes(
        'adtcore:responsible="USER_PLACEHOLDER"',
      ),
    );
  });

  it('a transport without an owner is refused naming SAP_RESPONSIBLE; the owner argument is enough', async () => {
    const refusedConnection = recordingConnection();
    const refused = await handleCreateTransport(
      { connection: refusedConnection, logger: undefined } as never,
      { description: 'placeholder' },
    );
    assert.ok(textOf(refused).includes(MISSING_RESPONSIBLE));
    assert.deepStrictEqual(refusedConnection.requests, []);

    const sentConnection = recordingConnection();
    await handleCreateTransport(
      { connection: sentConnection, logger: undefined } as never,
      { description: 'placeholder', owner: 'OWNER_PLACEHOLDER' },
    );
    assert.ok(sentConnection.requests.map((r) => r.method).includes('POST'));
    assert.ok(
      String(sentConnection.requests[0].data).includes('OWNER_PLACEHOLDER'),
    );
  });

  it('a read-only tool is not refused', async () => {
    const connection = recordingConnection();
    const result = await handleGetClass(
      { connection, logger: undefined } as never,
      { class_name: 'ZCL_PLACEHOLDER' },
    );
    assert.ok(!textOf(result).includes(MISSING_RESPONSIBLE));
    assert.ok(connection.requests.length > 0);
  });
});
