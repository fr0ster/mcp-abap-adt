/**
 * The unit-test tools, one per carrier, against the real adt-clients over a
 * recording connection: what each writes, where, under which lock, and what a
 * run answers.
 *
 * The runs answer the captured corpus documents of a passing class run
 * (`unittest-run-passing--*`); the run is the same resource whichever object
 * started it, so one capture serves every Run* tool.
 */

import { handleCreateFunctionGroupUnitTest } from '../../handlers/unit_test/high/handleCreateFunctionGroupUnitTest';
import { handleCreateProgramUnitTest } from '../../handlers/unit_test/high/handleCreateProgramUnitTest';
import { handleCreateUnitTest } from '../../handlers/unit_test/high/handleCreateUnitTest';
import { handleRunFunctionGroupUnitTest } from '../../handlers/unit_test/high/handleRunFunctionGroupUnitTest';
import { handleRunFunctionModuleUnitTest } from '../../handlers/unit_test/high/handleRunFunctionModuleUnitTest';
import { handleRunProgramUnitTest } from '../../handlers/unit_test/high/handleRunProgramUnitTest';
import { handleRunUnitTest } from '../../handlers/unit_test/high/handleRunUnitTest';
import { handleUpdateProgramUnitTest } from '../../handlers/unit_test/high/handleUpdateProgramUnitTest';
import {
  functionGroupTestInclude,
  programTestInclude,
} from '../../handlers/unit_test/shared/writeTests';
import { corpusBody } from '../../lib/adtCorpus';
import {
  type RecordedRequest,
  recordingConnection,
} from '../helpers/recordingConnection';

const ctx = (connection: unknown) => ({ connection, logger: undefined });

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
const RUNNING = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="RUNNING" percentage="40"/></aunit:run>',
};

const line = (r: RecordedRequest) => `${r.method} ${r.url.split('?')[0]}`;
const payload = (result: any) => JSON.parse(result.content[0].text);

describe('Run* tools: start, wait, answer the result — one call', () => {
  it.each([
    [
      'RunUnitTest',
      handleRunUnitTest,
      { class_name: 'zcl_x' },
      'CLAS',
      'ZCL_X',
    ],
    [
      'RunProgramUnitTest',
      handleRunProgramUnitTest,
      { program_name: 'zr_x' },
      'PROG',
      'ZR_X',
    ],
    [
      'RunFunctionGroupUnitTest',
      handleRunFunctionGroupUnitTest,
      { function_group_name: 'zfg_x' },
      'FUGR',
      'ZFG_X',
    ],
    [
      'RunFunctionModuleUnitTest',
      handleRunFunctionModuleUnitTest,
      { function_module_name: 'z_fm_x' },
      'FUNC',
      'Z_FM_X',
    ],
  ] as const)(
    '%s names its object as %s, polls, and answers the finished result',
    async (_name, handler, args, type, name) => {
      const connection = recordingConnection([STARTED, FINISHED, RESULT]);

      const result: any = await (handler as any)(ctx(connection), args);

      expect(result.isError).toBe(false);
      expect(connection.requests.map(line)).toEqual([
        'POST /sap/bc/adt/abapunit/runs',
        `GET /sap/bc/adt/abapunit/runs/${RUN}`,
        `GET /sap/bc/adt/abapunit/results/${RUN}`,
      ]);
      expect(String(connection.requests[0].data)).toContain(
        `<osl:object name="${name}" type="${type}"/>`,
      );
      const answer = payload(result);
      expect(answer.finished).toBe(true);
      expect(answer.run_id).toBe(RUN);
      expect(JSON.stringify(answer.run_result)).toContain('TEST_METHOD');
    },
  );

  it('answers the run id and where to ask, when the run outlasts the wait', async () => {
    const connection = recordingConnection([
      STARTED,
      ...Array(5).fill(RUNNING),
    ]);

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
    });

    expect(result.isError).toBe(false);
    const answer = payload(result);
    expect(answer.finished).toBe(false);
    expect(answer.run_id).toBe(RUN);
    expect(answer.message).toContain('GetUnitTestResult');
    expect(connection.requests.some((r) => r.url.includes('/results/'))).toBe(
      false,
    );
  });

  it('is an error, and asks nothing more, when no run was started', async () => {
    const connection = recordingConnection([{ status: 200, headers: {} }]);

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
    });

    expect(result.isError).toBe(true);
    expect(connection.requests).toHaveLength(1);
  });
});

describe('CreateUnitTest: the class test include, under the class lock', () => {
  it('locks the class, writes the include, unlocks, activates', async () => {
    const connection = recordingConnection();

    const result: any = await handleCreateUnitTest(ctx(connection) as any, {
      class_name: 'zcl_x',
      test_class_source: 'CLASS ltc DEFINITION FOR TESTING. ENDCLASS.',
    });

    expect(result.isError).toBe(false);
    const writes = connection.requests.filter((r) => r.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(writes[0].url).toContain('/oo/classes/zcl_x/includes/testclasses');
    expect(String(writes[0].data)).toContain('FOR TESTING');
    expect(
      connection.requests.some((r) => r.url.includes('_action=LOCK')),
    ).toBe(true);
    expect(
      connection.requests.some((r) => r.url.includes('_action=UNLOCK')),
    ).toBe(true);
    expect(connection.requests.at(-1)?.url).toContain('/activation');
  });
});

describe('CreateProgramUnitTest: a test include, pulled into the report', () => {
  const METADATA =
    '<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZR_X"><adtcore:packageRef adtcore:name="ZPKG"/></program:abapProgram>';

  it('creates the include in the report package, writes it, adds the INCLUDE, activates both', async () => {
    // metadata, include create, lock, PUT, unlock, report read, then defaults.
    const connection = recordingConnection([
      { data: METADATA },
      undefined, // include create
      undefined, // include lock
      undefined, // include write
      undefined, // include unlock
      undefined, // report lock
      { data: 'REPORT zr_x.\n' }, // report read, under the lock
    ]);

    const result: any = await handleCreateProgramUnitTest(
      ctx(connection) as any,
      {
        program_name: 'zr_x',
        test_class_source: 'CLASS ltc DEFINITION FOR TESTING. ENDCLASS.',
      },
    );

    expect(result.isError).toBe(false);
    const include = programTestInclude('zr_x').toLowerCase();
    const created = connection.requests.find(
      (r) =>
        r.method === 'POST' &&
        r.url.split('?')[0].endsWith('/programs/includes'),
    );
    expect(String(created?.data)).toContain('adtcore:name="ZPKG"');
    const puts = connection.requests.filter((r) => r.method === 'PUT');
    expect(puts.map((r) => r.url.split('?')[0])).toEqual([
      `/sap/bc/adt/programs/includes/${include}/source/main`,
      '/sap/bc/adt/programs/programs/zr_x/source/main',
    ]);
    expect(String(puts[1].data)).toContain(`INCLUDE ${include}.`);
    // The report is read under its lock and written under the same one, so
    // nothing saved in between can be overwritten.
    const reportRequests = connection.requests
      .map((r) => line(r).toLowerCase())
      .filter((l) => l.includes('/programs/programs/zr_x'));
    // metadata, then lock → read → write → unlock
    expect(reportRequests).toEqual([
      'get /sap/bc/adt/programs/programs/zr_x',
      'post /sap/bc/adt/programs/programs/zr_x',
      'get /sap/bc/adt/programs/programs/zr_x/source/main',
      'put /sap/bc/adt/programs/programs/zr_x/source/main',
      'post /sap/bc/adt/programs/programs/zr_x',
    ]);
    const reportLock = connection.requests.findIndex((r) =>
      r.url.toLowerCase().includes('/programs/programs/zr_x?_action=lock'),
    );
    const reportRead = connection.requests.findIndex(
      (r) =>
        r.method === 'GET' &&
        r.url.toLowerCase().includes('/programs/programs/zr_x/source'),
    );
    expect(reportLock).toBeGreaterThan(-1);
    expect(reportRead).toBeGreaterThan(reportLock);
    const activations = connection.requests.filter((r) =>
      r.url.includes('/activation'),
    );
    expect(activations).toHaveLength(2);
  });

  it('leaves the report alone when it already pulls the include in', async () => {
    const include = programTestInclude('zr_x').toLowerCase();
    const connection = recordingConnection([
      { data: METADATA },
      undefined, // include create
      undefined, // include lock
      undefined, // include write
      undefined, // include unlock
      undefined, // report lock
      { data: `REPORT zr_x.\n\nINCLUDE ${include}.\n` },
    ]);

    await handleCreateProgramUnitTest(ctx(connection) as any, {
      program_name: 'zr_x',
      test_class_source: 'x',
    });

    const puts = connection.requests.filter((r) => r.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toContain(`/programs/includes/${include}/`);
  });

  it('UpdateProgramUnitTest rewrites the include only — no create, no report write', async () => {
    const connection = recordingConnection();

    const result: any = await handleUpdateProgramUnitTest(
      ctx(connection) as any,
      { program_name: 'zr_x', test_class_source: 'x' },
    );

    expect(result.isError).toBe(false);
    expect(
      connection.requests.some(
        (r) =>
          r.method === 'POST' &&
          r.url.split('?')[0].endsWith('/programs/includes'),
      ),
    ).toBe(false);
    const puts = connection.requests.filter((r) => r.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toContain(
      `/programs/includes/${programTestInclude('zr_x').toLowerCase()}/`,
    );
  });
});

describe('test include names', () => {
  it("a report's is the report's name with _T99", () => {
    expect(programTestInclude('zr_x')).toBe('ZR_X_T99');
    expect(programTestInclude('/ns/zr_x')).toBe('/NS/ZR_X_T99');
  });

  it("a function group's follows its main program: L<group>, namespace in front", () => {
    expect(functionGroupTestInclude('zfg_x')).toBe('LZFG_XT99');
    expect(functionGroupTestInclude('/ns/group')).toBe('/NS/LGROUPT99');
  });
});

describe('CreateFunctionGroupUnitTest: the group test include', () => {
  it('creates it under the group, writes it, activates it and the group', async () => {
    const connection = recordingConnection();

    const result: any = await handleCreateFunctionGroupUnitTest(
      ctx(connection) as any,
      { function_group_name: 'zfg_x', test_class_source: 'x' },
    );

    expect(result.isError).toBe(false);
    const include = functionGroupTestInclude('zfg_x').toLowerCase();
    expect(
      connection.requests.some(
        (r) =>
          r.method === 'POST' &&
          r.url.includes('/functions/groups/zfg_x/includes'),
      ),
    ).toBe(true);
    const puts = connection.requests.filter((r) => r.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url.toLowerCase()).toContain(
      `/includes/${include}/source/main`,
    );
    expect(
      connection.requests.filter((r) => r.url.includes('/activation')),
    ).toHaveLength(2);
  });
});
