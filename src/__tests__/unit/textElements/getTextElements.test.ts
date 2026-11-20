/**
 * GetTextElements: one read per part asked, each with its part's media type,
 * at the object's address of its kind.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  handleGetTextElements,
  TOOL_DEFINITION,
} from '../../../handlers/text_elements/readonly/handleGetTextElements';
import { declareSystemKind } from '../../../lib/systemKind';
import { readOnlyToolNames } from '../../../lib/toolSet';
import { toolAnswer } from '../../helpers/toolAnswer';
import { MEDIA_TYPES, textStandIn } from './textStandIn';

function json(value: unknown): Record<string, unknown> {
  const answer = toolAnswer(value);
  return JSON.parse(answer.content.map((item) => item.text).join(''));
}

function read(
  variant: 'onprem' | 'cloud',
  args: Parameters<typeof handleGetTextElements>[1],
) {
  const { connection } = textStandIn();
  declareSystemKind(connection, variant);
  return handleGetTextElements({ connection, logger: undefined }, args).then(
    (result) => ({ result, connection }),
  );
}

describe('GetTextElements', () => {
  it('reads each part of a program once, with its media type, at the version asked', async () => {
    const { connection } = await read('onprem', {
      object_kind: 'program',
      object_name: 'zprog_x',
      version: 'inactive',
    });
    assert.deepEqual(
      connection.requests.map((r) => [r.method, r.url, r.headers?.Accept]),
      (['symbols', 'selections', 'headings'] as const).map((part) => [
        'GET',
        `/sap/bc/adt/textelements/programs/zprog_x/source/${part}?version=inactive`,
        MEDIA_TYPES[part],
      ]),
    );
  });

  it("addresses a function group's text elements by the group's name", async () => {
    const { connection } = await read('cloud', {
      object_kind: 'function_group',
      object_name: 'ZFG_X',
      parts: ['symbols'],
    });
    assert.deepEqual(
      connection.requests.map((r) => r.url),
      [
        '/sap/bc/adt/textelements/functiongroups/zfg_x/source/symbols?version=active',
      ],
    );
  });

  it('reads the symbols alone of a class', async () => {
    const { connection } = await read('cloud', {
      object_kind: 'class',
      object_name: 'ZCL_X',
    });
    assert.deepEqual(
      connection.requests.map((r) => r.url),
      ['/sap/bc/adt/textelements/classes/zcl_x/source/symbols?version=active'],
    );
  });

  it('answers each part read', async () => {
    const { result } = await read('onprem', {
      object_kind: 'program',
      object_name: 'ZPROG_X',
    });
    assert.deepEqual(json(result), {
      success: true,
      object_kind: 'program',
      object_name: 'ZPROG_X',
      version: 'active',
      symbols: [
        { key: '001', text: 'First symbol', max_length: 20 },
        { key: '002', text: 'Second symbol', max_length: 30 },
      ],
      selections: [
        { name: 'P_TEST', text: 'Test parameter', ddic_reference: false },
        { name: 'P_AREA', text: 'Application Area', ddic_reference: true },
      ],
      headings: {
        list_header: 'List header',
        column_header_1: 'First column',
        column_header_2: '',
        column_header_3: '',
        column_header_4: '',
      },
    });
  });

  it('refuses the selections or headings of a class at the schema', () => {
    const parsed = (parts: string[]) =>
      TOOL_DEFINITION.inputSchema.safeParse({
        object_kind: 'class',
        object_name: 'ZCL_X',
        parts,
      }).success;
    assert.equal(parsed(['symbols']), true);
    assert.equal(parsed(['selections']), false);
    assert.equal(parsed(['headings']), false);
  });

  it('is served by the read-only builds, on premise and on the cloud', () => {
    assert.equal(readOnlyToolNames().has(TOOL_DEFINITION.name), true);
    assert.deepEqual([...TOOL_DEFINITION.available_in], ['onprem', 'cloud']);
  });
});
