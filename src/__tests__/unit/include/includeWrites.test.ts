/**
 * The include writes, driven through the real adt-clients against a
 * recording connection: what each tool sends, and what it refuses before
 * sending anything.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import {
  TOOL_DEFINITION as CREATE_INCLUDE,
  handleCreateInclude,
} from '../../../handlers/include/high/handleCreateInclude';
import {
  TOOL_DEFINITION as DELETE_INCLUDE,
  handleDeleteInclude,
} from '../../../handlers/include/high/handleDeleteInclude';
import {
  handleUpdateInclude,
  TOOL_DEFINITION as UPDATE_INCLUDE,
} from '../../../handlers/include/high/handleUpdateInclude';
import {
  handleUpdateIncludeMetadata,
  TOOL_DEFINITION as UPDATE_INCLUDE_METADATA,
} from '../../../handlers/include/high/handleUpdateIncludeMetadata';
import {
  TOOL_DEFINITION as ACTIVATE_INCLUDE,
  handleActivateInclude,
} from '../../../handlers/include/low/handleActivateInclude';
import { defineTool } from '../../../lib/handlers/interfaces';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { corpusBody } from '../../helpers/adtCorpus';
import { assertMatchObject, assertRejects } from '../../helpers/assertions';
import { setSystemContext } from '../../helpers/processSystemContext';
import {
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';

const previous = process.env.SAP_SYSTEM_TYPE;

beforeEach(() => {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  setSystemContext({
    masterSystem: 'SYSTEM_PLACEHOLDER',
    responsible: 'USER_PLACEHOLDER',
  });
});

afterEach(() => {
  resetSystemContextCache();
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

const INCLUDES = '/sap/bc/adt/programs/includes';
const PAIR = 'application/vnd.sap.adt.programs.includes.v2+xml';

describe('CreateInclude', () => {
  it('says SAP writes its comment header into the new include (measured)', () => {
    const { description } = CREATE_INCLUDE;
    assert.equal(description.includes('comment header'), true);
    assert.equal(description.toLowerCase().includes('empty'), false);
  });

  it('sends one POST to the includes collection, stateless, with the include document', async () => {
    const connection = recordingConnection();
    const result = await handleCreateInclude(
      { connection, logger: undefined },
      {
        include_name: 'ZI_X',
        package_name: 'ZP',
        description: 'An include',
      },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 1);
    const [sent] = connection.requests;
    assert.equal(sent?.method, 'POST');
    assert.equal(sent?.url, INCLUDES);
    const body = String(sent?.data);
    assert.ok(body.includes('<include:abapInclude'));
    assert.ok(body.includes('adtcore:name="ZI_X"'));
    assert.ok(body.includes('adtcore:description="An include"'));
    assert.ok(body.includes('<adtcore:packageRef adtcore:name="ZP"/>'));
    assert.equal(sent?.headers?.Accept, PAIR);
    assert.equal(sent?.headers?.['Content-Type'], PAIR);
    assert.equal(
      Object.keys(sent?.headers ?? {})
        .join(' ')
        .toLowerCase()
        .includes('sessiontype'),
      false,
    );
  });

  it('puts the transport on corrNr, and only with one', async () => {
    const withTransport = recordingConnection();
    await handleCreateInclude(
      { connection: withTransport, logger: undefined },
      { include_name: 'ZI_X', package_name: 'ZP', transport_request: 'K1' },
    );
    assert.equal(withTransport.requests[0]?.url, `${INCLUDES}?corrNr=K1`);

    const without = recordingConnection();
    await handleCreateInclude(
      { connection: without, logger: undefined },
      { include_name: 'ZI_X', package_name: 'ZP' },
    );
    assert.equal(without.requests[0]?.url, INCLUDES);
  });

  it('uses the name as the description when none is given, and sends the master language', async () => {
    const connection = recordingConnection();
    await handleCreateInclude(
      { connection, logger: undefined },
      { include_name: 'zi_x', package_name: 'ZP', master_language: 'DE' },
    );
    const body = String(connection.requests[0]?.data);
    assert.ok(body.includes('adtcore:description="ZI_X"'));
    assert.ok(body.includes('adtcore:masterLanguage="DE"'));
  });

  for (const [name, args] of [
    ['include_name', { include_name: '', package_name: 'ZP' }],
    ['package_name', { include_name: 'ZI_X', package_name: '' }],
  ] as const) {
    it(format('refuses an empty %s, sending nothing', name), async () => {
      const connection = recordingConnection();
      const result = await handleCreateInclude(
        { connection, logger: undefined },
        args,
      );
      assert.equal(result.isError, true);
      assert.equal(result.content[0].text, `${name} is required`);
      assert.equal(connection.requests.length, 0);
    });
  }

  for (const [name, args] of [
    ['include_name', { package_name: 'ZP' }],
    ['package_name', { include_name: 'ZI_X' }],
  ] satisfies [string, Record<string, unknown>][]) {
    it(
      format('refuses an absent %s at the schema, sending nothing', name),
      async () => {
        const connection = recordingConnection();
        const refused = assertRejects(
          defineTool(CREATE_INCLUDE, handleCreateInclude).call(
            { connection, logger: undefined },
            args,
          ),
          `at ${name}`,
        );
        await refused;
        assert.equal(connection.requests.length, 0);
      },
    );
  }

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleCreateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', package_name: 'ZP' },
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('variant_not_served'));
    assert.equal(connection.requests.length, 0);
  });
});

/**
 * A recording connection that also notes the session type each request went
 * out under, so that "LOCK and UNLOCK stateful, everything else stateless" is
 * read off the wire order.
 */
function sessionRecording(
  answers: Parameters<typeof recordingConnection>[0] = [],
): RecordingConnection & { readonly sessions: string[] } {
  const inner = recordingConnection(answers);
  const sessions: string[] = [];
  let current = 'stateless';
  return {
    ...inner,
    sessions,
    setSessionType(type) {
      current = type;
    },
    async makeAdtRequest(options) {
      sessions.push(current);
      return inner.makeAdtRequest(options);
    },
  };
}

const LOCK_URL = `${INCLUDES}/zi_x?_action=LOCK&accessMode=MODIFY`;
const UNLOCK_URL = `${INCLUDES}/zi_x?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D`;
const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';
const REFUSED = {
  status: 403,
  statusText: 'Forbidden',
  data: '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><type id="ExceptionResourceNoAccess"/><message>refused</message></exc:exception>',
};

describe('UpdateInclude', () => {
  it('locks stateful, writes the source stateless under the handle, unlocks stateful', async () => {
    const connection = sessionRecording();
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      {
        include_name: 'ZI_X',
        source_code: 'WRITE 1.',
        transport_request: 'K1',
      },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(
      connection.requests.map((r) => `${r.method} ${r.url}`),
      [
        `POST ${LOCK_URL}`,
        `PUT ${INCLUDES}/zi_x/source/main?lockHandle=${HANDLE}&corrNr=K1`,
        `POST ${UNLOCK_URL}`,
      ],
    );
    assert.deepStrictEqual(connection.sessions, [
      'stateful',
      'stateless',
      'stateful',
    ]);
    const put = connection.requests[1];
    assert.equal(put?.data, 'WRITE 1.');
    assert.equal(put?.headers?.Accept, 'text/plain');
    assert.equal(put?.headers?.['Content-Type'], 'text/plain; charset=utf-8');
  });

  it('sends no corrNr without a transport, and no activation without activate', async () => {
    const connection = sessionRecording();
    await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x', activate: false },
    );
    assert.equal(
      connection.requests[1]?.url,
      `${INCLUDES}/zi_x/source/main?lockHandle=${HANDLE}`,
    );
    assert.equal(connection.requests.length, 3);
  });

  it('adds one activation POST after the unlock when activate is true', async () => {
    const connection = sessionRecording();
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x', activate: true },
    );
    assert.equal(result.isError, false);
    assert.equal(connection.requests.length, 4);
    const activation = connection.requests[3];
    assert.equal(activation?.method, 'POST');
    assert.ok(activation?.url.includes('/sap/bc/adt/activation'));
    assert.ok(String(activation?.data).includes('/programs/includes/zi_x'));
    assert.equal(connection.sessions[3], 'stateless');
  });

  it("unlocks before the activation, and answers a refused activation as an error with SAP's text", async () => {
    // SAP's refusal of an activation: 200, activationExecuted="false" and an
    // error message (the corpus case refusal-activation-fails).
    const connection = sessionRecording([
      undefined,
      undefined,
      undefined,
      { data: corpusBody('refusal-activation-fails--01-activation') },
    ]);
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x', activate: true },
    );
    assert.equal(result.isError, true);
    assert.deepStrictEqual(
      connection.requests.map((r) => `${r.method} ${r.url}`),
      [
        `POST ${LOCK_URL}`,
        `PUT ${INCLUDES}/zi_x/source/main?lockHandle=${HANDLE}`,
        `POST ${UNLOCK_URL}`,
        'POST /sap/bc/adt/activation?method=activate&preauditRequested=true',
      ],
    );
    assert.deepStrictEqual(connection.sessions, [
      'stateful',
      'stateless',
      'stateful',
      'stateless',
    ]);
    const text = result.content.map((item) => item.text ?? '').join('\n');
    assert.ok(text.includes('STRONG_BUT_NOT_A_REAL_TYPE'));
    assert.ok(text.includes('is unknown.'));
  });

  it('still unlocks when the write is refused, and answers the refusal', async () => {
    const connection = sessionRecording([undefined, REFUSED]);
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x', activate: true },
    );
    assert.equal(result.isError, true);
    assert.deepStrictEqual(
      connection.requests.map((r) => r.method),
      ['POST', 'PUT', 'POST'],
    );
    assert.equal(connection.requests[2]?.url, UNLOCK_URL);
    assert.equal(connection.sessions[2], 'stateful');
  });

  for (const [name, args] of [
    ['include_name', { include_name: '', source_code: 'x' }],
    ['source_code', { include_name: 'ZI_X', source_code: '' }],
  ] as const) {
    it(format('refuses an empty %s, sending nothing', name), async () => {
      const connection = recordingConnection();
      const result = await handleUpdateInclude(
        { connection, logger: undefined },
        args,
      );
      assert.equal(result.isError, true);
      assert.equal(result.content[0].text, `${name} is required`);
      assert.equal(connection.requests.length, 0);
    });
  }

  for (const [name, args] of [
    ['include_name', { source_code: 'x' }],
    ['source_code', { include_name: 'ZI_X' }],
  ] satisfies [string, Record<string, unknown>][]) {
    it(
      format('refuses an absent %s at the schema, sending nothing', name),
      async () => {
        const connection = recordingConnection();
        const refused = assertRejects(
          defineTool(UPDATE_INCLUDE, handleUpdateInclude).call(
            { connection, logger: undefined },
            args,
          ),
          `at ${name}`,
        );
        await refused;
        assert.equal(connection.requests.length, 0);
      },
    );
  }

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleUpdateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X', source_code: 'x' },
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('variant_not_served'));
    assert.equal(connection.requests.length, 0);
  });
});

const DOCUMENT =
  '<?xml version="1.0" encoding="UTF-8"?>\n<include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes" adtcore:name="ZI_X"  >\n  <x/>\n</include:abapInclude>';

describe('UpdateIncludeMetadata', () => {
  it('locks stateful, puts the document byte for byte stateless, unlocks stateful', async () => {
    const connection = sessionRecording();
    const result = await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      { include_name: 'ZI_X', metadata: DOCUMENT, transport_request: 'K1' },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(
      connection.requests.map((r) => `${r.method} ${r.url}`),
      [
        `POST ${LOCK_URL}`,
        `PUT ${INCLUDES}/zi_x?lockHandle=${HANDLE}&corrNr=K1`,
        `POST ${UNLOCK_URL}`,
      ],
    );
    assert.deepStrictEqual(connection.sessions, [
      'stateful',
      'stateless',
      'stateful',
    ]);
    const put = connection.requests[1];
    assert.equal(put?.data, DOCUMENT);
    assert.equal(put?.headers?.Accept, PAIR);
    assert.equal(put?.headers?.['Content-Type'], PAIR);
  });

  it('sends no corrNr without a transport and no activation', async () => {
    const connection = sessionRecording();
    await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      { include_name: 'ZI_X', metadata: DOCUMENT },
    );
    assert.equal(
      connection.requests[1]?.url,
      `${INCLUDES}/zi_x?lockHandle=${HANDLE}`,
    );
    assert.equal(connection.requests.length, 3);
  });

  it('still unlocks when the write is refused', async () => {
    const connection = sessionRecording([undefined, REFUSED]);
    const result = await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      { include_name: 'ZI_X', metadata: DOCUMENT },
    );
    assert.equal(result.isError, true);
    assert.deepStrictEqual(
      connection.requests.map((r) => r.method),
      ['POST', 'PUT', 'POST'],
    );
    assert.equal(connection.requests[2]?.url, UNLOCK_URL);
  });

  for (const [name, args] of [
    ['include_name', { include_name: '', metadata: DOCUMENT }],
    ['metadata', { include_name: 'ZI_X', metadata: '' }],
  ] as const) {
    it(format('refuses an empty %s, sending nothing', name), async () => {
      const connection = recordingConnection();
      const result = await handleUpdateIncludeMetadata(
        { connection, logger: undefined },
        args,
      );
      assert.equal(result.isError, true);
      assert.equal(result.content[0].text, `${name} is required`);
      assert.equal(connection.requests.length, 0);
    });
  }

  for (const [name, args] of [
    ['include_name', { metadata: DOCUMENT }],
    ['metadata', { include_name: 'ZI_X' }],
  ] satisfies [string, Record<string, unknown>][]) {
    it(
      format('refuses an absent %s at the schema, sending nothing', name),
      async () => {
        const connection = recordingConnection();
        const refused = assertRejects(
          defineTool(UPDATE_INCLUDE_METADATA, handleUpdateIncludeMetadata).call(
            { connection, logger: undefined },
            args,
          ),
          `at ${name}`,
        );
        await refused;
        assert.equal(connection.requests.length, 0);
      },
    );
  }

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleUpdateIncludeMetadata(
      { connection, logger: undefined },
      { include_name: 'ZI_X', metadata: DOCUMENT },
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('variant_not_served'));
    assert.equal(connection.requests.length, 0);
  });
});

const CHECK_URL = '/sap/bc/adt/deletion/check';
const DELETE_URL = '/sap/bc/adt/deletion/delete';
const DELETION_PAIR = {
  check: {
    Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
  },
  delete: {
    Accept: 'application/vnd.sap.adt.deletion.response.v1+xml',
    'Content-Type': 'application/vnd.sap.adt.deletion.request.v1+xml',
  },
};

function checkXml(refusal?: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?><del:checkResponse xmlns:del="http://www.sap.com/adt/deletion">' +
    `<del:object del:externalStrongReferences="0" del:externalWeakReferences="0" del:isDeletable="${refusal ? 'false' : 'true'}" adtcore:name="ZI_X" xmlns:adtcore="http://www.sap.com/adt/core">` +
    (refusal
      ? `<del:message del:priority="0" del:type="E"><del:text>${refusal}</del:text></del:message>`
      : '') +
    '</del:object></del:checkResponse>'
  );
}

const DELETED_XML =
  '<?xml version="1.0" encoding="utf-8"?><del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
  '<del:object del:isDeleted="true" adtcore:name="ZI_X" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<del:message del:priority="0" del:type="S"><del:text/></del:message></del:object></del:deletionResult>';

describe('DeleteInclude', () => {
  it('sends the check POST, then the delete POST, stateless and without a lock', async () => {
    const connection = sessionRecording([
      { data: checkXml() },
      { data: DELETED_XML },
    ]);
    const result = await handleDeleteInclude(
      { connection, logger: undefined },
      { include_name: 'zi_x', transport_request: 'K1' },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(
      connection.requests.map((r) => `${r.method} ${r.url}`),
      [`POST ${CHECK_URL}`, `POST ${DELETE_URL}`],
    );
    assert.deepStrictEqual(connection.sessions, ['stateless', 'stateless']);
    const [check, del] = connection.requests;
    assert.equal(check?.headers?.Accept, DELETION_PAIR.check.Accept);
    assert.equal(
      check?.headers?.['Content-Type'],
      DELETION_PAIR.check['Content-Type'],
    );
    assert.equal(del?.headers?.Accept, DELETION_PAIR.delete.Accept);
    assert.equal(
      del?.headers?.['Content-Type'],
      DELETION_PAIR.delete['Content-Type'],
    );
    assert.ok(
      String(check?.data).includes(
        'adtcore:uri="/sap/bc/adt/programs/includes/zi_x"',
      ),
    );
    assert.ok(
      String(del?.data).includes(
        'adtcore:uri="/sap/bc/adt/programs/includes/zi_x"',
      ),
    );
    assert.ok(String(del?.data).includes('K1'));
    assertMatchObject(JSON.parse(result.content[0].text), {
      deleted: true,
      object: 'ZI_X',
    });
  });

  it('answers a refused check as it came and sends no delete', async () => {
    const connection = sessionRecording([
      { data: checkXml('Include is still used') },
    ]);
    const result = await handleDeleteInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X' },
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('Include is still used'));
    assert.deepStrictEqual(
      connection.requests.map((r) => r.url),
      [CHECK_URL],
    );
  });

  for (const [name, args] of [
    ['include_name', { include_name: '' }],
  ] as const) {
    it(format('refuses an empty %s, sending nothing', name), async () => {
      const connection = recordingConnection();
      const result = await handleDeleteInclude(
        { connection, logger: undefined },
        args,
      );
      assert.equal(result.isError, true);
      assert.equal(result.content[0].text, `${name} is required`);
      assert.equal(connection.requests.length, 0);
    });
  }

  for (const [name, args] of [['include_name', {}]]) {
    it(
      format('refuses an absent %s at the schema, sending nothing', name),
      async () => {
        const connection = recordingConnection();
        const refused = assertRejects(
          defineTool(DELETE_INCLUDE, handleDeleteInclude).call(
            { connection, logger: undefined },
            args,
          ),
          `at ${name}`,
        );
        await refused;
        assert.equal(connection.requests.length, 0);
      },
    );
  }

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleDeleteInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X' },
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('variant_not_served'));
    assert.equal(connection.requests.length, 0);
  });
});

describe('ActivateInclude', () => {
  it('sends one stateless activation POST naming the include', async () => {
    const connection = sessionRecording([
      { data: corpusBody('activation-success-verdict--01-activation') },
    ]);
    const result = await handleActivateInclude(
      { connection, logger: undefined },
      { include_name: 'zi_x' },
    );
    assert.equal(result.isError, false);
    assertMatchObject(JSON.parse(result.content[0].text), {
      activated: true,
    });
    assert.equal(connection.requests.length, 1);
    const [sent] = connection.requests;
    assert.equal(sent?.method, 'POST');
    assert.ok(
      sent?.url.includes(
        '/sap/bc/adt/activation?method=activate&preauditRequested=true',
      ),
    );
    assert.ok(String(sent?.data).includes('/programs/includes/zi_x'));
    assert.ok(String(sent?.data).includes('adtcore:name="ZI_X"'));
    assert.equal(sent?.headers?.Accept, 'application/xml');
    assert.equal(
      sent?.headers?.['Content-Type'],
      'application/vnd.sap.adt.activation+xml',
    );
    assert.deepStrictEqual(connection.sessions, ['stateless']);
  });

  for (const [name, args] of [
    ['include_name', { include_name: '' }],
  ] as const) {
    it(format('refuses an empty %s, sending nothing', name), async () => {
      const connection = recordingConnection();
      const result = await handleActivateInclude(
        { connection, logger: undefined },
        args,
      );
      assert.equal(result.isError, true);
      assert.equal(result.content[0].text, `${name} is required`);
      assert.equal(connection.requests.length, 0);
    });
  }

  for (const [name, args] of [['include_name', {}]]) {
    it(
      format('refuses an absent %s at the schema, sending nothing', name),
      async () => {
        const connection = recordingConnection();
        const refused = assertRejects(
          defineTool(ACTIVATE_INCLUDE, handleActivateInclude).call(
            { connection, logger: undefined },
            args,
          ),
          `at ${name}`,
        );
        await refused;
        assert.equal(connection.requests.length, 0);
      },
    );
  }

  it('is refused variant_not_served on a connection declared cloud, sending nothing', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'cloud');
    const result = await handleActivateInclude(
      { connection, logger: undefined },
      { include_name: 'ZI_X' },
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('variant_not_served'));
    assert.equal(connection.requests.length, 0);
  });
});
