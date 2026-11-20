/**
 * RunAbapUnit against the real adt-clients over a recording connection: what
 * each run target sends on the wire, that a type outside the run registry is
 * refused before anything is sent, and that the schema's `type` enum is the
 * registry's keys.
 *
 * The runs answer the captured corpus documents of a passing class run
 * (`unittest-run-passing--*`); the run is the same resource whichever target
 * started it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { ABAP_UNIT_RUN_TYPES } from '@mcp-abap-adt/interfaces-adt';
import {
  handleRunAbapUnit,
  TOOL_DEFINITION,
} from '../../handlers/unit_test/high/handleRunAbapUnit';
import { defineTool } from '../../lib/handlers/interfaces';
import { corpusBody } from '../helpers/adtCorpus';
import { assertRejects } from '../helpers/assertions';
import { jsonAt, listedJson } from '../helpers/listedJson';
import {
  type RecordedRequest,
  recordingConnection,
} from '../helpers/recordingConnection';
import {
  SETS,
  SYSTEM_TYPES,
  servedCatalog,
  TRANSPORTS,
} from './descriptions/catalog';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const RUN = 'FA53C505DD7B1FD1ABB8599833A05D44';
const STARTED = {
  status: 201,
  headers: { location: `/sap/bc/adt/abapunit/runs/${RUN}` },
};
const FINISHED = {
  data: corpusBody(`unittest-run-passing--02-runs-${RUN.toLowerCase()}`),
};
const RESULT = {
  data: corpusBody(`unittest-run-passing--03-results-${RUN.toLowerCase()}`),
};

const line = (r: RecordedRequest) => `${r.method} ${r.url.split('?')[0]}`;
const body = (r: RecordedRequest | undefined) => String(r?.data);
const textOf = (result: { content: ReadonlyArray<{ text: string }> }) =>
  result.content[0]?.text ?? '';

async function run(args: Parameters<typeof handleRunAbapUnit>[1]) {
  const connection = recordingConnection([STARTED, FINISHED, RESULT]);
  const result = await handleRunAbapUnit({ connection }, args);
  return { connection, result };
}

describe('RunAbapUnit: a run by target, on the wire', () => {
  it('an object target goes as an osl:flatObjectSet with one osl:object, then polls and answers the result', async () => {
    const { connection, result } = await run({
      target: { kind: 'object', name: 'zcl_x', type: 'CLAS/OC' },
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(connection.requests.map(line), [
      'POST /sap/bc/adt/abapunit/runs',
      `GET /sap/bc/adt/abapunit/runs/${RUN}`,
      `GET /sap/bc/adt/abapunit/results/${RUN}`,
    ]);
    const sent = body(connection.requests[0]);
    assert.ok(sent.includes('<osl:objectSet xsi:type="osl:flatObjectSet">'));
    assert.ok(sent.includes('<osl:object name="ZCL_X" type="CLAS/OC"/>'));
    assert.ok(
      sent.includes(
        '<aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>',
      ),
    );
    const answer = JSON.parse(textOf(result));
    assert.equal(answer.finished, true);
    assert.equal(answer.run_id, RUN);
    assert.ok(JSON.stringify(answer.run_result).includes('TEST_METHOD'));
  });

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
        const { connection, result } = await run({
          target: {
            kind: 'package',
            name: '$zpkg',
            include_subpackages: include,
          },
        });

        assert.equal(result.isError, false);
        assert.equal(
          connection.requests.map(line)[0],
          'POST /sap/bc/adt/abapunit/runs',
        );
        const sent = body(connection.requests[0]);
        assert.ok(sent.includes('<osl:objectSet xsi:type="osl:packageSet">'));
        assert.ok(
          sent.includes(
            `<osl:package name="$ZPKG" includeSubpackages="${attribute}"/>`,
          ),
        );
        assert.ok(!sent.includes('osl:object '));
      },
    );
  }

  it("a CDS view's assigned tests run as DDLS/DF with foreignTests, the scope, risk levels and durations as given", async () => {
    const { connection, result } = await run({
      target: { kind: 'object', name: 'zi_view', type: 'DDLS/DF' },
      scope: {
        own_tests: false,
        foreign_tests: true,
        add_foreign_tests_as_preview: false,
      },
      risk_level: { harmless: true, dangerous: false, critical: false },
      duration: { short: true, medium: false, long: false },
    });

    assert.equal(result.isError, false);
    const sent = body(connection.requests[0]);
    assert.ok(sent.includes('<osl:object name="ZI_VIEW" type="DDLS/DF"/>'));
    assert.ok(
      sent.includes(
        '<aunit:scope ownTests="false" foreignTests="true" addForeignTestsAsPreview="false"/>',
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

describe('RunAbapUnit: refused before anything is sent', () => {
  for (const [_case, target, words] of [
    [
      'an object without its type',
      { kind: 'object', name: 'ZCL_X' },
      'target.type is required for kind object',
    ],
    [
      'a package without include_subpackages',
      { kind: 'package', name: '$ZPKG' },
      'target.include_subpackages (true or false) is required for kind package',
    ],
    [
      'a package with a type',
      {
        kind: 'package',
        name: '$ZPKG',
        include_subpackages: true,
        type: 'CLAS',
      },
      'target.type is read for kind object only',
    ],
    [
      'an object with include_subpackages',
      {
        kind: 'object',
        name: 'ZCL_X',
        type: 'CLAS',
        include_subpackages: true,
      },
      'target.include_subpackages is read for kind package only',
    ],
  ] as const) {
    it(format('%s', _case), async () => {
      const connection = recordingConnection([STARTED, FINISHED, RESULT]);

      const result = await handleRunAbapUnit({ connection }, { target });

      assert.equal(result.isError, true);
      assert.ok(textOf(result).includes(words));
      assert.ok(textOf(result).includes('nothing was sent'));
      assert.deepStrictEqual(connection.requests, []);
    });
  }

  /**
   * The model's call names its target through the tool's schema: a value
   * the schema does not take is refused there, naming the argument, before
   * the handler runs, and nothing is sent.
   */
  for (const [_case, given, path] of [
    [
      'a type outside the run registry',
      { target: { kind: 'object', name: 'ZCL_X', type: 'DEVC' } },
      'target.type',
    ],
    [
      'an unknown kind',
      { target: { kind: 'class', name: 'ZCL_X', type: 'CLAS' } },
      'target.kind',
    ],
    ['no name', { target: { kind: 'object', type: 'CLAS' } }, 'target.name'],
    ['no target', {}, 'target'],
    [
      'a scope flag that is not a boolean',
      {
        target: { kind: 'object', name: 'ZCL_X', type: 'CLAS' },
        scope: { foreign_tests: 'yes' },
      },
      'scope.foreign_tests',
    ],
    [
      'a risk level flag that is not a boolean',
      {
        target: { kind: 'object', name: 'ZCL_X', type: 'CLAS' },
        risk_level: { critical: 1 },
      },
      'risk_level.critical',
    ],
    [
      'a duration that is not an object',
      {
        target: { kind: 'object', name: 'ZCL_X', type: 'CLAS' },
        duration: 'long',
      },
      'duration',
    ],
  ] satisfies Array<[string, Record<string, unknown>, string]>) {
    it(format('%s: refused at the schema, nothing sent', _case), async () => {
      const connection = recordingConnection([STARTED, FINISHED, RESULT]);
      const refused = assertRejects(
        defineTool(TOOL_DEFINITION, handleRunAbapUnit).call(
          { connection },
          given,
        ),
        `at ${path}`,
      );
      await refused;
      assert.deepStrictEqual(connection.requests, []);
    });
  }
});

describe('RunAbapUnit: the schema', () => {
  it("target.type's enum is the keys of ABAP_UNIT_RUN_TYPES, in their order", () => {
    assert.deepStrictEqual(
      jsonAt(listedJson(TOOL_DEFINITION.inputSchema), 'target', 'type').enum,
      Object.keys(ABAP_UNIT_RUN_TYPES),
    );
  });

  it("target.kind's enum is the run target's kinds", () => {
    assert.deepStrictEqual(
      jsonAt(listedJson(TOOL_DEFINITION.inputSchema), 'target', 'kind').enum,
      ['object', 'package'],
    );
  });
});

describe('RunAbapUnit: where it is served', () => {
  // A test run executes code that can change data in the system: the tool is
  // served where RunUnitTest and its siblings are, and by no read-only set.
  it('is served exactly where RunUnitTest is: the full set, on every transport, on premise and cloud', async () => {
    const placement: string[] = [];
    for (const [kind, set] of SETS) {
      for (const transport of TRANSPORTS) {
        for (const systemType of SYSTEM_TYPES) {
          const names = (await servedCatalog(set, transport, systemType)).map(
            (tool) => tool.name,
          );
          const served = ['RunUnitTest', 'RunAbapUnit'].map((name) =>
            names.includes(name),
          );
          placement.push(`${kind}/${transport}/${systemType}: ${served}`);
        }
      }
    }
    const expected: string[] = [];
    for (const [kind] of SETS) {
      for (const transport of TRANSPORTS) {
        for (const systemType of SYSTEM_TYPES) {
          const served = kind === 'core' && systemType !== 'legacy';
          expected.push(
            `${kind}/${transport}/${systemType}: ${[served, served]}`,
          );
        }
      }
    }
    assert.deepStrictEqual(placement, expected);
  });

  it('carries no [read-only] marker', () => {
    assert.equal(TOOL_DEFINITION.description.startsWith('[read-only]'), false);
  });
});
