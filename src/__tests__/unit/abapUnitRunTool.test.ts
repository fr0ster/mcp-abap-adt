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

import { ABAP_UNIT_RUN_TYPES } from '@mcp-abap-adt/interfaces-adt';
import {
  handleRunAbapUnit,
  TOOL_DEFINITION,
} from '../../handlers/unit_test/high/handleRunAbapUnit';
import { corpusBody } from '../../lib/adtCorpus';
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
      target: { kind: 'object', name: 'zcl_x', type: 'clas/oc' },
    });

    expect(result.isError).toBe(false);
    expect(connection.requests.map(line)).toEqual([
      'POST /sap/bc/adt/abapunit/runs',
      `GET /sap/bc/adt/abapunit/runs/${RUN}`,
      `GET /sap/bc/adt/abapunit/results/${RUN}`,
    ]);
    const sent = body(connection.requests[0]);
    expect(sent).toContain('<osl:objectSet xsi:type="osl:flatObjectSet">');
    expect(sent).toContain('<osl:object name="ZCL_X" type="CLAS/OC"/>');
    expect(sent).toContain(
      '<aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>',
    );
    const answer = JSON.parse(textOf(result));
    expect(answer.finished).toBe(true);
    expect(answer.run_id).toBe(RUN);
    expect(JSON.stringify(answer.run_result)).toContain('TEST_METHOD');
  });

  it.each([
    [true, 'true'],
    [false, 'false'],
  ])(
    'a package target with include_subpackages %s goes as an osl:packageSet',
    async (include, attribute) => {
      const { connection, result } = await run({
        target: {
          kind: 'package',
          name: '$zpkg',
          include_subpackages: include,
        },
      });

      expect(result.isError).toBe(false);
      expect(connection.requests.map(line)[0]).toBe(
        'POST /sap/bc/adt/abapunit/runs',
      );
      const sent = body(connection.requests[0]);
      expect(sent).toContain('<osl:objectSet xsi:type="osl:packageSet">');
      expect(sent).toContain(
        `<osl:package name="$ZPKG" includeSubpackages="${attribute}"/>`,
      );
      expect(sent).not.toContain('osl:object ');
    },
  );

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

    expect(result.isError).toBe(false);
    const sent = body(connection.requests[0]);
    expect(sent).toContain('<osl:object name="ZI_VIEW" type="DDLS/DF"/>');
    expect(sent).toContain(
      '<aunit:scope ownTests="false" foreignTests="true" addForeignTestsAsPreview="false"/>',
    );
    expect(sent).toContain(
      '<aunit:riskLevel harmless="true" dangerous="false" critical="false"/>',
    );
    expect(sent).toContain(
      '<aunit:duration short="true" medium="false" long="false"/>',
    );
  });
});

describe('RunAbapUnit: refused before anything is sent', () => {
  it.each([
    [
      'a type outside the run registry',
      { kind: 'object', name: 'ZCL_X', type: 'DEVC' },
      'target.type "DEVC" is not one of: CLAS, CLAS/OC',
    ],
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
    [
      'an unknown kind',
      { kind: 'class', name: 'ZCL_X', type: 'CLAS' },
      'target.kind "class" is not one of: object, package',
    ],
    ['no name', { kind: 'object', type: 'CLAS' }, 'target.name is required'],
    ['no target', undefined, 'target is required'],
  ])('%s', async (_case, target, words) => {
    const connection = recordingConnection([STARTED, FINISHED, RESULT]);

    const result = await handleRunAbapUnit({ connection }, { target });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(words);
    expect(textOf(result)).toContain('nothing was sent');
    expect(connection.requests).toEqual([]);
  });
});

it.each([
  [
    'scope',
    { foreign_tests: 'yes' },
    'scope.foreign_tests must be true or false',
  ],
  ['risk_level', { critical: 1 }, 'risk_level.critical must be true or false'],
  ['duration', 'long', 'duration must be an object'],
])(
  'a %s flag that is not a boolean is refused before anything is sent',
  async (field, value, words) => {
    const connection = recordingConnection([STARTED, FINISHED, RESULT]);

    const result = await handleRunAbapUnit(
      { connection },
      {
        target: { kind: 'object', name: 'ZCL_X', type: 'CLAS' },
        [field]: value,
      },
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(words);
    expect(connection.requests).toEqual([]);
  },
);

describe('RunAbapUnit: the schema', () => {
  it("target.type's enum is the keys of ABAP_UNIT_RUN_TYPES, in their order", () => {
    expect(
      TOOL_DEFINITION.inputSchema.properties.target.properties.type.enum,
    ).toEqual(Object.keys(ABAP_UNIT_RUN_TYPES));
  });

  it("target.kind's enum is the run target's kinds", () => {
    expect(
      TOOL_DEFINITION.inputSchema.properties.target.properties.kind.enum,
    ).toEqual(['object', 'package']);
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
    expect(placement).toEqual(expected);
  });

  it('carries no [read-only] marker', () => {
    expect(TOOL_DEFINITION.description.startsWith('[read-only]')).toBe(false);
  });
});
