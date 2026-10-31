/**
 * Compact HandlerUnitTestRun with a run target, against the real adt-clients
 * over a recording connection: the target goes through the generic runner as
 * RunAbapUnit's does (the same schema piece, the same mapping), the run is
 * started and answered with its id, and exactly one of tests and target is
 * taken — a refusal sends nothing.
 */

import { handleHandlerUnitTestRun } from '../../../compact-modify/src/handlers/handleHandlerUnitTestRun';
import { TOOL_DEFINITION as RUN_ABAP_UNIT } from '../../handlers/unit_test/high/handleRunAbapUnit';
import { compactUnitTestRunSchema } from '../../lib/compact/compactSchemas';
import {
  type RecordedRequest,
  recordingConnection,
} from '../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const RUN = 'FA53C505DD7B1FD1ABB8599833A05D44';
const STARTED = {
  status: 201,
  headers: { location: `/sap/bc/adt/abapunit/runs/${RUN}` },
};

const line = (r: RecordedRequest) => `${r.method} ${r.url.split('?')[0]}`;
const body = (r: RecordedRequest | undefined) => String(r?.data);
const textOf = (result: { content: ReadonlyArray<{ text: string }> }) =>
  result.content[0]?.text ?? '';

type Args = Parameters<typeof handleHandlerUnitTestRun>[1];

async function start(args: Args) {
  const connection = recordingConnection([STARTED]);
  const result = await handleHandlerUnitTestRun({ connection }, args);
  return { connection, result };
}

describe('HandlerUnitTestRun with target: started by target, answered with its run id', () => {
  const runners: Array<[string, Partial<Args>]> = [
    ['without runner', {}],
    ['runner async', { runner: 'async' }],
  ];
  it.each(runners)(
    '%s: an object target (PROG/P) goes as an osl:flatObjectSet with one osl:object',
    async (_case, extra) => {
      const { connection, result } = await start({
        target: { kind: 'object', name: 'zreport', type: 'prog/p' },
        title: 'Nightly',
        context: 'Suite',
        ...extra,
      });

      expect(result.isError).toBe(false);
      expect(connection.requests.map(line)).toEqual([
        'POST /sap/bc/adt/abapunit/runs',
      ]);
      const sent = body(connection.requests[0]);
      expect(sent).toContain('<osl:objectSet xsi:type="osl:flatObjectSet">');
      expect(sent).toContain('<osl:object name="ZREPORT" type="PROG/P"/>');
      expect(sent).toContain('title="Nightly"');
      expect(sent).toContain('context="Suite"');
      expect(sent).toContain(
        '<aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>',
      );
      expect(JSON.parse(textOf(result))).toEqual({
        success: true,
        run_id: RUN,
      });
    },
  );

  it.each([
    [true, 'true'],
    [false, 'false'],
  ])(
    'a package target with include_subpackages %s goes as an osl:packageSet',
    async (include, attribute) => {
      const { connection, result } = await start({
        target: {
          kind: 'package',
          name: '$zpkg',
          include_subpackages: include,
        },
      });

      expect(result.isError).toBe(false);
      expect(connection.requests.map(line)).toEqual([
        'POST /sap/bc/adt/abapunit/runs',
      ]);
      const sent = body(connection.requests[0]);
      expect(sent).toContain('<osl:objectSet xsi:type="osl:packageSet">');
      expect(sent).toContain(
        `<osl:package name="$ZPKG" includeSubpackages="${attribute}"/>`,
      );
      expect(sent).not.toContain('osl:object ');
      expect(JSON.parse(textOf(result))).toEqual({
        success: true,
        run_id: RUN,
      });
    },
  );

  it("a CDS view's assigned tests run as DDLS/DF with foreign_tests, the risk levels and durations as given", async () => {
    const { connection, result } = await start({
      target: { kind: 'object', name: 'zi_view', type: 'DDLS/DF' },
      scope: { foreign_tests: true },
      risk_level: { harmless: true, dangerous: false, critical: false },
      duration: { short: true, medium: false, long: false },
    });

    expect(result.isError).toBe(false);
    const sent = body(connection.requests[0]);
    expect(sent).toContain('<osl:object name="ZI_VIEW" type="DDLS/DF"/>');
    expect(sent).toContain(
      '<aunit:scope ownTests="true" foreignTests="true" addForeignTestsAsPreview="true"/>',
    );
    expect(sent).toContain(
      '<aunit:riskLevel harmless="true" dangerous="false" critical="false"/>',
    );
    expect(sent).toContain(
      '<aunit:duration short="true" medium="false" long="false"/>',
    );
  });
});

describe('HandlerUnitTestRun: refused before anything is sent', () => {
  const refusals: Array<[string, Args, string]> = [
    [
      'both tests and target',
      {
        tests: [{ container_class: 'zcl_a', test_class: 'ltc_a' }],
        target: { kind: 'object', name: 'zcl_a', type: 'CLAS/OC' },
      },
      'exactly one of tests and target is required',
    ],
    [
      'neither tests nor target',
      {},
      'exactly one of tests and target is required',
    ],
    [
      'a target type outside the run registry',
      { target: { kind: 'object', name: 'zcl_a', type: 'ZZZZ/ZZ' } },
      'target.type "ZZZZ/ZZ" is not one of: CLAS, CLAS/OC',
    ],
    [
      'a target with runner sync',
      {
        target: { kind: 'object', name: 'zcl_a', type: 'CLAS/OC' },
        runner: 'sync',
      },
      'runner sync takes tests only: a target run is asynchronous',
    ],
  ];
  it.each(refusals)('%s', async (_case, args, words) => {
    const { connection, result } = await start(args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(words);
    expect(textOf(result)).toContain('nothing was sent');
    expect(connection.requests).toEqual([]);
  });
});

describe("HandlerUnitTestRun's schema", () => {
  it("takes target as RunAbapUnit's own schema piece, not a copy", () => {
    expect(compactUnitTestRunSchema.properties.target).toBe(
      RUN_ABAP_UNIT.inputSchema.properties.target,
    );
  });

  it('requires neither tests nor target by schema: the handler takes exactly one', () => {
    expect(Object.hasOwn(compactUnitTestRunSchema, 'required')).toBe(false);
  });
});
