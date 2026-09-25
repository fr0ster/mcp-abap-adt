import { AdtSAPError } from '@mcp-abap-adt/adt-clients';
import { handleGetATCFindings } from '../../handlers/atc/high/handleGetATCFindings';
import { handleGetATCRunStatus } from '../../handlers/atc/high/handleGetATCRunStatus';
import { handleRunATC } from '../../handlers/atc/high/handleRunATC';
import { corpusBody } from '../../lib/adtCorpus';
import { parseAtcWorklist } from '../../lib/strategies/atcFindings';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

/**
 * The three ATC tools, and the two things about them that are this
 * repository's own work rather than the client's.
 *
 * **The composite.** `AdtAtc` stopped being `IAdtRunnable` in 19.0.0 because
 * a run is three calls — the variant, a worklist, the run — and the client
 * refuses to choose the order. `RunATC` chooses it. Two of those three
 * members answer by throwing rather than by an `IAdtResponse`, so the
 * handler has to tell a refusal from SAP apart from a fault of its own; that
 * is what `answering()` in `atcRun.ts` does, and what the tests below pin.
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

describe('RunATC composes the three calls', () => {
  it('resolves the variant, makes a worklist, runs, and names all three', async () => {
    const calls: string[] = [];
    atc = {
      resolveCheckVariant: async () => {
        calls.push('variant');
        return 'ABAP_CLOUD_DEVELOPMENT_DEFAULT';
      },
      createWorklist: async (variant: string) => {
        calls.push(`worklist:${variant}`);
        return 'WL1';
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
      createWorklist: async () => 'WL1',
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

  it("reports SAP's refusal as a refusal, though the client threw it", async () => {
    // `resolveCheckVariant` and `createWorklist` bypass the client's own
    // `answering()`, so a 403 arrives as a thrown `AdtSAPError`. Left alone
    // it would be rendered `client_threw` — this process blamed for what SAP
    // decided.
    atc = {
      resolveCheckVariant: async () => {
        throw new AdtSAPError('Not authorized for ATC', 403 as never);
      },
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
