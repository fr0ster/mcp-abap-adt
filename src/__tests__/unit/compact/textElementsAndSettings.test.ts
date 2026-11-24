/**
 * The compact sub-resource types: `TABLE_SETTINGS` and the three text
 * elements types are read by HandlerGet, written by HandlerUpdate under the
 * caller's lock (one operation: no lock, unlock or activation inside), and
 * locked by HandlerLock / HandlerUnlock (the settings' TABT lock, the text
 * elements' TEXT lock).
 *
 * HandlerActivate and the text elements: `PROGRAM_TEXT_ELEMENTS` and
 * `FUNCTION_GROUP_TEXT_ELEMENTS` are activated as `PROG/PX` — a function
 * group's at `/sap/bc/adt/textelements/functiongroups/{group}` — and
 * `CLASS_TEXT_ELEMENTS` as `CLAS/OCX`. The text elements alone activate
 * (measured on premise, `texts-translation.md` §10 steps 51–52, §12.1). A
 * stated legacy system serves no text elements (its discovery lists no
 * `/textelements`, recorded, §9), so the three are refused there before any
 * request.
 *
 * Replayed over a connection answering by request: real adt-clients code,
 * no SAP.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import {
  handleHandlerActivate,
  TOOL_DEFINITION,
} from '../../../../compact-modify/src/handlers/handleHandlerActivate';
import {
  TOOL_DEFINITION as HandlerLock,
  handleHandlerLock,
} from '../../../../compact-modify/src/handlers/handleHandlerLock';
import {
  TOOL_DEFINITION as HandlerUnlock,
  handleHandlerUnlock,
} from '../../../../compact-modify/src/handlers/handleHandlerUnlock';
import {
  TOOL_DEFINITION as HandlerUpdate,
  handleHandlerUpdate,
} from '../../../../compact-modify/src/handlers/handleHandlerUpdate';
import {
  TOOL_DEFINITION as HandlerGet,
  handleHandlerGet,
} from '../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import {
  readToken,
  updateToken,
} from '../../../lib/compact/compactDescriptions';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { readOnlyToolNames } from '../../../lib/toolSet';
import { corpusBody } from '../../helpers/adtCorpus';
import { holding } from '../../helpers/heldLocks';
import { setSystemContext } from '../../helpers/processSystemContext';
import { LOCK_SUCCESS_XML } from '../../helpers/recordingConnection';
import {
  SETTINGS_ETAG,
  settingsDocument,
} from '../tableSettings/settingsStandIn';

const RUN_ID = 'RUN0001';
const ACTIVATED =
  '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/></chkl:messages>';
const DISCOVERY = corpusBody('system-description-s4-2025--03-discovery');

/** A connection answering by request, recording each request. */
function system(variant: 'onprem' | 'cloud') {
  const requests: IAbapRequestOptions[] = [];
  const connection: IAbapConnection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest<T = unknown, D = unknown>(
      options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      requests.push(options);
      const url = options.url;
      const answer = (
        status: number,
        data = '',
        headers: Record<string, string> = {},
      ): IAdtWireResponse<T, D> =>
        // A recorded body is text; `T` is the caller's view of it.
        ({ data: data as T, status, statusText: 'OK', headers });
      if (url.startsWith('/sap/bc/adt/discovery'))
        return answer(200, DISCOVERY);
      if (url.startsWith('/sap/bc/adt/activation/runs?'))
        return answer(202, '', {
          location: `/sap/bc/adt/activation/runs/${RUN_ID}`,
        });
      if (url.startsWith(`/sap/bc/adt/activation/runs/${RUN_ID}`))
        return answer(
          200,
          '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>',
        );
      if (url.startsWith(`/sap/bc/adt/activation/results/${RUN_ID}`))
        return answer(200, ACTIVATED);
      if (url.includes('_action=LOCK')) return answer(200, LOCK_SUCCESS_XML);
      if (
        url.startsWith('/sap/bc/adt/ddic/db/settings/') &&
        options.method === 'GET'
      )
        return answer(
          200,
          settingsDocument(
            'ZMCP_TS',
            'inactive',
            variant === 'cloud' ? false : undefined,
          ),
          { etag: SETTINGS_ETAG },
        );
      return answer(200);
    },
  };
  declareSystemKind(connection, variant);
  return { connection, requests };
}

/** The references the group activation sent: `type uri` of each. */
function sentReferences(requests: readonly IAbapRequestOptions[]): string[] {
  const post = requests.find((r) =>
    r.url.startsWith('/sap/bc/adt/activation/runs?'),
  );
  const body = String(post?.data ?? '');
  return [
    ...body.matchAll(/adtcore:uri="([^"]*)" adtcore:type="([^"]*)"/g),
  ].map((m) => `${m[2]} ${m[1]}`);
}

before(() => {
  setSystemContext({ masterSystem: 'SID', responsible: 'SAPUSER01' });
});
after(() => resetSystemContextCache());

describe('HandlerActivate: the text elements', () => {
  const cases = [
    [
      'PROGRAM_TEXT_ELEMENTS',
      'ZPROG_X',
      'PROG/PX /sap/bc/adt/textelements/programs/zprog_x',
    ],
    [
      'FUNCTION_GROUP_TEXT_ELEMENTS',
      'ZFG_X',
      'PROG/PX /sap/bc/adt/textelements/functiongroups/zfg_x',
    ],
    [
      'CLASS_TEXT_ELEMENTS',
      'ZCL_X',
      'CLAS/OCX /sap/bc/adt/textelements/classes/zcl_x',
    ],
  ] as const;
  for (const variant of ['onprem', 'cloud'] as const) {
    for (const [objectType, name, sent] of cases) {
      it(`activates ${objectType} at its address (${variant})`, async () => {
        const { connection, requests } = system(variant);
        const result = await handleHandlerActivate(
          { connection, logger: undefined },
          { object_type: objectType, object_name: name },
        );
        assert.notEqual(
          'isError' in result && result.isError,
          true,
          JSON.stringify(result),
        );
        assert.deepEqual(sentReferences(requests), [sent]);
      });
    }
  }

  it('offers the three on both variants', () => {
    for (const variant of ['onprem', 'cloud'] as const) {
      const members = TOOL_DEFINITION.variants[variant].members ?? [];
      for (const [objectType] of cases) {
        assert.ok(members.includes(objectType), `${objectType} on ${variant}`);
      }
    }
  });

  for (const [objectType, name] of cases) {
    it(`refuses ${objectType} on a stated legacy system, with nothing sent`, async () => {
      const { connection, requests } = system('onprem');
      const result = await handleHandlerActivate(
        { connection, logger: undefined, systemType: 'legacy' },
        { object_type: objectType, object_name: name },
      );
      assert.equal('isError' in result && result.isError, true);
      assert.match(JSON.stringify(result), /legacy/);
      assert.deepEqual(requests, []);
    });
  }
});

const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';
const SYMBOL = { key: '001', text: 'First symbol', max_length: 20 };

/** `METHOD path` of each request but the discovery. */
const lines = (requests: readonly IAbapRequestOptions[]) =>
  requests
    .filter((r) => !r.url.startsWith('/sap/bc/adt/discovery'))
    .map((r) => `${r.method} ${r.url}`);

describe('HandlerGet: the sub-resources', () => {
  const reads = [
    [
      'TABLE_SETTINGS',
      { table_name: 'ZMCP_TS' },
      ['GET /sap/bc/adt/ddic/db/settings/zmcp_ts?version=active'],
    ],
    [
      'CLASS_TEXT_ELEMENTS',
      { class_name: 'ZCL_X' },
      ['GET /sap/bc/adt/textelements/classes/zcl_x/source/symbols'],
    ],
    [
      'FUNCTION_GROUP_TEXT_ELEMENTS',
      { function_group_name: 'ZFG_X' },
      [
        'GET /sap/bc/adt/textelements/functiongroups/zfg_x/source/symbols',
        'GET /sap/bc/adt/textelements/functiongroups/zfg_x/source/selections',
        'GET /sap/bc/adt/textelements/functiongroups/zfg_x/source/headings',
      ],
    ],
    [
      'PROGRAM_TEXT_ELEMENTS',
      { program_name: 'ZPROG_X' },
      [
        'GET /sap/bc/adt/textelements/programs/zprog_x/source/symbols',
        'GET /sap/bc/adt/textelements/programs/zprog_x/source/selections',
        'GET /sap/bc/adt/textelements/programs/zprog_x/source/headings',
      ],
    ],
  ] as const;
  for (const [objectType, names, sent] of reads) {
    it(`reads ${objectType} through its full tool`, async () => {
      const { connection, requests } = system('onprem');
      const result = await handleHandlerGet(
        { connection, logger: undefined },
        { object_type: objectType, ...names },
      );
      // The stand answers each part empty: the requests are the read.
      assert.ok(result !== undefined);
      assert.deepEqual(
        lines(requests).map((line) => line.split('?')[0]),
        sent.map((line) => line.split('?')[0]),
      );
    });
  }
});

describe("HandlerUpdate: the sub-resources under the caller's lock", () => {
  it('writes TABLE_SETTINGS as the patch alone: its read and its PUT, no LOCK, UNLOCK or activation', async () => {
    const { connection, requests } = system('onprem');
    const result = await handleHandlerUpdate(
      { connection, logger: undefined, heldLocks: holding(HANDLE) },
      {
        object_type: 'TABLE_SETTINGS',
        table_name: 'ZMCP_TS',
        data_class: 'APPL1',
        lock_handle: HANDLE,
      },
    );
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(
      lines(requests).map((line) => line.split('?')[0]),
      [
        'GET /sap/bc/adt/ddic/db/settings/zmcp_ts',
        'PUT /sap/bc/adt/ddic/db/settings/zmcp_ts',
      ],
    );
    assert.ok(lines(requests)[1]?.includes(`lockHandle=${HANDLE}`));
  });

  it('refuses area_key_fields beside a buffering type other than G, with nothing sent', async () => {
    const { connection, requests } = system('onprem');
    const args = {
      object_type: 'TABLE_SETTINGS',
      table_name: 'ZMCP_TS',
      buffering: { type: 'P', area_key_fields: 2 },
      lock_handle: HANDLE,
    } as const;
    assert.equal(HandlerUpdate.inputSchema.safeParse(args).success, false);
    // The route parses with the same schema: refused as an input error.
    await assert.rejects(
      handleHandlerUpdate(
        { connection, logger: undefined, heldLocks: holding(HANDLE) },
        args,
      ),
      /area_key_fields goes with buffering type G/,
    );
    assert.deepEqual(requests, []);
  });

  it('writes the text elements parts given, each one PUT under the handle, nothing else', async () => {
    const { connection, requests } = system('cloud');
    const result = await handleHandlerUpdate(
      { connection, logger: undefined, heldLocks: holding(HANDLE) },
      {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        function_group_name: 'ZFG_X',
        symbols: [SYMBOL],
        lock_handle: HANDLE,
      },
    );
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(lines(requests), [
      `PUT /sap/bc/adt/textelements/functiongroups/zfg_x/source/symbols?lockHandle=${HANDLE}`,
    ]);
  });

  it('offers PROGRAM_TEXT_ELEMENTS on premise and not on the cloud', () => {
    const membersOn = (variant: 'onprem' | 'cloud') =>
      HandlerUpdate.variants[variant].members ?? [];
    assert.ok(membersOn('onprem').includes('PROGRAM_TEXT_ELEMENTS'));
    assert.ok(!membersOn('cloud').includes('PROGRAM_TEXT_ELEMENTS'));
    for (const variant of ['onprem', 'cloud'] as const) {
      for (const member of [
        'TABLE_SETTINGS',
        'FUNCTION_GROUP_TEXT_ELEMENTS',
        'CLASS_TEXT_ELEMENTS',
      ] as const) {
        assert.ok(membersOn(variant).includes(member));
      }
    }
  });

  it('the read-only compact build reads the four types and writes none', () => {
    const names = readOnlyToolNames();
    assert.ok(names.has('HandlerGet'));
    assert.ok(!names.has('HandlerUpdate'));
  });
});

describe('HandlerLock and HandlerUnlock: the sub-resources', () => {
  it("offers a program's text elements on premise and not on the cloud, as HandlerUpdate", () => {
    for (const definition of [HandlerLock, HandlerUnlock]) {
      assert.ok(
        (definition.variants.onprem.members ?? []).includes(
          'PROGRAM_TEXT_ELEMENTS',
        ),
      );
      assert.ok(
        !(definition.variants.cloud.members ?? []).includes(
          'PROGRAM_TEXT_ELEMENTS',
        ),
      );
    }
  });

  it("locks TABLE_SETTINGS with the settings' own lock", async () => {
    const { connection, requests } = system('onprem');
    const result = await handleHandlerLock(
      { connection, logger: undefined, heldLocks: holding() },
      { object_type: 'TABLE_SETTINGS', object_name: 'ZMCP_TS' },
    );
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(lines(requests), [
      'POST /sap/bc/adt/ddic/db/settings/zmcp_ts?_action=LOCK&accessMode=MODIFY',
    ]);
  });

  it("locks and unlocks a function group's text elements at their address", async () => {
    const { connection, requests } = system('cloud');
    const held = holding();
    await handleHandlerLock(
      { connection, logger: undefined, heldLocks: held },
      { object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS', object_name: 'ZFG_X' },
    );
    const result = await handleHandlerUnlock(
      { connection, logger: undefined, heldLocks: held },
      {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        object_name: 'ZFG_X',
        lock_handle: HANDLE,
      },
    );
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(lines(requests), [
      'POST /sap/bc/adt/textelements/functiongroups/zfg_x?_action=LOCK&accessMode=MODIFY',
      `POST /sap/bc/adt/textelements/functiongroups/zfg_x?_action=UNLOCK&lockHandle=${HANDLE}`,
    ]);
  });

  it('refuses the four on a stated legacy system, with nothing sent', async () => {
    const { connection, requests } = system('onprem');
    const context = {
      connection,
      logger: undefined,
      systemType: 'legacy',
      heldLocks: holding(HANDLE),
    };
    for (const object_type of [
      'TABLE_SETTINGS',
      'PROGRAM_TEXT_ELEMENTS',
      'FUNCTION_GROUP_TEXT_ELEMENTS',
      'CLASS_TEXT_ELEMENTS',
    ] as const) {
      const answers = [
        await handleHandlerGet(context, {
          object_type,
          table_name: 'T',
          program_name: 'P',
          function_group_name: 'G',
          class_name: 'C',
        }),
        await handleHandlerLock(context, { object_type, object_name: 'O' }),
        await handleHandlerUnlock(context, {
          object_type,
          object_name: 'O',
          lock_handle: HANDLE,
        }),
      ];
      for (const answered of answers) {
        assert.equal(answered.isError, true);
        assert.match(JSON.stringify(answered), /legacy/);
      }
    }
    assert.deepEqual(requests, []);
  });
});

describe('the compact descriptions of the sub-resources', () => {
  it('HandlerGet names each sub-resource it reads, with its arguments', () => {
    const words = HandlerGet.variants.onprem.description;
    for (const member of [
      'TABLE_SETTINGS',
      'PROGRAM_TEXT_ELEMENTS',
      'FUNCTION_GROUP_TEXT_ELEMENTS',
      'CLASS_TEXT_ELEMENTS',
    ] as const) {
      assert.ok(words.includes(readToken(member)), member);
    }
  });

  it('HandlerUpdate names the settings and the text parts it writes, with their arguments', () => {
    const words = HandlerUpdate.variants.onprem.description;
    for (const member of [
      'TABLE_SETTINGS',
      'PROGRAM_TEXT_ELEMENTS',
      'FUNCTION_GROUP_TEXT_ELEMENTS',
      'CLASS_TEXT_ELEMENTS',
    ] as const) {
      assert.ok(words.includes(updateToken(member)), member);
    }
  });
});
