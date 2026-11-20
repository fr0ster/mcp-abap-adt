/**
 * UpdateTextElements: LOCK the object's text elements, PUT each part given,
 * UNLOCK, then activate the object with its text elements when asked — one
 * call.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  handleUpdateTextElements,
  TOOL_DEFINITION,
} from '../../../handlers/text_elements/high/handleUpdateTextElements';
import { declareSystemKind } from '../../../lib/systemKind';
import { readOnlyToolNames } from '../../../lib/toolSet';
import { corpusBody } from '../../helpers/adtCorpus';
import { toolAnswer } from '../../helpers/toolAnswer';
import { textStandIn } from './textStandIn';

const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';
const PROGRAM = '/sap/bc/adt/textelements/programs/zprog_x';

function json(value: unknown): Record<string, unknown> {
  const answer = toolAnswer(value);
  return JSON.parse(answer.content.map((item) => item.text).join(''));
}

/** SAP's refusal, rejected as the shipped connection rejects a non-2xx answer. */
const refused = (status: number, message: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: {
      status,
      statusText: 'Refused',
      headers: {},
      data: `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><type id="ExceptionResourceNotAcceptable"/><message>${message}</message></exc:exception>`,
    },
  });

const ACTIVATED = corpusBody('activation-success-verdict--01-activation');

function standIn(
  variant: 'onprem' | 'cloud',
  answerFor: (
    request: IAbapRequestOptions,
  ) => { status?: number; data?: string } | Error | undefined = () => undefined,
) {
  const stand = textStandIn((request) =>
    request.url.startsWith('/sap/bc/adt/activation')
      ? (answerFor(request) ?? { data: ACTIVATED })
      : answerFor(request),
  );
  declareSystemKind(stand.connection, variant);
  return stand;
}

const SYMBOL = { key: '001', text: 'First symbol', max_length: 20 };

describe('UpdateTextElements', () => {
  it('locks once, writes each part given in order, unlocks once: only the LOCK and the UNLOCK stateful', async () => {
    const { connection, sessions } = standIn('onprem');
    const result = await handleUpdateTextElements(
      { connection, logger: undefined },
      {
        object_kind: 'program',
        object_name: 'zprog_x',
        headings: { list_header: 'Header' },
        symbols: [SYMBOL],
        selections: [{ name: 'P_TEST', text: 'Test parameter' }],
        activate: false,
      },
    );
    assert.notEqual(result.isError, true);
    assert.deepEqual(
      sessions.filter((line) => !line.includes('/discovery')),
      [
        `stateful POST ${PROGRAM}?_action=LOCK&accessMode=MODIFY`,
        `stateless PUT ${PROGRAM}/source/symbols?lockHandle=${HANDLE}`,
        `stateless PUT ${PROGRAM}/source/selections?lockHandle=${HANDLE}`,
        `stateless PUT ${PROGRAM}/source/headings?lockHandle=${HANDLE}`,
        `stateful POST ${PROGRAM}?_action=UNLOCK&lockHandle=${HANDLE}`,
      ],
    );
  });

  it('writes the part whole: the body is the list given and nothing else', async () => {
    const { connection } = standIn('onprem');
    await handleUpdateTextElements(
      { connection, logger: undefined },
      {
        object_kind: 'program',
        object_name: 'ZPROG_X',
        symbols: [SYMBOL],
        activate: false,
      },
    );
    const put = connection.requests.find((r) => r.method === 'PUT');
    assert.equal(put?.data, '@MaxLength:20\r\n001=First symbol');
    assert.equal(
      put?.headers?.['Content-Type'],
      'application/vnd.sap.adt.textelements.symbols.v1; charset=utf-8',
    );
  });

  it('ends at a refused part: the parts before it written, the rest not, the lock released', async () => {
    const { connection } = standIn('onprem', (request) =>
      request.method === 'PUT' && request.url.includes('/source/selections')
        ? refused(406, 'Length of text symbol P_TEST exceeds 30 characters')
        : undefined,
    );
    const result = await handleUpdateTextElements(
      { connection, logger: undefined },
      {
        object_kind: 'program',
        object_name: 'ZPROG_X',
        symbols: [SYMBOL],
        selections: [{ name: 'P_TEST', text: 'x'.repeat(31) }],
        headings: { list_header: 'Header' },
        activate: true,
      },
    );
    assert.equal(result.isError, true);
    const answer = json(result);
    assert.equal(answer.step, 'update selections');
    assert.equal(answer.status, 406);
    assert.match(
      JSON.stringify(answer),
      /Length of text symbol P_TEST exceeds 30 characters/,
    );
    const urls = connection.requests.map((r) => `${r.method} ${r.url}`);
    assert.ok(urls.some((url) => url.includes('/source/symbols')));
    assert.ok(!urls.some((url) => url.includes('/source/headings')));
    assert.ok(urls.some((url) => url.includes('_action=UNLOCK')));
    assert.ok(!urls.some((url) => url.includes('/sap/bc/adt/activation')));
  });

  it('activates the object and its text elements in one request', async () => {
    const { connection } = standIn('onprem');
    const result = await handleUpdateTextElements(
      { connection, logger: undefined },
      {
        object_kind: 'program',
        object_name: 'ZPROG_X',
        symbols: [SYMBOL],
        activate: true,
      },
    );
    assert.notEqual(result.isError, true);
    const activation = connection.requests.filter((r) =>
      r.url.startsWith('/sap/bc/adt/activation'),
    );
    assert.equal(activation.length, 1);
    const body = String(activation[0]?.data);
    assert.match(
      body,
      /adtcore:uri="\/sap\/bc\/adt\/programs\/programs\/zprog_x"/,
    );
    assert.match(
      body,
      /adtcore:uri="\/sap\/bc\/adt\/textelements\/programs\/zprog_x"/,
    );
  });

  it("activates a function group with its text elements at the group's address", async () => {
    const { connection } = standIn('cloud');
    await handleUpdateTextElements(
      { connection, logger: undefined },
      {
        object_kind: 'function_group',
        object_name: 'ZFG_X',
        symbols: [SYMBOL],
        activate: true,
      },
    );
    const body = String(
      connection.requests.find((r) =>
        r.url.startsWith('/sap/bc/adt/activation'),
      )?.data,
    );
    assert.match(
      body,
      /adtcore:uri="\/sap\/bc\/adt\/functions\/groups\/zfg_x"/,
    );
    assert.match(
      body,
      /adtcore:uri="\/sap\/bc\/adt\/textelements\/functiongroups\/zfg_x" adtcore:type="PROG\/PX"/,
    );
  });

  it('writes on the cloud after a LOCK that answers NoModification', async () => {
    const { connection } = standIn('cloud');
    const result = await handleUpdateTextElements(
      { connection, logger: undefined },
      {
        object_kind: 'class',
        object_name: 'ZCL_X',
        symbols: [SYMBOL],
        activate: false,
      },
    );
    assert.notEqual(result.isError, true);
    assert.ok(
      connection.requests.some(
        (r) =>
          r.method === 'PUT' &&
          r.url.startsWith(
            '/sap/bc/adt/textelements/classes/zcl_x/source/symbols',
          ),
      ),
    );
  });

  it('activates nothing when the UNLOCK is refused, and says the lock may be held', async () => {
    const { connection } = standIn('onprem', (request) =>
      request.url.includes('_action=UNLOCK')
        ? refused(403, 'unlock refused')
        : undefined,
    );
    const result = await handleUpdateTextElements(
      { connection, logger: undefined },
      {
        object_kind: 'program',
        object_name: 'ZPROG_X',
        symbols: [SYMBOL],
        activate: true,
      },
    );
    const cleanup = json(result).cleanup;
    assert.equal(
      typeof cleanup === 'object' && cleanup !== null
        ? Reflect.get(cleanup, 'left_locked')
        : undefined,
      true,
    );
    assert.ok(
      !connection.requests.some((r) =>
        r.url.startsWith('/sap/bc/adt/activation'),
      ),
    );
  });

  it('is served by the full sets, never by the read-only ones', () => {
    assert.equal(readOnlyToolNames().has(TOOL_DEFINITION.name), false);
    assert.deepEqual([...TOOL_DEFINITION.available_in], ['onprem', 'cloud']);
  });

  describe('the schema', () => {
    const onprem = TOOL_DEFINITION.variants.onprem.inputSchema;
    const cloud = TOOL_DEFINITION.variants.cloud.inputSchema;
    const call = (more: Record<string, unknown>) => ({
      object_kind: 'program',
      object_name: 'ZPROG_X',
      activate: false,
      ...more,
    });

    it('refuses a call giving no part', () => {
      assert.equal(onprem.safeParse(call({})).success, false);
    });

    it('requires activate', () => {
      const { activate: _, ...rest } = call({ symbols: [SYMBOL] });
      assert.equal(onprem.safeParse(rest).success, false);
    });

    it('refuses the selections or headings of a class', () => {
      const parsed = (part: Record<string, unknown>) =>
        onprem.safeParse(call({ object_kind: 'class', ...part })).success;
      assert.equal(parsed({ symbols: [SYMBOL] }), true);
      assert.equal(parsed({ selections: [] }), false);
      assert.equal(parsed({ headings: {} }), false);
    });

    it('writes a program on premise, and a class or a function group on the cloud', () => {
      const program = call({ symbols: [SYMBOL] });
      assert.equal(onprem.safeParse(program).success, true);
      assert.equal(cloud.safeParse(program).success, false);
      assert.equal(
        cloud.safeParse({ ...program, object_kind: 'function_group' }).success,
        true,
      );
    });
  });
});
