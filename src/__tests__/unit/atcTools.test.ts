/**
 * The three ATC tools, and the two things about them that are this
 * repository's own work rather than the client's.
 *
 * **The composite.** `AdtAtc` stopped being `IAdtRunnable` in 19.0.0 because
 * a run is three calls — the variant, a worklist, the run — and the client
 * refuses to choose the order. `RunATC` chooses it. Since adt-clients 23 all
 * three answer `IAdtResponse` — the variant and the worklist used to throw on
 * SAP's refusal — so a refusal is the answer as it came, and only a fault of
 * this process is a throw.
 *
 * **The reading.** `getFindings()` answers the worklist as ADT sent it, and
 * what a caller needs out of 18 KB is six lines. The parse is tested against
 * the captured document, not a handmade one.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { mockModuleExports } from '../helpers/moduleMock';

// adt-clients replaced for this file before any module under test loads: the
// handlers and src/lib/clients bind it when they load (node:test mock.module,
// helpers/moduleMock.ts; its other exports stay the real ones).
const AdtRuntimeClientMock = mock.fn<(...args: any[]) => any>(
  function AdtRuntimeClient() {
    return {
      getAtc: () => atc,
    };
  },
);
mockModuleExports(require.resolve('@mcp-abap-adt/adt-clients'), {
  AdtRuntimeClient: AdtRuntimeClientMock,
});

import { handleGetATCFindings } from '../../handlers/atc/high/handleGetATCFindings';
import { handleGetATCResult } from '../../handlers/atc/high/handleGetATCResult';
import { handleGetATCRunStatus } from '../../handlers/atc/high/handleGetATCRunStatus';
import {
  handleRunATC,
  TOOL_DEFINITION,
} from '../../handlers/atc/high/handleRunATC';
import { ATC_OBJECT_TYPES } from '../../lib/adtProjections';
import { defineTool } from '../../lib/handlers/interfaces';
import {
  findingsText,
  parseAtcWorklist,
} from '../../lib/strategies/atcFindings';
import { declareSystemKind } from '../../lib/systemKind';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject } from '../helpers/assertions';
import { okResponse, refusedResponse } from '../helpers/fakeClient';
import { jsonAt, listedJson } from '../helpers/listedJson';
import { recordingConnection } from '../helpers/recordingConnection';

const WORKLIST = corpusBody(
  'atc-findings-worklist--01-worklists-2aaa2806861e1fd1ad9bd28dca5c37ed',
);

let atc: Record<string, unknown>;

const context = { connection: {} as any, logger: undefined };
// RunATC reads its object types from the declared variant.
declareSystemKind(context.connection, 'onprem');
const payload = (result: any) => JSON.parse(result.content[0].text);

/** A table row as its title shows it (an
 * object's keys sorted, strings quoted; a number as itself). */
function pretty(value: unknown): string {
  if (typeof value !== 'object' || value === null) return String(value);
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`;
}

describe('the ATC worklist reading, against the captured document', () => {
  it('finds every finding and nothing else', () => {
    const reading = parseAtcWorklist(WORKLIST);

    // Measured on the trial system, 2026-09-20: one run over ZMCP_SHR_PKG.
    assert.equal(reading.findings.length, 6);
    assert.equal(reading.objects_checked, 21);
    assert.deepStrictEqual(reading.by_priority, { '2': 4, '3': 2 });
  });

  it('keeps the object beside what was found in it', () => {
    const finding = parseAtcWorklist(WORKLIST).findings[0];

    assert.equal(finding.check, 'Extended Program Check (SLIN)');
    assert.ok(
      finding.message !== undefined &&
        finding.message.includes('Strings without text elements'),
    );
    assert.equal(finding.priority, 3);
    // The position is the finding's own: a function module's finding points
    // at the include, not at the object the run was asked about.
    assert.ok(
      finding.location !== undefined && finding.location.includes('/fmodules/'),
    );
    assert.equal(finding.line, 9);
    assert.equal(finding.object_type, 'FUGR');
  });

  /**
   * The prefix is the document author's to choose, not ours to depend on.
   *
   * This read the worklist with regular expressions over literal
   * `atcobject:`/`atcfinding:`/`adtcore:` until review pointed out that a
   * document binding the same namespaces under different prefixes would have
   * answered nothing at all — and nothing reads exactly like a clean check.
   */
  it('reads the same document under different namespace prefixes', () => {
    const renamed = WORKLIST.replace(/atcworklist:/g, 'w:')
      .replace(/atcobject:/g, 'o:')
      .replace(/atcfinding:/g, 'f:')
      .replace(/adtcore:/g, 'c:')
      .replace(/xmlns:w=/g, 'xmlns:w=')
      .replace(/xmlns:o=/g, 'xmlns:o=')
      .replace(/xmlns:f=/g, 'xmlns:f=')
      .replace(/xmlns:c=/g, 'xmlns:c=');

    assert.deepStrictEqual(
      parseAtcWorklist(renamed),
      parseAtcWorklist(WORKLIST),
    );
  });

  it('decodes what the document escaped', () => {
    // A check message is free text and carries whatever the checker wrote;
    // an ampersand reaches the wire as an entity, and a caller handed
    // `&amp;` back has been given the escape rather than the message.
    const escaped =
      '<atcworklist:worklist><atcworklist:objects><atcobject:object adtcore:name="ZCL_X" adtcore:type="CLAS"><atcobject:findings><atcfinding:finding atcfinding:priority="2" atcfinding:checkTitle="Check &amp; Verify" atcfinding:messageTitle="&quot;A&quot; &lt; &quot;B&quot; &amp; more"/></atcobject:findings></atcobject:object></atcworklist:objects></atcworklist:worklist>';

    const [finding] = parseAtcWorklist(escaped).findings;
    assert.equal(finding.check, 'Check & Verify');
    assert.equal(finding.message, '"A" < "B" & more');
  });

  it('answers an empty reading for a document with no findings', () => {
    // The shape a clean object answers: `<atcobject:findings/>`, self-closing.
    const clean =
      '<atcworklist:worklist><atcworklist:objects><atcobject:object adtcore:name="ZCL_X" adtcore:type="CLAS"><atcobject:findings/></atcobject:object></atcworklist:objects></atcworklist:worklist>';
    assert.deepStrictEqual(parseAtcWorklist(clean), {
      findings: [],
      objects_checked: 1,
      by_priority: {},
    });
  });
});

describe('the fields detail=full adds, from the captured document', () => {
  it('reads the column, the check and message ids, the documentation, the exemption and the quick fixes', () => {
    const finding = parseAtcWorklist(WORKLIST).findings[0];

    // `#start=9,0`: the line and the column beside it.
    assert.equal(finding.line, 9);
    assert.equal(finding.column, 0);
    assert.equal(finding.check_id, 'F8607CD40A0F8B30BDF8590205B306E8');
    assert.equal(finding.check_class, 'CL_CI_TEST_EXTENDED_CHECK');
    assert.equal(finding.message_id, '1713');
    assert.equal(
      finding.documentation_uri,
      '/sap/bc/adt/documentation/atc/documents/itemid/E2882D9BE21A1FD1AD9BCCF1C1A64EB9/index/1426',
    );
    // As the document carries them: `-` for the approval, an empty kind
    // left out.
    assert.equal(finding.exemption_approval, '-');
    assert.equal(finding.exemption_kind, undefined);
    assert.deepStrictEqual(finding.quickfixes, {
      manual: false,
      automatic: false,
      pseudo: false,
      ai_based: false,
      ai_enabled: false,
    });
  });

  it('reads a quick fix flag set to true as true', () => {
    const doc = WORKLIST.replace(
      'atcfinding:manual="false"',
      'atcfinding:manual="true"',
    );
    assert.equal(parseAtcWorklist(doc).findings[0].quickfixes?.manual, true);
  });

  it('answers the fields under full, and terse as before', async () => {
    atc = { getFindings: async () => okResponse(WORKLIST) };
    const terse: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
    });
    // Terse is TSV (Codex round 7): a row per finding, line and column in it.
    assert.ok(
      terse.content[0].text
        .split('\n')
        .includes(
          'object\tobject_type\tlocation\tline\tcolumn\tpriority\tcheck\tmessage',
        ),
      terse.content[0].text,
    );

    atc = { getFindings: async () => okResponse(WORKLIST) };
    const full: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
      detail: 'full',
    });
    assertMatchObject(payload(full).findings[0], {
      line: 9,
      column: 0,
      check_id: 'F8607CD40A0F8B30BDF8590205B306E8',
      check_class: 'CL_CI_TEST_EXTENDED_CHECK',
      message_id: '1713',
      documentation_uri:
        '/sap/bc/adt/documentation/atc/documents/itemid/E2882D9BE21A1FD1AD9BCCF1C1A64EB9/index/1426',
      exemption_approval: '-',
      quickfixes: { manual: false, automatic: false },
    });
    assert.equal(payload(full).finding_count, 6);
  });
});

describe('the source position, in the fragment shapes ADT records', () => {
  const at = (location: string) => {
    const doc = `<atcworklist:worklist><atcworklist:objects><atcobject:object adtcore:name="ZCL_X" adtcore:type="CLAS"><atcobject:findings><atcfinding:finding atcfinding:priority="1" atcfinding:location="${location}"/></atcobject:findings></atcobject:object></atcworklist:objects></atcworklist:worklist>`;
    const [finding] = parseAtcWorklist(doc).findings;
    return {
      location: finding.location,
      line: finding.line,
      column: finding.column,
    };
  };

  it('reads #start=LINE,COLUMN', () => {
    assert.deepStrictEqual(
      at('/sap/bc/adt/oo/classes/zcl_x/source/main#start=9,4'),
      {
        location: '/sap/bc/adt/oo/classes/zcl_x/source/main',
        line: 9,
        column: 4,
      },
    );
  });

  // The unit-test fixtures' shape: `;`-separated, start then end.
  it('reads #start=LINE,COLUMN;end=LINE,COLUMN', () => {
    assert.deepStrictEqual(
      at('/sap/bc/adt/oo/classes/zcl_x/source/main#start=8,3;end=8,0'),
      {
        location: '/sap/bc/adt/oo/classes/zcl_x/source/main',
        line: 8,
        column: 3,
      },
    );
  });

  // The debugger fixtures' shape: other parts first, a line with no column.
  it('reads #type=…;name=…;start=LINE', () => {
    assert.deepStrictEqual(
      at(
        '/sap/bc/adt/oo/classes/zcl_x/source/main#type=CLAS%2FOM;name=POST;start=29',
      ),
      {
        location: '/sap/bc/adt/oo/classes/zcl_x/source/main',
        line: 29,
        column: undefined,
      },
    );
  });
});

describe('RunATC composes the three calls', () => {
  it('resolves the variant, makes a worklist, runs, and names all three', async () => {
    const calls: string[] = [];
    atc = {
      resolveCheckVariant: async () => {
        calls.push('variant');
        return okResponse('ABAP_CLOUD_DEVELOPMENT_DEFAULT');
      },
      createWorklist: async (variant: string) => {
        calls.push(`worklist:${variant}`);
        return okResponse('WL1');
      },
      startRun: async (worklistId: string, target: any, options: any) => {
        calls.push(
          `run:${worklistId}:${options.wait}:${options.maximumVerdicts}`,
        );
        assert.deepStrictEqual(target.objects, [
          { objectName: 'ZCL_X', objectType: 'class' },
        ]);
        return okResponse({ waited: false, worklistId, runId: 'RUN1' });
      },
    };

    const result: any = await handleRunATC(context as any, {
      objects: [{ name: 'zcl_x', type: 'class' }],
    });

    assert.deepStrictEqual(calls, [
      'variant',
      'worklist:ABAP_CLOUD_DEVELOPMENT_DEFAULT',
      'run:WL1:false:100',
    ]);
    assert.equal(result.isError, false);
    assertMatchObject(payload(result), {
      check_variant: 'ABAP_CLOUD_DEVELOPMENT_DEFAULT',
      worklist_id: 'WL1',
      waited: false,
      run_id: 'RUN1',
    });
  });

  it('does not ask for a variant when it was given one', async () => {
    const asked = mock.fn();
    atc = {
      resolveCheckVariant: asked,
      createWorklist: async () => okResponse('WL1'),
      startRun: async (worklistId: string) =>
        okResponse({ waited: true, worklistId, findingStats: '0,4,2' }),
    };

    const result: any = await handleRunATC(context as any, {
      objects: [{ name: 'ZCL_X', type: 'class' }],
      check_variant: 'MY_VARIANT',
      wait: true,
    });

    assert.equal(asked.mock.callCount(), 0);
    // A run that waited has no run to poll, and the counts arrive instead.
    assertMatchObject(payload(result), {
      waited: true,
      finding_stats: '0,4,2',
      worklist_id: 'WL1',
    });
    assert.equal(payload(result).run_id, undefined);
  });

  it("reports SAP's refusal as a refusal", async () => {
    // adt-clients 23: the refusal is the answer, `ok: false`, not a throw.
    atc = {
      resolveCheckVariant: async () =>
        refusedResponse('Not authorized for ATC', { origin: 'refusal' }),
    };

    const result: any = await handleRunATC(context as any, {
      objects: [{ name: 'ZCL_X', type: 'class' }],
    });

    assert.equal(result.isError, true);
    assert.equal(payload(result).origin, 'refusal');
    assert.ok(payload(result).message.includes('Not authorized for ATC'));
  });

  it('lets a fault of its own stay a throw', async () => {
    const boom = new TypeError('cannot read properties of undefined');
    atc = {
      resolveCheckVariant: async () => {
        throw boom;
      },
    };

    const result: any = await handleRunATC(context as any, {
      objects: [{ name: 'ZCL_X', type: 'class' }],
    });

    assert.equal(result.isError, true);
    assert.equal(payload(result).error, 'client_threw');
  });

  for (const max_findings of [0, -1, 2.5, Number.NaN]) {
    it(`refuses max_findings ${pretty(max_findings)} before making any call`, async () => {
      // The client throws on these too, but a throw is rendered
      // `client_threw` — this process blamed for an argument the caller can
      // fix. Named here instead.
      atc = {
        resolveCheckVariant: async () => {
          throw new Error('should not be called');
        },
      };
      const result: any = await handleRunATC(context as any, {
        objects: [{ name: 'ZCL_X', type: 'class' }],
        max_findings,
      });
      assert.equal(result.isError, true);
      // `return_error` answers text, not the JSON envelope `answer()` builds:
      // this refusal is raised before any call, so there is no ADT answer to
      // shape.
      assert.ok(String(result.content[0].text).includes('max_findings'));
    });
  }

  it('refuses an empty object list before making any call', async () => {
    atc = {
      resolveCheckVariant: async () => {
        throw new Error('should not be called');
      },
    };
    const result: any = await handleRunATC(context as any, { objects: [] });
    assert.equal(result.isError, true);
  });
});

describe('RunATC: the object kinds the client checks', () => {
  const objectSchema = (name: string) =>
    jsonAt(listedJson(TOOL_DEFINITION.inputSchema), 'objects', '[]', name);

  it('offers every kind the client builds a URI for', () => {
    assert.deepStrictEqual(
      [...(objectSchema('type').enum ?? [])].sort(),
      [
        'behavior_definition',
        'class',
        'class_include',
        'ddl_source',
        'function_group',
        'function_include',
        'interface',
        'package',
        'program',
        'program_include',
        'table',
      ].sort(),
    );
    assert.deepStrictEqual(
      [...(objectSchema('include_kind').enum ?? [])].sort(),
      ['definitions', 'implementations', 'macros', 'testclasses'].sort(),
    );
    assert.equal(objectSchema('function_group').type, 'string');
  });

  const capture = () => {
    const seen: { target?: any } = {};
    atc = {
      createWorklist: async () => okResponse('WL1'),
      startRun: async (worklistId: string, target: any) => {
        seen.target = target;
        return okResponse({ waited: false, worklistId, runId: 'RUN1' });
      },
    };
    return seen;
  };

  it('passes a program and a program include by name', async () => {
    const seen = capture();
    const result: any = await handleRunATC(context as any, {
      objects: [
        { name: 'zprog', type: 'program' },
        { name: 'zprog_top', type: 'program_include' },
      ],
      check_variant: 'V',
    });
    assert.equal(result.isError, false);
    assert.deepStrictEqual(seen.target.objects, [
      { objectName: 'ZPROG', objectType: 'program' },
      { objectName: 'ZPROG_TOP', objectType: 'program_include' },
    ]);
  });

  it('passes a function include with its group, a class include with its kind', async () => {
    const seen = capture();
    const result: any = await handleRunATC(context as any, {
      objects: [
        { name: 'lzfg_f01', type: 'function_include', function_group: 'zfg' },
        {
          name: 'zcl_x',
          type: 'class_include',
          include_kind: 'testclasses',
        },
      ],
      check_variant: 'V',
    });
    assert.equal(result.isError, false);
    assert.deepStrictEqual(seen.target.objects, [
      {
        objectName: 'LZFG_F01',
        objectType: 'function_include',
        functionGroup: 'ZFG',
      },
      {
        objectName: 'ZCL_X',
        objectType: 'class_include',
        includeKind: 'testclasses',
      },
    ]);
    assert.deepStrictEqual(payload(result).objects, [
      { name: 'LZFG_F01', type: 'function_include', function_group: 'ZFG' },
      { name: 'ZCL_X', type: 'class_include', include_kind: 'testclasses' },
    ]);
  });

  for (const [object, field] of [
    [{ name: 'LZFG_F01', type: 'function_include' }, 'function_group'],
    [{ name: 'ZCL_X', type: 'class_include' }, 'include_kind'],
  ] as const) {
    it(`refuses ${pretty(object)} without ${field} before making any call`, async () => {
      atc = {
        createWorklist: async () => {
          throw new Error('should not be called');
        },
      };
      const result: any = await handleRunATC(context as any, {
        objects: [object],
        check_variant: 'V',
      });
      assert.equal(result.isError, true);
      assert.ok(String(result.content[0].text).includes(field));
    });
  }
});

/**
 * The object kinds are the declared variant's (`ATC_OBJECT_TYPES`): ABAP
 * cloud holds no program or program include of the caller's, so it offers
 * neither; on premise offers every kind the client checks. The description
 * names exactly the variant's list, and a kind outside it is refused naming
 * that list before any call.
 */
describe('RunATC: the object kinds of each variant', () => {
  const ONPREM = [
    'class',
    'interface',
    'function_group',
    'package',
    'ddl_source',
    'table',
    'behavior_definition',
    'program',
    'program_include',
    'function_include',
    'class_include',
  ];
  const CLOUD = ONPREM.filter(
    (kind) => kind !== 'program' && kind !== 'program_include',
  );
  const stated = (variant: 'onprem' | 'cloud') =>
    TOOL_DEFINITION.variants[variant];
  const typeEnum = (variant: 'onprem' | 'cloud') =>
    jsonAt(listedJson(stated(variant).inputSchema), 'objects', '[]', 'type')
      .enum;

  for (const [variant, kinds] of [
    ['onprem', ONPREM],
    ['cloud', CLOUD],
  ] as const) {
    it(format('%s offers exactly its kinds', variant), () => {
      assert.deepStrictEqual(ATC_OBJECT_TYPES[variant], kinds);
      assert.deepStrictEqual(typeEnum(variant), kinds);
    });
  }

  it('cloud names no program kind', () => {
    assert.ok(!stated('cloud').description.includes('program'));
    assert.ok(!stated('cloud').description.includes('on premise'));
  });

  /** A run of one object of `type` on `variant`: its answer and the calls. */
  async function runOn(variant: 'onprem' | 'cloud', type: string) {
    const calls: string[] = [];
    atc = {
      createWorklist: async () => {
        calls.push('createWorklist');
        return okResponse('WL1');
      },
      startRun: async (worklistId: string) => {
        calls.push('startRun');
        return okResponse({ waited: false, worklistId, runId: 'RUN1' });
      },
    };
    const connection = recordingConnection();
    declareSystemKind(connection, variant);
    // The model's call: through the tool's entry, its schema first. A
    // refusal there is thrown; its words are the answer's text.
    const answered = await defineTool(TOOL_DEFINITION, handleRunATC)
      .call(
        { connection },
        { objects: [{ name: 'ZOBJ', type }], check_variant: 'V' },
      )
      .catch((refused: unknown) => ({
        isError: true,
        content: [{ type: 'text', text: String(refused) }],
      }));
    return { answered, calls };
  }

  it('cloud refuses PROGRAM at the schema, before any call', async () => {
    const { answered, calls } = await runOn('cloud', 'PROGRAM');
    assert.equal(answered.isError, true);
    assert.ok(
      answered.content[0]?.text.includes('Invalid arguments for tool RunATC: '),
    );
    assert.deepStrictEqual(calls, []);
  });

  for (const type of ['program', 'program_include']) {
    it(
      format(
        'cloud refuses %s by its listed cloud schema, naming its kinds, before any call',
        type,
      ),
      async () => {
        const { answered, calls } = await runOn('cloud', type);
        assert.equal(answered.isError, true);
        const text = answered.content[0]?.text ?? '';
        assert.ok(text.includes('Invalid arguments for tool RunATC: '));
        for (const kind of CLOUD) assert.ok(text.includes(`"${kind}"`));
        assert.ok(text.includes('at objects.0.type'));
        assert.deepStrictEqual(calls, []);
      },
    );
  }

  for (const [variant, type] of [
    ['onprem', 'program'],
    ['onprem', 'program_include'],
    ['cloud', 'class'],
    ['cloud', 'function_group'],
  ] as const) {
    it(format('%s runs %s', variant, type), async () => {
      const { answered, calls } = await runOn(variant, type);
      assert.ok(!answered.isError);
      assert.deepStrictEqual(calls, ['createWorklist', 'startRun']);
    });
  }

  it('refuses a kind no variant has at the schema, before any call', async () => {
    const { answered, calls } = await runOn('onprem', 'domain');
    assert.ok(
      answered.content[0]?.text.includes('Invalid arguments for tool RunATC: '),
    );
    assert.deepStrictEqual(calls, []);
  });
});

describe('RunATC: a field the type does not use', () => {
  for (const [object, field, type] of [
    [
      { name: 'ZCL_X', type: 'class', function_group: 'ZFG' },
      'function_group',
      'class',
    ],
    [
      { name: 'ZPROG', type: 'program', include_kind: 'macros' },
      'include_kind',
      'program',
    ],
    [
      {
        name: 'LZFG_F01',
        type: 'function_include',
        function_group: 'ZFG',
        include_kind: 'macros',
      },
      'include_kind',
      'function_include',
    ],
    [
      {
        name: 'ZCL_X',
        type: 'class_include',
        include_kind: 'macros',
        function_group: 'ZFG',
      },
      'function_group',
      'class_include',
    ],
  ] as const) {
    it(`refuses ${pretty(object)}, naming ${field} and ${type}, before any call`, async () => {
      atc = {
        createWorklist: async () => {
          throw new Error('should not be called');
        },
      };
      const result: any = await handleRunATC(context as any, {
        objects: [object],
        check_variant: 'V',
      });
      assert.equal(result.isError, true);
      const text = String(result.content[0].text);
      assert.ok(text.includes(field));
      assert.ok(text.includes(`"${type}"`));
    });
  }
});

describe('the two readers', () => {
  it('answers the status as the server words it, and the flag the client draws', async () => {
    atc = {
      getRunStatus: async () =>
        okResponse({
          status: 'finished',
          isFinished: true,
          worklistId: 'WL1',
          resultId: 'RES1',
        }),
    };

    const result: any = await handleGetATCRunStatus(context as any, {
      run_id: 'RUN1',
    });

    assert.deepStrictEqual(payload(result), {
      success: true,
      run_id: 'RUN1',
      status: 'finished',
      is_finished: true,
      worklist_id: 'WL1',
      result_id: 'RES1',
    });
  });

  it('leaves out an id the answer did not carry', async () => {
    atc = {
      getRunStatus: async () =>
        okResponse({ status: 'running', isFinished: false }),
    };
    const result: any = await handleGetATCRunStatus(context as any, {
      run_id: 'RUN1',
    });
    const answered = payload(result);
    assert.equal(answered.is_finished, false);
    assert.equal('worklist_id' in answered, false);
    assert.equal('result_id' in answered, false);
  });

  it('reads the worklist into findings, and hands back the document on raw', async () => {
    atc = { getFindings: async () => okResponse(WORKLIST) };

    const terse: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
    });
    const lines = terse.content[0].text.split('\n');
    for (const line of [
      '# finding_count 6',
      '# objects_checked 21',
      '# priority 2 4',
      '# priority 3 2',
    ]) {
      assert.ok(lines.includes(line), terse.content[0].text);
    }

    atc = { getFindings: async () => okResponse(WORKLIST) };
    const raw: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
      detail: 'raw',
    });
    // raw: the worklist as SAP sent it, nothing of ours around it.
    assert.equal(raw.content[0].text, WORKLIST);
  });

  // One read, one document: GetATCResult's raw is the result document as
  // SAP sent it, no JSON of ours around it (Codex round 5, P1-3).
  it('GetATCResult hands back the result document as is on raw', async () => {
    const RESULT_DOCUMENT = '<?xml version="1.0"?><atcresult:result/>';
    atc = { getResult: async () => okResponse(RESULT_DOCUMENT) };
    const raw: any = await handleGetATCResult(context as any, {
      display_id: 'D1',
      detail: 'raw',
    });
    assert.equal(raw.isError, false);
    assert.equal(raw.content[0].text, RESULT_DOCUMENT);
  });

  // Codex round 6, P1-5: GetATCResult's terse findings go through the
  // listing writer — every finding the result holds, each to act on.
  it('GetATCResult terse: a finding per finding the result holds', async () => {
    const DOCUMENT = corpusBody(
      'atc-result-by-display-id-objects--01-results-e6ac99b2161f1fe1b5a26b71db975628',
    );
    atc = { getResult: async () => okResponse(DOCUMENT) };
    const terse: any = await handleGetATCResult(context as any, {
      display_id: 'D1',
    });
    assert.equal(terse.isError, false, terse.content[0].text);
    const lines: string[] = terse.content[0].text.split('\n');
    const header = lines.indexOf(
      'object\tobject_type\tlocation\tline\tcolumn\tpriority\tcheck\tmessage',
    );
    const count = lines.find((l) => l.startsWith('# finding_count '));
    assert.ok(header >= 0 && count !== undefined, terse.content[0].text);
    assert.equal(lines.length - header - 1, Number(count.split(' ')[2]));
    assert.ok(lines.length - header - 1 > 0);
  });

  // A finding is one row, its line and column written: two findings apart
  // only by their position are two rows (step 9: written by construction).
  it('two findings apart only by line or column are two rows', () => {
    const at = (line: number, column: number) => ({
      object: 'ZCL_X',
      object_type: 'CLAS',
      location: '/sap/bc/adt/oo/classes/zcl_x/source/main',
      line,
      column,
      priority: 2,
      check: 'Extended check',
      message: 'unused',
    });
    const rows = findingsText([], {}, [at(9, 0), at(10, 0), at(9, 4)])
      .answer.split('\n')
      .slice(1);
    assert.equal(new Set(rows).size, 3, rows.join('\n'));
  });

  it('says so when the worklist is empty, rather than reading as clean', async () => {
    // What a read answers while the run is still going: measured against
    // trial, a worklist read right after `wait: false` carried no objects at
    // all. Counts alone would have said `finding_count: 0`, which is what a
    // clean package says too.
    atc = {
      getFindings: async () =>
        okResponse(
          '<atcworklist:worklist><atcworklist:objects/></atcworklist:worklist>',
        ),
    };
    const result: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
    });
    const lines: string[] = result.content[0].text.split('\n');
    assert.ok(lines.includes('# finding_count 0'));
    assert.ok(
      lines.some(
        (l) => l.startsWith('# note') && l.includes('not a clean result'),
      ),
    );
  });

  it('adds no such note when objects were actually checked', async () => {
    atc = { getFindings: async () => okResponse(WORKLIST) };
    const result: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
    });
    // Terse is TSV (Codex round 7): no `# note` line.
    assert.ok(
      !result.content[0].text
        .split('\n')
        .some((l: string) => l.startsWith('# note')),
    );
  });

  it("forwards the worklist read's own refusal", async () => {
    atc = { getFindings: async () => refusedResponse('Worklist not found') };
    const result: any = await handleGetATCFindings(context as any, {
      worklist_id: 'NOPE',
    });
    assert.equal(result.isError, true);
    assert.equal(payload(result).message, 'Worklist not found');
  });
});
