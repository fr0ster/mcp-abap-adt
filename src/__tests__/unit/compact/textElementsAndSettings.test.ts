/**
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
import { resetSystemContextCache } from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { corpusBody } from '../../helpers/adtCorpus';
import { setSystemContext } from '../../helpers/processSystemContext';

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
