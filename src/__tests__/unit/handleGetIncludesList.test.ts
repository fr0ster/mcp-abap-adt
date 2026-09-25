import { handleGetIncludesList } from '../../handlers/include/readonly/handleGetIncludesList';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

/**
 * GetIncludesList builds the include tree itself, from pieces adt-clients
 * does answer.
 *
 * Measured on E19, 2026-09-25: the handler still called
 * `fetchNodeStructure(type, name, '000000', true)` — the pre-22 positional
 * signature — and read `.data` off an `IAdtResponse` that has none, so every
 * program, include and class answered `children: []` (SAPLSLVC_FULLSCREEN
 * has 45 includes). A program's includes are its `INCLUDE` statements, read
 * recursively; a function group's are its `FUGR/I` node, and which of them
 * the main program includes directly is what no other include of the group
 * includes; a class has sections, not program includes.
 */

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };
const body = (result: any) => JSON.parse(result.content[0].text);
const source = (text: string) => okResponse(reading(text, text));
const names = (node: any): any =>
  node.children.map((c: any) =>
    c.children.length ? { [c.name]: names(c) } : c.name,
  );

describe('GetIncludesList', () => {
  it("reads a program's INCLUDE statements, recursively, skipping comments and INCLUDE STRUCTURE", async () => {
    const sources: Record<string, string> = {
      ZINC1: 'FORM x.\n  INCLUDE zinc2.\nENDFORM.',
      ZINC2: 'DATA a TYPE i.',
    };
    fakeClient = fakeClientOf({
      readObjectSource: async () =>
        source(
          'REPORT zprog.\n' +
            'INCLUDE zinc1.\n' +
            '* INCLUDE zcommented.\n' +
            '" INCLUDE zquoted.\n' +
            'TYPES BEGIN OF t.\n  INCLUDE STRUCTURE zst.\nTYPES END OF t.\n',
        ),
      getInclude: async (name: unknown) => source(sources[String(name)] ?? ''),
      fetchNodeStructure: async () =>
        okResponse({ objects: [], childNodes: [] }),
    });

    const answered = body(
      await handleGetIncludesList(context as any, {
        object_name: 'ZPROG',
        object_type: 'PROG/P',
      }),
    );

    expect(names(answered.tree)).toEqual([{ ZINC1: ['ZINC2'] }]);
  });

  it('treats SAPL<fg> as its function group: the direct includes are those no other include of the group includes', async () => {
    const sources: Record<string, string> = {
      LZFGTOP: 'FUNCTION-POOL zfg.',
      LZFGUXX: 'INCLUDE lzfgu01.',
      LZFGU01: 'FUNCTION z_one.\nENDFUNCTION.',
    };
    fakeClient = fakeClientOf({
      fetchNodeStructure: async (_type: unknown, _name: unknown, opts: any) =>
        opts?.nodeId
          ? okResponse({
              objects: [
                { name: 'LZFGTOP', type: 'FUGR/I' },
                { name: 'LZFGUXX', type: 'FUGR/I' },
                { name: 'LZFGU01', type: 'FUGR/I' },
              ],
              childNodes: [],
            })
          : okResponse({
              objects: [],
              childNodes: [{ type: 'FUGR/I', nodeId: '420' }],
            }),
      getInclude: async (name: unknown) => source(sources[String(name)] ?? ''),
    });

    const answered = body(
      await handleGetIncludesList(context as any, {
        object_name: 'SAPLZFG',
        object_type: 'PROG/P',
      }),
    );

    expect(names(answered.tree)).toEqual(['LZFGTOP', { LZFGUXX: ['LZFGU01'] }]);
  });

  it("answers a class's sections, which is what a class has instead of program includes", async () => {
    const xml =
      '<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes">' +
      '<class:include class:includeType="definitions"/>' +
      '<class:include class:includeType="implementations"/>' +
      '<class:include class:includeType="main"/>' +
      '</class:abapClass>';
    fakeClient = fakeClientOf({
      readObjectMetadata: async () => okResponse(reading(xml, xml)),
    });

    const answered = body(
      await handleGetIncludesList(context as any, {
        object_name: 'ZCL_X',
        object_type: 'CLAS/OC',
      }),
    );

    expect(names(answered.tree)).toEqual([
      'definitions',
      'implementations',
      'main',
    ]);
  });
});
