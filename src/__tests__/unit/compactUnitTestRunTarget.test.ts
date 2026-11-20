/**
 * Compact HandlerUnitTestRun with a run target, against the real adt-clients
 * over a recording connection: the target goes through the generic runner as
 * RunAbapUnit's does (the same schema piece, the same mapping), the run is
 * started and answered with its id, and exactly one of tests and target is
 * taken — a refusal sends nothing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  TOOL_DEFINITION as HandlerUnitTestRun,
  handleHandlerUnitTestRun,
} from '../../../compact-modify/src/handlers/handleHandlerUnitTestRun';
import { TOOL_DEFINITION as RUN_ABAP_UNIT } from '../../handlers/unit_test/high/handleRunAbapUnit';
import {
  RUN_TARGET_FIELD,
  RUN_TARGET_OPTIONAL,
} from '../../handlers/unit_test/shared/runTarget';
import { compactUnitTestRunSchema } from '../../lib/compact/compactSchemas';
import { defineTool } from '../../lib/handlers/interfaces';
import { assertRejects } from '../helpers/assertions';
import { declaredRequired, jsonAt, listedJson } from '../helpers/listedJson';
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
  for (const [_case, extra] of runners) {
    it(
      format(
        '%s: an object target (PROG/P) goes as an osl:flatObjectSet with one osl:object',
        _case,
      ),
      async () => {
        const { connection, result } = await start({
          target: { kind: 'object', name: 'zreport', type: 'PROG/P' },
          title: 'Nightly',
          context: 'Suite',
          ...extra,
        });

        assert.equal(result.isError, false);
        assert.deepStrictEqual(connection.requests.map(line), [
          'POST /sap/bc/adt/abapunit/runs',
        ]);
        const sent = body(connection.requests[0]);
        assert.ok(
          sent.includes('<osl:objectSet xsi:type="osl:flatObjectSet">'),
        );
        assert.ok(sent.includes('<osl:object name="ZREPORT" type="PROG/P"/>'));
        assert.ok(sent.includes('title="Nightly"'));
        assert.ok(sent.includes('context="Suite"'));
        assert.ok(
          sent.includes(
            '<aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>',
          ),
        );
        assert.deepStrictEqual(JSON.parse(textOf(result)), {
          success: true,
          run_id: RUN,
        });
      },
    );
  }

  for (const [include, attribute] of [
    [true, 'true'],
    [false, 'false'],
  ] satisfies Array<[boolean, string]>) {
    it(
      format(
        'a package target with include_subpackages %s goes as an osl:packageSet',
        include,
      ),
      async () => {
        const { connection, result } = await start({
          target: {
            kind: 'package',
            name: '$zpkg',
            include_subpackages: include,
          },
        });

        assert.equal(result.isError, false);
        assert.deepStrictEqual(connection.requests.map(line), [
          'POST /sap/bc/adt/abapunit/runs',
        ]);
        const sent = body(connection.requests[0]);
        assert.ok(sent.includes('<osl:objectSet xsi:type="osl:packageSet">'));
        assert.ok(
          sent.includes(
            `<osl:package name="$ZPKG" includeSubpackages="${attribute}"/>`,
          ),
        );
        assert.ok(!sent.includes('osl:object '));
        assert.deepStrictEqual(JSON.parse(textOf(result)), {
          success: true,
          run_id: RUN,
        });
      },
    );
  }

  it("a CDS view's assigned tests run as DDLS/DF with foreign_tests, the risk levels and durations as given", async () => {
    const { connection, result } = await start({
      target: { kind: 'object', name: 'zi_view', type: 'DDLS/DF' },
      scope: { foreign_tests: true },
      risk_level: { harmless: true, dangerous: false, critical: false },
      duration: { short: true, medium: false, long: false },
    });

    assert.equal(result.isError, false);
    const sent = body(connection.requests[0]);
    assert.ok(sent.includes('<osl:object name="ZI_VIEW" type="DDLS/DF"/>'));
    assert.ok(
      sent.includes(
        '<aunit:scope ownTests="true" foreignTests="true" addForeignTestsAsPreview="true"/>',
      ),
    );
    assert.ok(
      sent.includes(
        '<aunit:riskLevel harmless="true" dangerous="false" critical="false"/>',
      ),
    );
    assert.ok(
      sent.includes(
        '<aunit:duration short="true" medium="false" long="false"/>',
      ),
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
      'a target with runner sync',
      {
        target: { kind: 'object', name: 'zcl_a', type: 'CLAS/OC' },
        runner: 'sync',
      },
      'runner sync takes tests only: a target run is asynchronous',
    ],
  ];
  it('a target type outside the run registry: refused by the schema, nothing sent', async () => {
    const connection = recordingConnection([STARTED]);
    const refused = assertRejects(
      defineTool(HandlerUnitTestRun, handleHandlerUnitTestRun).call(
        { connection },
        { target: { kind: 'object', name: 'zcl_a', type: 'ZZZZ/ZZ' } },
      ),
      'Invalid arguments for tool HandlerUnitTestRun: Invalid option',
    );
    await refused;
    assert.deepStrictEqual(connection.requests, []);
  });

  for (const [_case, args, words] of refusals) {
    it(format('%s', _case), async () => {
      const { connection, result } = await start(args);

      assert.equal(result.isError, true);
      assert.ok(textOf(result).includes(words));
      assert.ok(textOf(result).includes('nothing was sent'));
      assert.deepStrictEqual(connection.requests, []);
    });
  }
});

describe("HandlerUnitTestRun's schema", () => {
  it("takes target as RunAbapUnit's own schema piece: the same fields and words", () => {
    assert.equal(compactUnitTestRunSchema.shape.target, RUN_TARGET_OPTIONAL);
    assert.equal(RUN_ABAP_UNIT.inputSchema.shape.target, RUN_TARGET_FIELD);
    assert.deepStrictEqual(
      jsonAt(listedJson(compactUnitTestRunSchema), 'target'),
      jsonAt(listedJson(RUN_ABAP_UNIT.inputSchema), 'target'),
    );
  });

  it('requires neither tests nor target by schema: the handler takes exactly one', () => {
    assert.deepStrictEqual(declaredRequired(compactUnitTestRunSchema), []);
  });
});
