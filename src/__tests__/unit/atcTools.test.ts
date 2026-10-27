import { handleGetATCFindings } from '../../handlers/atc/high/handleGetATCFindings';
import { handleGetATCRunStatus } from '../../handlers/atc/high/handleGetATCRunStatus';
import {
  handleRunATC,
  TOOL_DEFINITION,
} from '../../handlers/atc/high/handleRunATC';
import { corpusBody } from '../../lib/adtCorpus';
import { parseAtcWorklist } from '../../lib/strategies/atcFindings';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

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

const WORKLIST = corpusBody(
  'atc-findings-worklist--01-worklists-2aaa2806861e1fd1ad9bd28dca5c37ed',
);

let atc: Record<string, unknown>;
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  AdtRuntimeClient: jest.fn(() => ({ getAtc: () => atc })),
}));

const context = { connection: {} as any, logger: undefined };
const payload = (result: any) => JSON.parse(result.content[0].text);

describe('the ATC worklist reading, against the captured document', () => {
  it('finds every finding and nothing else', () => {
    const reading = parseAtcWorklist(WORKLIST);

    // Measured on the trial system, 2026-09-20: one run over ZMCP_SHR_PKG.
    expect(reading.findings).toHaveLength(6);
    expect(reading.objects_checked).toBe(21);
    expect(reading.by_priority).toEqual({ '2': 4, '3': 2 });
  });

  it('keeps the object beside what was found in it', () => {
    const finding = parseAtcWorklist(WORKLIST).findings[0];

    expect(finding.check).toBe('Extended Program Check (SLIN)');
    expect(finding.message).toContain('Strings without text elements');
    expect(finding.priority).toBe(3);
    // The position is the finding's own: a function module's finding points
    // at the include, not at the object the run was asked about.
    expect(finding.location).toContain('/fmodules/');
    expect(finding.line).toBe(9);
    expect(finding.object_type).toBe('FUGR');
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

    expect(parseAtcWorklist(renamed)).toEqual(parseAtcWorklist(WORKLIST));
  });

  it('decodes what the document escaped', () => {
    // A check message is free text and carries whatever the checker wrote;
    // an ampersand reaches the wire as an entity, and a caller handed
    // `&amp;` back has been given the escape rather than the message.
    const escaped =
      '<atcworklist:worklist><atcworklist:objects><atcobject:object adtcore:name="ZCL_X" adtcore:type="CLAS"><atcobject:findings><atcfinding:finding atcfinding:priority="2" atcfinding:checkTitle="Check &amp; Verify" atcfinding:messageTitle="&quot;A&quot; &lt; &quot;B&quot; &amp; more"/></atcobject:findings></atcobject:object></atcworklist:objects></atcworklist:worklist>';

    const [finding] = parseAtcWorklist(escaped).findings;
    expect(finding.check).toBe('Check & Verify');
    expect(finding.message).toBe('"A" < "B" & more');
  });

  it('answers an empty reading for a document with no findings', () => {
    // The shape a clean object answers: `<atcobject:findings/>`, self-closing.
    const clean =
      '<atcworklist:worklist><atcworklist:objects><atcobject:object adtcore:name="ZCL_X" adtcore:type="CLAS"><atcobject:findings/></atcobject:object></atcworklist:objects></atcworklist:worklist>';
    expect(parseAtcWorklist(clean)).toEqual({
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
    expect(finding.line).toBe(9);
    expect(finding.column).toBe(0);
    expect(finding.check_id).toBe('F8607CD40A0F8B30BDF8590205B306E8');
    expect(finding.check_class).toBe('CL_CI_TEST_EXTENDED_CHECK');
    expect(finding.message_id).toBe('1713');
    expect(finding.documentation_uri).toBe(
      '/sap/bc/adt/documentation/atc/documents/itemid/E2882D9BE21A1FD1AD9BCCF1C1A64EB9/index/1426',
    );
    // As the document carries them: `-` for the approval, an empty kind
    // left out.
    expect(finding.exemption_approval).toBe('-');
    expect(finding.exemption_kind).toBeUndefined();
    expect(finding.quickfixes).toEqual({
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
    expect(parseAtcWorklist(doc).findings[0].quickfixes?.manual).toBe(true);
  });

  it('answers the fields under full, and terse as before', async () => {
    atc = { getFindings: async () => okResponse(WORKLIST) };
    const terse: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
    });
    expect(Object.keys(payload(terse).findings[0]).sort()).toEqual(
      [
        'check',
        'line',
        'location',
        'message',
        'object',
        'object_type',
        'priority',
      ].sort(),
    );

    atc = { getFindings: async () => okResponse(WORKLIST) };
    const full: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
      detail: 'full',
    });
    expect(payload(full).findings[0]).toMatchObject({
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
    expect(payload(full).finding_count).toBe(6);
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
    expect(at('/sap/bc/adt/oo/classes/zcl_x/source/main#start=9,4')).toEqual({
      location: '/sap/bc/adt/oo/classes/zcl_x/source/main',
      line: 9,
      column: 4,
    });
  });

  // The unit-test fixtures' shape: `;`-separated, start then end.
  it('reads #start=LINE,COLUMN;end=LINE,COLUMN', () => {
    expect(
      at('/sap/bc/adt/oo/classes/zcl_x/source/main#start=8,3;end=8,0'),
    ).toEqual({
      location: '/sap/bc/adt/oo/classes/zcl_x/source/main',
      line: 8,
      column: 3,
    });
  });

  // The debugger fixtures' shape: other parts first, a line with no column.
  it('reads #type=…;name=…;start=LINE', () => {
    expect(
      at(
        '/sap/bc/adt/oo/classes/zcl_x/source/main#type=CLAS%2FOM;name=POST;start=29',
      ),
    ).toEqual({
      location: '/sap/bc/adt/oo/classes/zcl_x/source/main',
      line: 29,
      column: undefined,
    });
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
        expect(target.objects).toEqual([
          { objectName: 'ZCL_X', objectType: 'class' },
        ]);
        return okResponse({ waited: false, worklistId, runId: 'RUN1' });
      },
    };

    const result: any = await handleRunATC(context as any, {
      objects: [{ name: 'zcl_x', type: 'class' }],
    });

    expect(calls).toEqual([
      'variant',
      'worklist:ABAP_CLOUD_DEVELOPMENT_DEFAULT',
      'run:WL1:false:100',
    ]);
    expect(result.isError).toBe(false);
    expect(payload(result)).toMatchObject({
      check_variant: 'ABAP_CLOUD_DEVELOPMENT_DEFAULT',
      worklist_id: 'WL1',
      waited: false,
      run_id: 'RUN1',
    });
  });

  it('does not ask for a variant when it was given one', async () => {
    const asked = jest.fn();
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

    expect(asked).not.toHaveBeenCalled();
    // A run that waited has no run to poll, and the counts arrive instead.
    expect(payload(result)).toMatchObject({
      waited: true,
      finding_stats: '0,4,2',
      worklist_id: 'WL1',
    });
    expect(payload(result).run_id).toBeUndefined();
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

    expect(result.isError).toBe(true);
    expect(payload(result).origin).toBe('refusal');
    expect(payload(result).message).toContain('Not authorized for ATC');
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

    expect(result.isError).toBe(true);
    expect(payload(result).error).toBe('client_threw');
  });

  it.each([0, -1, 2.5, Number.NaN])(
    'refuses max_findings %p before making any call',
    async (max_findings) => {
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
      expect(result.isError).toBe(true);
      // `return_error` answers text, not the JSON envelope `answer()` builds:
      // this refusal is raised before any call, so there is no ADT answer to
      // shape.
      expect(String(result.content[0].text)).toContain('max_findings');
    },
  );

  it('refuses an empty object list before making any call', async () => {
    atc = {
      resolveCheckVariant: async () => {
        throw new Error('should not be called');
      },
    };
    const result: any = await handleRunATC(context as any, { objects: [] });
    expect(result.isError).toBe(true);
  });
});

describe('RunATC: the object kinds the client checks', () => {
  const objectSchema = () =>
    (TOOL_DEFINITION.inputSchema.properties.objects.items as any).properties;

  it('offers every kind the client builds a URI for', () => {
    expect([...objectSchema().type.enum].sort()).toEqual(
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
    expect([...objectSchema().include_kind.enum].sort()).toEqual(
      ['definitions', 'implementations', 'macros', 'testclasses'].sort(),
    );
    expect(objectSchema().function_group.type).toBe('string');
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
    expect(result.isError).toBe(false);
    expect(seen.target.objects).toEqual([
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
    expect(result.isError).toBe(false);
    expect(seen.target.objects).toEqual([
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
    expect(payload(result).objects).toEqual([
      { name: 'LZFG_F01', type: 'function_include', function_group: 'ZFG' },
      { name: 'ZCL_X', type: 'class_include', include_kind: 'testclasses' },
    ]);
  });

  it.each([
    [{ name: 'LZFG_F01', type: 'function_include' }, 'function_group'],
    [{ name: 'ZCL_X', type: 'class_include' }, 'include_kind'],
  ] as const)(
    'refuses %p without %s before making any call',
    async (object, field) => {
      atc = {
        createWorklist: async () => {
          throw new Error('should not be called');
        },
      };
      const result: any = await handleRunATC(context as any, {
        objects: [object],
        check_variant: 'V',
      });
      expect(result.isError).toBe(true);
      expect(String(result.content[0].text)).toContain(field);
    },
  );
});

describe('RunATC: a field the type does not use', () => {
  it.each([
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
  ] as const)(
    'refuses %p, naming %s and %s, before any call',
    async (object, field, type) => {
      atc = {
        createWorklist: async () => {
          throw new Error('should not be called');
        },
      };
      const result: any = await handleRunATC(context as any, {
        objects: [object],
        check_variant: 'V',
      });
      expect(result.isError).toBe(true);
      const text = String(result.content[0].text);
      expect(text).toContain(field);
      expect(text).toContain(`"${type}"`);
    },
  );
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

    expect(payload(result)).toEqual({
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
    expect(answered.is_finished).toBe(false);
    expect('worklist_id' in answered).toBe(false);
    expect('result_id' in answered).toBe(false);
  });

  it('reads the worklist into findings, and hands back the document on raw', async () => {
    atc = { getFindings: async () => okResponse(WORKLIST) };

    const terse: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
    });
    expect(payload(terse)).toMatchObject({
      finding_count: 6,
      objects_checked: 21,
      by_priority: { '2': 4, '3': 2 },
    });

    atc = { getFindings: async () => okResponse(WORKLIST) };
    const raw: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
      detail: 'raw',
    });
    expect(payload(raw).worklist).toBe(WORKLIST);
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
    const answered = payload(result);
    expect(answered.finding_count).toBe(0);
    expect(answered.note).toContain('not a clean result');
  });

  it('adds no such note when objects were actually checked', async () => {
    atc = { getFindings: async () => okResponse(WORKLIST) };
    const result: any = await handleGetATCFindings(context as any, {
      worklist_id: 'WL1',
    });
    expect(payload(result).note).toBeUndefined();
  });

  it("forwards the worklist read's own refusal", async () => {
    atc = { getFindings: async () => refusedResponse('Worklist not found') };
    const result: any = await handleGetATCFindings(context as any, {
      worklist_id: 'NOPE',
    });
    expect(result.isError).toBe(true);
    expect(payload(result).message).toBe('Worklist not found');
  });
});
