/**
 * The unit-test tools, one per carrier, against the real adt-clients over a
 * recording connection: what each writes, where, under which lock, and what a
 * run answers.
 *
 * The runs answer the captured corpus documents of a passing class run
 * (`unittest-run-passing--*`); the run is the same resource whichever object
 * started it, so one capture serves every Run* tool.
 */

import { handleHandlerUnitTestRun } from '../../../compact-modify/src/handlers/handleHandlerUnitTestRun';
import { handleCreateFunctionGroupUnitTest } from '../../handlers/unit_test/high/handleCreateFunctionGroupUnitTest';
import { handleCreateProgramUnitTest } from '../../handlers/unit_test/high/handleCreateProgramUnitTest';
import { handleCreateUnitTest } from '../../handlers/unit_test/high/handleCreateUnitTest';
import { handleRunFunctionGroupUnitTest } from '../../handlers/unit_test/high/handleRunFunctionGroupUnitTest';
import { handleRunFunctionModuleUnitTest } from '../../handlers/unit_test/high/handleRunFunctionModuleUnitTest';
import { handleRunProgramUnitTest } from '../../handlers/unit_test/high/handleRunProgramUnitTest';
import { handleRunUnitTest } from '../../handlers/unit_test/high/handleRunUnitTest';
import { handleUpdateProgramUnitTest } from '../../handlers/unit_test/high/handleUpdateProgramUnitTest';
import {
  functionGroupMainProgram,
  functionGroupTestInclude,
  programTestInclude,
} from '../../handlers/unit_test/shared/writeTests';
import { corpusBody } from '../../lib/adtCorpus';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import {
  type RecordedRequest,
  recordingConnection,
} from '../helpers/recordingConnection';
import { SAP_EXCEPTION_HEADERS, sapException } from '../helpers/sapRefusals';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

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

  it('answers the run id right after the start with wait false', async () => {
    const connection = recordingConnection([
      STARTED,
      ...Array(5).fill(RUNNING),
    ]);

    const result = await handleRunUnitTest(
      { connection },
      {
        class_name: 'ZCL_X',
        wait: false,
      },
    );

    expect(result.isError).toBe(false);
    expect(connection.requests.map(line)).toEqual([
      'POST /sap/bc/adt/abapunit/runs',
    ]);
    expect(payload(result)).toEqual({ success: true, run_id: RUN });
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

/** A run that failed one test: the result document, a failed assertion inside. */
const FAILING_RESULT = {
  data: corpusBody(
    'refusal-unittest-run-failing--03-results-fa53c505dd7b1fd1abb859f1193d5d44',
  ),
};

describe('Run* tools with runner sync: one request, the finished result', () => {
  it.each([
    [
      'RunUnitTest',
      handleRunUnitTest,
      { class_name: 'zcl_x' },
      'adtcore:uri="/sap/bc/adt/oo/classes/zcl_x"',
    ],
    [
      'RunProgramUnitTest',
      handleRunProgramUnitTest,
      { program_name: 'zr_x' },
      '/sap/bc/adt/programs/programs/zr_x"',
    ],
    [
      'RunFunctionGroupUnitTest',
      handleRunFunctionGroupUnitTest,
      { function_group_name: 'zfg_x' },
      '/sap/bc/adt/functions/groups/zfg_x"',
    ],
    [
      'RunFunctionModuleUnitTest',
      handleRunFunctionModuleUnitTest,
      { function_module_name: 'z_fm_x', function_group_name: 'zfg_x' },
      '/sap/bc/adt/functions/groups/zfg_x/fmodules/z_fm_x"',
    ],
  ] as const)(
    '%s posts the object to /abapunit/testruns once and answers the result',
    async (_name, handler, args, uri) => {
      const connection = recordingConnection([RESULT]);

      const result: any = await (handler as any)(ctx(connection), {
        ...args,
        runner: 'sync',
      });

      expect(result.isError).toBe(false);
      expect(connection.requests.map(line)).toEqual([
        'POST /sap/bc/adt/abapunit/testruns',
      ]);
      expect(String(connection.requests[0].data).toLowerCase()).toContain(uri);
      const answer = payload(result);
      expect(answer).toMatchObject({ runner: 'sync', finished: true });
      expect(answer.run_id).toBeUndefined();
      expect(JSON.stringify(answer.run_result)).toContain('TEST_METHOD');
    },
  );

  it('a failing test is in the result, not a refusal', async () => {
    const connection = recordingConnection([FAILING_RESULT]);

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
      runner: 'sync',
    });

    expect(result.isError).toBe(false);
    expect(JSON.stringify(payload(result).run_result)).toContain(
      'deliberate failure for the corpus',
    );
  });

  it("detail raw answers SAP's document as it came", async () => {
    const connection = recordingConnection([RESULT]);

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
      runner: 'sync',
      detail: 'raw',
    });

    expect(payload(result).run_result).toBe(RESULT.data);
  });

  it("SAP's refusal is an error, with the step", async () => {
    const connection = recordingConnection();
    const record = connection.makeAdtRequest.bind(connection);
    connection.makeAdtRequest = (async (options: any) => {
      await record(options);
      throw Object.assign(new Error('Request failed with status code 404'), {
        isAxiosError: true,
        response: {
          status: 404,
          data: sapException('ExceptionResourceNotFound', 'Resource not found'),
          headers: SAP_EXCEPTION_HEADERS,
        },
      });
    }) as any;

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
      runner: 'sync',
    });

    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ step: 'run' });
    expect(connection.requests).toHaveLength(1);
  });

  it('a function module with runner sync and no function group is refused before any request', async () => {
    const connection = recordingConnection();

    const result: any = await handleRunFunctionModuleUnitTest(
      ctx(connection) as any,
      { function_module_name: 'Z_FM_X', runner: 'sync' },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('function_group_name is required');
    expect(connection.requests).toHaveLength(0);
  });

  it.each([
    ['RunUnitTest', handleRunUnitTest, { class_name: 'ZCL_X' }],
    ['RunProgramUnitTest', handleRunProgramUnitTest, { program_name: 'ZR_X' }],
    [
      'RunFunctionGroupUnitTest',
      handleRunFunctionGroupUnitTest,
      { function_group_name: 'ZFG_X' },
    ],
    [
      'RunFunctionModuleUnitTest',
      handleRunFunctionModuleUnitTest,
      { function_module_name: 'Z_FM_X' },
    ],
  ] as const)(
    '%s refuses another runner before any request',
    async (_name, handler, args) => {
      const connection = recordingConnection();

      const result: any = await (handler as any)(ctx(connection), {
        ...args,
        runner: 'later',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'runner must be one of async, sync',
      );
      expect(connection.requests).toHaveLength(0);
    },
  );

  it('runner async is the default flow: start, poll, result', async () => {
    const connection = recordingConnection([STARTED, FINISHED, RESULT]);

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
      runner: 'async',
    });

    expect(connection.requests.map(line)).toEqual([
      'POST /sap/bc/adt/abapunit/runs',
      `GET /sap/bc/adt/abapunit/runs/${RUN}`,
      `GET /sap/bc/adt/abapunit/results/${RUN}`,
    ]);
    expect(payload(result)).toMatchObject({ run_id: RUN, finished: true });
  });
});

describe('Run* tools: scope reaches the run, with either runner', () => {
  const TOOLS = [
    ['RunUnitTest', handleRunUnitTest, { class_name: 'ZCL_X' }],
    ['RunProgramUnitTest', handleRunProgramUnitTest, { program_name: 'ZR_X' }],
    [
      'RunFunctionGroupUnitTest',
      handleRunFunctionGroupUnitTest,
      { function_group_name: 'ZFG_X' },
    ],
    [
      'RunFunctionModuleUnitTest',
      handleRunFunctionModuleUnitTest,
      { function_module_name: 'Z_FM_X', function_group_name: 'ZFG_X' },
    ],
  ] as const;
  const scope = {
    own_tests: false,
    foreign_tests: true,
    add_foreign_tests_as_preview: false,
  };

  it.each(TOOLS)(
    '%s async: the scope given is the run configuration',
    async (_name, handler, args) => {
      const connection = recordingConnection([STARTED, FINISHED, RESULT]);

      await (handler as any)(ctx(connection), { ...args, scope });

      expect(String(connection.requests[0].data)).toContain(
        '<aunit:scope ownTests="false" foreignTests="true" addForeignTestsAsPreview="false"/>',
      );
    },
  );

  it.each(TOOLS)(
    '%s sync: the scope given is the run configuration',
    async (_name, handler, args) => {
      const connection = recordingConnection([RESULT]);

      await (handler as any)(ctx(connection), {
        ...args,
        runner: 'sync',
        scope,
      });

      expect(String(connection.requests[0].data)).toContain(
        '<testDeterminationStrategy sameProgram="false" assignedTests="true" appendAssignedTestsPreview="false"/>',
      );
    },
  );

  it.each(TOOLS)(
    "%s without scope: adt-clients' defaults, both runners",
    async (_name, handler, args) => {
      const asyncRun = recordingConnection([STARTED, FINISHED, RESULT]);
      await (handler as any)(ctx(asyncRun), args);
      expect(String(asyncRun.requests[0].data)).toContain(
        '<aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>',
      );

      const syncRun = recordingConnection([RESULT]);
      await (handler as any)(ctx(syncRun), { ...args, runner: 'sync' });
      expect(String(syncRun.requests[0].data)).toContain(
        '<testDeterminationStrategy sameProgram="true" assignedTests="false" appendAssignedTestsPreview="true"/>',
      );
    },
  );
});

describe('HandlerUnitTestRun: the runner the caller names, async by default', () => {
  const tests = [
    { container_class: 'zcl_a', test_class: 'ltc_a' },
    { container_class: 'zcl_a', test_class: 'ltc_b' },
    { container_class: 'zcl_b', test_class: 'ltc_c' },
  ];

  it.each([
    ['without runner', {}],
    ['runner async', { runner: 'async' }],
  ])(
    '%s: starts the run and answers its id, without waiting',
    async (_name, extra) => {
      const connection = recordingConnection([STARTED]);

      const result: any = await handleHandlerUnitTestRun(
        ctx(connection) as any,
        { tests, title: 'T', ...extra } as any,
      );

      expect(result.isError).toBe(false);
      expect(connection.requests.map(line)).toEqual([
        'POST /sap/bc/adt/abapunit/runs',
      ]);
      expect(String(connection.requests[0].data)).toContain('LTC_B');
      expect(payload(result)).toEqual({ success: true, run_id: RUN });
    },
  );

  it('runner sync: one POST /abapunit/testruns, each container once, the finished result', async () => {
    const connection = recordingConnection([FAILING_RESULT]);

    const result: any = await handleHandlerUnitTestRun(ctx(connection) as any, {
      tests,
      runner: 'sync',
      risk_level: { dangerous: true },
    });

    expect(result.isError).toBe(false);
    expect(connection.requests.map(line)).toEqual([
      'POST /sap/bc/adt/abapunit/testruns',
    ]);
    const body = String(connection.requests[0].data);
    expect(body.split('/sap/bc/adt/oo/classes/zcl_a"').length - 1).toBe(1);
    expect(body).toContain('/sap/bc/adt/oo/classes/zcl_b"');
    const answer = payload(result);
    expect(answer).toMatchObject({ runner: 'sync', finished: true });
    expect(answer.run_id).toBeUndefined();
    expect(JSON.stringify(answer.run_result)).toContain(
      'deliberate failure for the corpus',
    );
  });

  it('another runner is refused before any request', async () => {
    const connection = recordingConnection();

    const result: any = await handleHandlerUnitTestRun(ctx(connection) as any, {
      tests,
      runner: 'later' as any,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'runner must be one of async, sync',
    );
    expect(connection.requests).toHaveLength(0);
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
  // adt-clients 25.0.1 hands an include create the system context, so the
  // include is a create like any other: it needs a responsible.
  beforeEach(() => setSystemContext({ responsible: 'USER_PLACEHOLDER' }));
  afterEach(() => resetSystemContextCache());

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
  it('creates it under the group, writes it, then activates it, the group and its main program in one run', async () => {
    // create, LOCK, PUT, UNLOCK — then the run: its start answers the id in
    // `Location`, its status says finished, its results say activated.
    const connection = recordingConnection([
      undefined,
      undefined,
      undefined,
      undefined,
      {
        status: 202,
        headers: { location: '/sap/bc/adt/activation/runs/RUN-1' },
      },
      {
        data: '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>',
      },
      {
        data: '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/></chkl:messages>',
      },
    ]);

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
    // One run, without the pre-audit: activating the group alone with it is
    // answered by the inactive list, and the main program stays inactive.
    const runs = connection.requests.filter(
      (r) => r.method === 'POST' && r.url.includes('/activation'),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].url).toContain('/activation/runs');
    expect(runs[0].url).toContain('preauditRequested=false');
    const body = String(runs[0].data);
    expect(body).toContain(`adtcore:name="${include.toUpperCase()}"`);
    expect(body).toContain('adtcore:type="FUGR/F" adtcore:name="ZFG_X"');
    expect(body).toContain('adtcore:name="SAPLZFG_X"');
    // Then the run's status and its results: accepted is not done.
    expect(
      connection.requests.some((r) => r.url.includes('/activation/runs/RUN-1')),
    ).toBe(true);
  });

  it('an activation the run refused is a failure, not a success', async () => {
    const connection = recordingConnection([
      undefined,
      undefined,
      undefined,
      undefined,
      {
        status: 202,
        headers: { location: '/sap/bc/adt/activation/runs/RUN-2' },
      },
      {
        data: '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>',
      },
      {
        data: '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><msg objDescr="Function group ZFG_X" type="E" line="1"><shortText><txt>Syntax error</txt></shortText></msg><chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/></chkl:messages>',
      },
    ]);

    const result: any = await handleCreateFunctionGroupUnitTest(
      ctx(connection) as any,
      { function_group_name: 'zfg_x', test_class_source: 'x' },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Syntax error');
    // SAP reported it: SAP's refusal, with the step.
    expect(payload(result)).toMatchObject({
      origin: 'refusal',
      step: 'activate',
    });
  });

  it('a run that ended in error is a failure, even with no error message', async () => {
    const connection = recordingConnection([
      undefined,
      undefined,
      undefined,
      undefined,
      {
        status: 202,
        headers: { location: '/sap/bc/adt/activation/runs/RUN-3' },
      },
      {
        data: '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="error"/>',
      },
      { data: '' },
    ]);

    const result: any = await handleCreateFunctionGroupUnitTest(
      ctx(connection) as any,
      { function_group_name: 'zfg_x', test_class_source: 'x' },
    );

    expect(result.isError).toBe(true);
  });

  it('waits on the run with long polls and no timer of its own', async () => {
    const timer = jest.spyOn(global, 'setTimeout');
    try {
      // A run that never settles: six long polls, back to back, then a failure.
      const running = {
        data: '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="running"/>',
      };
      const connection = recordingConnection([
        undefined,
        undefined,
        undefined,
        undefined,
        {
          status: 202,
          headers: { location: '/sap/bc/adt/activation/runs/RUN-4' },
        },
        running,
        running,
        running,
        running,
        running,
        running,
        { data: '' },
      ]);

      const result: any = await handleCreateFunctionGroupUnitTest(
        ctx(connection) as any,
        { function_group_name: 'zfg_x', test_class_source: 'x' },
      );

      expect(result.isError).toBe(true);
      // Not SAP's refusal: our wait bound ran out, said as a failure on our
      // side — no `origin`, no status SAP never gave.
      const answered = payload(result);
      expect(answered.error).toBe('client_threw');
      expect(answered.origin).toBeUndefined();
      expect(answered.status).toBeUndefined();
      expect(answered.step).toBe('activate');
      expect(answered.message).toMatch(
        /had not finished after 6 polls — the wait bound ran out/,
      );
      const polls = connection.requests.filter((r) =>
        r.url.includes('/activation/runs/RUN-4?'),
      );
      expect(polls).toHaveLength(6);
      expect(polls.every((r) => r.url.includes('withLongPolling=true'))).toBe(
        true,
      );
      const ours = timer.mock.calls.filter(([, ms]) => ms === 1000);
      expect(ours).toHaveLength(0);
    } finally {
      timer.mockRestore();
    }
  });

  it("a function group's main program: SAPL<group>, namespace in front", () => {
    expect(functionGroupMainProgram('zfg_x')).toBe('SAPLZFG_X');
    expect(functionGroupMainProgram('/ns/group')).toBe('/NS/SAPLGROUP');
  });
});
