/**
 * ActivateObjects takes the text elements as ordinary references: `PROG/PX`
 * (a program's, or with `parentName` a function group's) and `CLAS/OCX` (a
 * class's), each sent at its own address. Nothing is added to an activation
 * that does not name them.
 *
 * - A function group's text elements are `PROG/PX` at
 *   `/sap/bc/adt/textelements/functiongroups/{group}`, the address deciding
 *   (measured on premise and on the cloud, `texts-translation.md` §12.1,
 *   §13.4).
 * - A class's are `CLAS/OCX` at `/sap/bc/adt/textelements/classes/{class}`;
 *   the inactive list names that part `PROG/PX` with the class pool's name,
 *   its uri the text elements' address (recorded on premise,
 *   `activation-class-text-elements-s4-2025` 01), so it is matched by uri.
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
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { corpusBody } from '../../helpers/adtCorpus';
import { setSystemContext } from '../../helpers/processSystemContext';

const RUN_ID = 'RUN0001';
const ACTIVATED =
  '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/></chkl:messages>';
/** The silent checklist: no activation ran, no message. */
const SILENT = corpusBody('activation-group-alone-s4-2025--04-activation');
/** The inactive list after a class's text elements were written. */
const CLASS_TEXTS_INACTIVE = corpusBody(
  'activation-class-text-elements-s4-2025--01-inactiveobjects',
);
const DISCOVERY = corpusBody('system-description-s4-2025--03-discovery');

/** A connection answering by request, recording each request. */
function system(results = ACTIVATED, inactive = '') {
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
        return answer(200, results);
      if (url.startsWith('/sap/bc/adt/activation/inactiveobjects'))
        return answer(200, inactive);
      if (url.startsWith('/sap/bc/adt/activation?'))
        return answer(200, ACTIVATED);
      return answer(200);
    },
  };
  return { connection, requests };
}

async function activate(
  variant: 'onprem' | 'cloud',
  objects: { name: string; type: string; parentName?: string }[],
  stand = system(),
) {
  declareSystemKind(stand.connection, variant);
  const result = await handleActivateObjects(
    { connection: stand.connection, logger: undefined },
    { objects },
  );
  return { result, requests: stand.requests };
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

function payloadOf(result: object): Record<string, unknown> {
  const content = 'content' in result ? result.content : undefined;
  const first = Array.isArray(content) ? content[0] : undefined;
  const text =
    typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
      ? first.text
      : '{}';
  return JSON.parse(text);
}

before(() => {
  setSystemContext({ masterSystem: 'SID', responsible: 'SAPUSER01' });
});
after(() => resetSystemContextCache());

describe('ActivateObjects and the text elements', () => {
  it("sends PROG/PX alone at the program's text elements", async () => {
    const { result, requests } = await activate('onprem', [
      { name: 'ZPROG_X', type: 'PROG/PX' },
    ]);
    assert.notEqual('isError' in result && result.isError, true);
    assert.deepEqual(sentReferences(requests), [
      'PROG/PX /sap/bc/adt/textelements/programs/zprog_x',
    ]);
  });

  for (const variant of ['onprem', 'cloud'] as const) {
    it(`sends PROG/PX with parentName at the function group's text elements (${variant})`, async () => {
      const { requests } = await activate(variant, [
        { name: 'ZFG_X', type: 'FUGR/F' },
        { name: 'ZFG_X', type: 'PROG/PX', parentName: 'ZFG_X' },
      ]);
      assert.deepEqual(sentReferences(requests), [
        'FUGR/F /sap/bc/adt/functions/groups/zfg_x',
        'PROG/PX /sap/bc/adt/textelements/functiongroups/zfg_x',
      ]);
    });
  }

  it("sends CLAS/OCX at the class's text elements", async () => {
    const { requests } = await activate('cloud', [
      { name: 'ZCL_X', type: 'CLAS/OC' },
      { name: 'ZCL_X', type: 'CLAS/OCX' },
    ]);
    assert.deepEqual(sentReferences(requests), [
      'CLAS/OC /sap/bc/adt/oo/classes/zcl_x',
      'CLAS/OCX /sap/bc/adt/textelements/classes/zcl_x',
    ]);
  });

  it('activates CLAS/OC alone as the class alone: no text elements added', async () => {
    const { requests } = await activate('onprem', [
      { name: 'ZCL_X', type: 'CLAS/OC' },
    ]);
    const activation = requests.filter((r) =>
      r.url.startsWith('/sap/bc/adt/activation'),
    );
    assert.equal(activation.length, 1);
    assert.doesNotMatch(String(activation[0]?.data), /textelements/);
  });

  it("matches the class pool's PROG/PX entry to the CLAS/OCX reference by its uri", async () => {
    const { result } = await activate(
      'onprem',
      [
        { name: 'ZCL_MCP_TV70D2', type: 'CLAS/OCX' },
        { name: 'ZMCP_TV70D2', type: 'TABL/DS' },
      ],
      system(SILENT, CLASS_TEXTS_INACTIVE),
    );
    assert.equal('isError' in result && result.isError, true);
    assert.deepEqual(payloadOf(result).still_inactive, [
      {
        name: 'ZCL_MCP_TV70D2================CP',
        type: 'PROG/PX',
        uri: '/sap/bc/adt/textelements/classes/zcl_mcp_tv70d2',
        parent_uri: '/sap/bc/adt/oo/classes/zcl_mcp_tv70d2',
      },
    ]);
  });
});
