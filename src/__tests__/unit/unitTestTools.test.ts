/**
 * The unit-test tools, one per carrier, against the real adt-clients over a
 * recording connection: what each writes, where, under which lock, and what a
 * run answers.
 *
 * The runs answer the captured corpus documents of a passing class run
 * (`unittest-run-passing--*`); the run is the same resource whichever object
 * started it, so one capture serves every Run* tool.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import {
  TOOL_DEFINITION as HandlerUnitTestRun,
  handleHandlerUnitTestRun,
} from '../../../compact-modify/src/handlers/handleHandlerUnitTestRun';
import { handleCreateFunctionGroupUnitTest } from '../../handlers/unit_test/high/handleCreateFunctionGroupUnitTest';
import { handleCreateProgramUnitTest } from '../../handlers/unit_test/high/handleCreateProgramUnitTest';
import { handleCreateUnitTest } from '../../handlers/unit_test/high/handleCreateUnitTest';
import {
  handleRunFunctionGroupUnitTest,
  TOOL_DEFINITION as RunFunctionGroupUnitTest,
} from '../../handlers/unit_test/high/handleRunFunctionGroupUnitTest';
import {
  handleRunFunctionModuleUnitTest,
  TOOL_DEFINITION as RunFunctionModuleUnitTest,
} from '../../handlers/unit_test/high/handleRunFunctionModuleUnitTest';
import {
  handleRunProgramUnitTest,
  TOOL_DEFINITION as RunProgramUnitTest,
} from '../../handlers/unit_test/high/handleRunProgramUnitTest';
import {
  handleRunUnitTest,
  TOOL_DEFINITION as RunUnitTest,
} from '../../handlers/unit_test/high/handleRunUnitTest';
import { handleUpdateProgramUnitTest } from '../../handlers/unit_test/high/handleUpdateProgramUnitTest';
import {
  functionGroupMainProgram,
  functionGroupTestInclude,
  programTestInclude,
} from '../../handlers/unit_test/shared/writeTests';
import {
  defineTool,
  type HandlerContext,
  type ToolArgs,
} from '../../lib/handlers/interfaces';
import { resetSystemContextCache } from '../../lib/systemContext';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject, assertRejects } from '../helpers/assertions';
import { moduleInGroup } from '../helpers/functionModuleMetadata';
import { setSystemContext } from '../helpers/processSystemContext';
import {
  LOCK_SUCCESS_XML,
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

/**
 * What a call reads before its run, answered: a function module addressed
 * through its group has its metadata read first, naming that group (#2).
 */
function readFirst(args: Readonly<Record<string, unknown>>) {
  const group = args.function_group_name;
  const module = args.function_module_name;
  return typeof group === 'string' && typeof module === 'string'
    ? [moduleInGroup(module.toUpperCase(), group.toUpperCase())]
    : [];
}

/** The request lines of what `readFirst` answers. */
const firstLines = (args: Readonly<Record<string, unknown>>) =>
  readFirst(args).length === 0
    ? []
    : [
        `GET /sap/bc/adt/functions/groups/${String(args.function_group_name).toLowerCase()}/fmodules/${String(args.function_module_name).toLowerCase()}`,
      ];
const payload = (result: any) => JSON.parse(result.content[0].text);

describe('Run* tools: start, wait, answer the result — one call', () => {
  for (const [_name, handler, args, type, name] of [
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
  ] as const) {
    it(
      format(
        '%s names its object as %s, polls, and answers the finished result',
        _name,
        handler,
      ),
      async () => {
        const connection = recordingConnection([STARTED, FINISHED, RESULT]);

        const result: any = await (handler as any)(ctx(connection), args);

        assert.equal(result.isError, false);
        assert.deepStrictEqual(connection.requests.map(line), [
          'POST /sap/bc/adt/abapunit/runs',
          `GET /sap/bc/adt/abapunit/runs/${RUN}`,
          `GET /sap/bc/adt/abapunit/results/${RUN}`,
        ]);
        assert.ok(
          String(connection.requests[0].data).includes(
            `<osl:object name="${name}" type="${type}"/>`,
          ),
        );
        const answer = payload(result);
        assert.equal(answer.finished, true);
        assert.equal(answer.run_id, RUN);
        assert.ok(JSON.stringify(answer.run_result).includes('TEST_METHOD'));
      },
    );
  }

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

    assert.equal(result.isError, false);
    assert.deepStrictEqual(connection.requests.map(line), [
      'POST /sap/bc/adt/abapunit/runs',
    ]);
    assert.deepStrictEqual(payload(result), { success: true, run_id: RUN });
  });

  it('is an error, and asks nothing more, when no run was started', async () => {
    const connection = recordingConnection([{ status: 200, headers: {} }]);

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
    });

    assert.equal(result.isError, true);
    assert.equal(connection.requests.length, 1);
  });
});

/** A run that failed one test: the result document, a failed assertion inside. */
const FAILING_RESULT = {
  data: corpusBody(
    'refusal-unittest-run-failing--03-results-fa53c505dd7b1fd1abb859f1193d5d44',
  ),
};

describe('Run* tools with runner sync: one request, the finished result', () => {
  for (const [_name, handler, args, uri] of [
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
  ] as const) {
    it(
      format(
        '%s posts the object to /abapunit/testruns once and answers the result',
        _name,
      ),
      async () => {
        const first = readFirst(args);
        const connection = recordingConnection([...first, RESULT]);

        const result: any = await (handler as any)(ctx(connection), {
          ...args,
          runner: 'sync',
        });

        assert.equal(result.isError, false);
        assert.deepStrictEqual(connection.requests.map(line), [
          ...firstLines(args),
          'POST /sap/bc/adt/abapunit/testruns',
        ]);
        assert.ok(
          String(connection.requests[first.length].data)
            .toLowerCase()
            .includes(uri),
        );
        const answer = payload(result);
        assertMatchObject(answer, { runner: 'sync', finished: true });
        assert.equal(answer.run_id, undefined);
        assert.ok(JSON.stringify(answer.run_result).includes('TEST_METHOD'));
      },
    );
  }

  it('a failing test is in the result, not a refusal', async () => {
    const connection = recordingConnection([FAILING_RESULT]);

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
      runner: 'sync',
    });

    assert.equal(result.isError, false);
    assert.ok(
      JSON.stringify(payload(result).run_result).includes(
        'deliberate failure for the corpus',
      ),
    );
  });

  it("detail raw answers SAP's document as it came", async () => {
    const connection = recordingConnection([RESULT]);

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
      runner: 'sync',
      detail: 'raw',
    });

    // A run tool assembles reads (a start, its status, its result), so its
    // raw is the array of the documents, a synchronous run's one too.
    assert.equal(
      result.content[0].text,
      JSON.stringify([{ status: 200, body: RESULT.data }]),
    );
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

    assert.equal(result.isError, true);
    assertMatchObject(payload(result), { step: 'run' });
    assert.equal(connection.requests.length, 1);
  });

  it('a function module with runner sync and no function group is refused before any request', async () => {
    const connection = recordingConnection();

    const result: any = await handleRunFunctionModuleUnitTest(
      ctx(connection) as any,
      { function_module_name: 'Z_FM_X', runner: 'sync' },
    );

    assert.equal(result.isError, true);
    assert.ok(
      result.content[0].text.includes('function_group_name is required'),
    );
    assert.equal(connection.requests.length, 0);
  });

  for (const [_name, call, args] of [
    [
      'RunUnitTest',
      (c: HandlerContext, args: ToolArgs) =>
        defineTool(RunUnitTest, handleRunUnitTest).call(c, args),
      { class_name: 'ZCL_X' },
    ],
    [
      'RunProgramUnitTest',
      (c: HandlerContext, args: ToolArgs) =>
        defineTool(RunProgramUnitTest, handleRunProgramUnitTest).call(c, args),
      { program_name: 'ZR_X' },
    ],
    [
      'RunFunctionGroupUnitTest',
      (c: HandlerContext, args: ToolArgs) =>
        defineTool(
          RunFunctionGroupUnitTest,
          handleRunFunctionGroupUnitTest,
        ).call(c, args),
      { function_group_name: 'ZFG_X' },
    ],
    [
      'RunFunctionModuleUnitTest',
      (c: HandlerContext, args: ToolArgs) =>
        defineTool(
          RunFunctionModuleUnitTest,
          handleRunFunctionModuleUnitTest,
        ).call(c, args),
      { function_module_name: 'Z_FM_X' },
    ],
  ] as const) {
    it(
      format(
        "%s: the tool's schema refuses another runner before any request",
        _name,
      ),
      async () => {
        const connection = recordingConnection();

        const refused = assertRejects(
          call(ctx(connection) as any, { ...args, runner: 'later' }),
          'runner',
        );
        await refused;
        assert.equal(connection.requests.length, 0);
      },
    );
  }

  it('runner async is the default flow: start, poll, result', async () => {
    const connection = recordingConnection([STARTED, FINISHED, RESULT]);

    const result: any = await handleRunUnitTest(ctx(connection) as any, {
      class_name: 'ZCL_X',
      runner: 'async',
    });

    assert.deepStrictEqual(connection.requests.map(line), [
      'POST /sap/bc/adt/abapunit/runs',
      `GET /sap/bc/adt/abapunit/runs/${RUN}`,
      `GET /sap/bc/adt/abapunit/results/${RUN}`,
    ]);
    assertMatchObject(payload(result), { run_id: RUN, finished: true });
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

  for (const [_name, handler, args] of TOOLS) {
    it(
      format('%s async: the scope given is the run configuration', _name),
      async () => {
        const first = readFirst(args);
        const connection = recordingConnection([
          ...first,
          STARTED,
          FINISHED,
          RESULT,
        ]);

        await (handler as any)(ctx(connection), { ...args, scope });

        assert.ok(
          String(connection.requests[first.length].data).includes(
            '<aunit:scope ownTests="false" foreignTests="true" addForeignTestsAsPreview="false"/>',
          ),
        );
      },
    );
  }

  for (const [_name, handler, args] of TOOLS) {
    it(
      format('%s sync: the scope given is the run configuration', _name),
      async () => {
        const first = readFirst(args);
        const connection = recordingConnection([...first, RESULT]);

        await (handler as any)(ctx(connection), {
          ...args,
          runner: 'sync',
          scope,
        });

        assert.ok(
          String(connection.requests[first.length].data).includes(
            '<testDeterminationStrategy sameProgram="false" assignedTests="true" appendAssignedTestsPreview="false"/>',
          ),
        );
      },
    );
  }

  for (const [_name, handler, args] of TOOLS) {
    it(
      format("%s without scope: adt-clients' defaults, both runners", _name),
      async () => {
        const first = readFirst(args);
        const asyncRun = recordingConnection([
          ...first,
          STARTED,
          FINISHED,
          RESULT,
        ]);
        await (handler as any)(ctx(asyncRun), args);
        assert.ok(
          String(asyncRun.requests[first.length].data).includes(
            '<aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>',
          ),
        );

        const syncRun = recordingConnection([...first, RESULT]);
        await (handler as any)(ctx(syncRun), { ...args, runner: 'sync' });
        assert.ok(
          String(syncRun.requests[first.length].data).includes(
            '<testDeterminationStrategy sameProgram="true" assignedTests="false" appendAssignedTestsPreview="true"/>',
          ),
        );
      },
    );
  }
});

describe('HandlerUnitTestRun: the runner the caller names, async by default', () => {
  const tests = [
    { container_class: 'zcl_a', test_class: 'ltc_a' },
    { container_class: 'zcl_a', test_class: 'ltc_b' },
    { container_class: 'zcl_b', test_class: 'ltc_c' },
  ];

  for (const [_name, extra] of [
    ['without runner', {}],
    ['runner async', { runner: 'async' }],
  ] satisfies [string, Record<string, string>][]) {
    it(
      format('%s: starts the run and answers its id, without waiting', _name),
      async () => {
        const connection = recordingConnection([STARTED]);

        const result: any = await handleHandlerUnitTestRun(
          ctx(connection) as any,
          { tests, title: 'T', ...extra } as any,
        );

        assert.equal(result.isError, false);
        assert.deepStrictEqual(connection.requests.map(line), [
          'POST /sap/bc/adt/abapunit/runs',
        ]);
        assert.ok(String(connection.requests[0].data).includes('LTC_B'));
        assert.deepStrictEqual(payload(result), { success: true, run_id: RUN });
      },
    );
  }

  it('runner sync: one POST /abapunit/testruns, each container once, the finished result', async () => {
    const connection = recordingConnection([FAILING_RESULT]);

    const result: any = await handleHandlerUnitTestRun(ctx(connection) as any, {
      tests,
      runner: 'sync',
      risk_level: { dangerous: true },
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(connection.requests.map(line), [
      'POST /sap/bc/adt/abapunit/testruns',
    ]);
    const body = String(connection.requests[0].data);
    assert.equal(body.split('/sap/bc/adt/oo/classes/zcl_a"').length - 1, 1);
    assert.ok(body.includes('/sap/bc/adt/oo/classes/zcl_b"'));
    const answer = payload(result);
    assertMatchObject(answer, { runner: 'sync', finished: true });
    assert.equal(answer.run_id, undefined);
    assert.ok(
      JSON.stringify(answer.run_result).includes(
        'deliberate failure for the corpus',
      ),
    );
  });

  it("the tool's schema refuses another runner before any request", async () => {
    const connection = recordingConnection();

    const refused = assertRejects(
      defineTool(HandlerUnitTestRun, handleHandlerUnitTestRun).call(
        ctx(connection) as any,
        { tests, runner: 'later' },
      ),
      'runner',
    );
    await refused;
    assert.equal(connection.requests.length, 0);
  });
});

describe('CreateUnitTest: the class test include, under the class lock', () => {
  it('locks the class, writes the include, unlocks, activates', async () => {
    const connection = recordingConnection();

    const result: any = await handleCreateUnitTest(ctx(connection) as any, {
      class_name: 'zcl_x',
      test_class_source: 'CLASS ltc DEFINITION FOR TESTING. ENDCLASS.',
    });

    assert.equal(result.isError, false);
    const writes = connection.requests.filter((r) => r.method === 'PUT');
    assert.equal(writes.length, 1);
    assert.ok(writes[0].url.includes('/oo/classes/zcl_x/includes/testclasses'));
    assert.ok(String(writes[0].data).includes('FOR TESTING'));
    assert.equal(
      connection.requests.some((r) => r.url.includes('_action=LOCK')),
      true,
    );
    assert.equal(
      connection.requests.some((r) => r.url.includes('_action=UNLOCK')),
      true,
    );
    assert.ok(connection.requests.at(-1)?.url.includes('/activation'));
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

    assert.equal(result.isError, false);
    const include = programTestInclude('zr_x').toLowerCase();
    const created = connection.requests.find(
      (r) =>
        r.method === 'POST' &&
        r.url.split('?')[0].endsWith('/programs/includes'),
    );
    assert.ok(String(created?.data).includes('adtcore:name="ZPKG"'));
    const puts = connection.requests.filter((r) => r.method === 'PUT');
    assert.deepStrictEqual(
      puts.map((r) => r.url.split('?')[0]),
      [
        `/sap/bc/adt/programs/includes/${include}/source/main`,
        '/sap/bc/adt/programs/programs/zr_x/source/main',
      ],
    );
    assert.ok(String(puts[1].data).includes(`INCLUDE ${include}.`));
    // The report is read under its lock and written under the same one, so
    // nothing saved in between can be overwritten.
    const reportRequests = connection.requests
      .map((r) => line(r).toLowerCase())
      .filter((l) => l.includes('/programs/programs/zr_x'));
    // metadata, then lock → read → write → unlock
    assert.deepStrictEqual(reportRequests, [
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
    assert.ok(reportLock > -1);
    assert.ok(reportRead > reportLock);
    const activations = connection.requests.filter((r) =>
      r.url.includes('/activation'),
    );
    assert.equal(activations.length, 2);
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
    assert.equal(puts.length, 1);
    assert.ok(puts[0].url.includes(`/programs/includes/${include}/`));
  });

  it('UpdateProgramUnitTest rewrites the include only — no create, no report write', async () => {
    const connection = recordingConnection();

    const result: any = await handleUpdateProgramUnitTest(
      ctx(connection) as any,
      { program_name: 'zr_x', test_class_source: 'x' },
    );

    assert.equal(result.isError, false);
    assert.equal(
      connection.requests.some(
        (r) =>
          r.method === 'POST' &&
          r.url.split('?')[0].endsWith('/programs/includes'),
      ),
      false,
    );
    const puts = connection.requests.filter((r) => r.method === 'PUT');
    assert.equal(puts.length, 1);
    assert.ok(
      puts[0].url.includes(
        `/programs/includes/${programTestInclude('zr_x').toLowerCase()}/`,
      ),
    );
  });
});

describe('test include names', () => {
  it("a report's is the report's name with _T99", () => {
    assert.equal(programTestInclude('zr_x'), 'ZR_X_T99');
    assert.equal(programTestInclude('/ns/zr_x'), '/NS/ZR_X_T99');
  });

  it("a function group's follows its main program: L<group>, namespace in front", () => {
    assert.equal(functionGroupTestInclude('zfg_x'), 'LZFG_XT99');
    assert.equal(functionGroupTestInclude('/ns/group'), '/NS/LGROUPT99');
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

    assert.equal(result.isError, false);
    const include = functionGroupTestInclude('zfg_x').toLowerCase();
    assert.equal(
      connection.requests.some(
        (r) =>
          r.method === 'POST' &&
          r.url.includes('/functions/groups/zfg_x/includes'),
      ),
      true,
    );
    const puts = connection.requests.filter((r) => r.method === 'PUT');
    assert.equal(puts.length, 1);
    assert.ok(
      puts[0].url.toLowerCase().includes(`/includes/${include}/source/main`),
    );
    // One run, without the pre-audit: activating the group alone with it is
    // answered by the inactive list, and the main program stays inactive.
    const runs = connection.requests.filter(
      (r) => r.method === 'POST' && r.url.includes('/activation'),
    );
    assert.equal(runs.length, 1);
    assert.ok(runs[0].url.includes('/activation/runs'));
    assert.ok(runs[0].url.includes('preauditRequested=false'));
    const body = String(runs[0].data);
    assert.ok(body.includes(`adtcore:name="${include.toUpperCase()}"`));
    assert.ok(body.includes('adtcore:type="FUGR/F" adtcore:name="ZFG_X"'));
    assert.ok(body.includes('adtcore:name="SAPLZFG_X"'));
    // Then the run's status and its results: accepted is not done.
    assert.equal(
      connection.requests.some((r) => r.url.includes('/activation/runs/RUN-1')),
      true,
    );
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

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('Syntax error'));
    // SAP reported it: SAP's refusal, with the step.
    assertMatchObject(payload(result), {
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

    assert.equal(result.isError, true);
  });

  it('waits on the run with long polls and no timer of its own, past six reads', async (t) => {
    const timer = t.mock.method(global, 'setTimeout');
    try {
      // A run still going for seven reads, then finished: long polls back
      // to back, no attempt limit, then the results.
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
        running,
        {
          data: '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>',
        },
        { data: '' },
      ]);

      const result: any = await handleCreateFunctionGroupUnitTest(
        ctx(connection) as any,
        { function_group_name: 'zfg_x', test_class_source: 'x' },
      );

      assert.equal(result.isError, false);
      const polls = connection.requests.filter((r) =>
        r.url.includes('/activation/runs/RUN-4?'),
      );
      assert.equal(polls.length, 8);
      assert.equal(
        polls.every((r) => r.url.includes('withLongPolling=true')),
        true,
      );
      assert.equal(
        connection.requests.some((r) =>
          r.url.includes('/activation/results/RUN-4'),
        ),
        true,
      );
      const ours = timer.mock.calls.filter(
        (call) => call.arguments[1] === 1000,
      );
      assert.equal(ours.length, 0);
    } finally {
      timer.mock.restore();
    }
  });

  it('a run status nobody knows ends the write as a failure on our side, naming it', async () => {
    // Past READ_BOUND reads the double refuses and records it: a wait that
    // does not end fails the case. The bound is this test's alone.
    const READ_BOUND = 5;
    const paused = {
      data: '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="paused"/>',
    };
    const connection = recordingConnection([
      undefined,
      undefined,
      undefined,
      undefined,
      {
        status: 202,
        headers: { location: '/sap/bc/adt/activation/runs/RUN-5' },
      },
      ...Array.from({ length: READ_BOUND }, () => paused),
    ]);
    const reads = { count: 0, overRead: false };
    const answer = connection.makeAdtRequest.bind(connection);
    connection.makeAdtRequest = (options) => {
      if (options.url.startsWith('/sap/bc/adt/activation/runs/RUN-5')) {
        reads.count += 1;
        if (reads.count > READ_BOUND) {
          reads.overRead = true;
          throw new Error('the run was read past the test bound');
        }
      }
      return answer(options);
    };

    const result: any = await handleCreateFunctionGroupUnitTest(
      ctx(connection) as any,
      { function_group_name: 'zfg_x', test_class_source: 'x' },
    );

    assert.equal(reads.overRead, false);
    assert.equal(reads.count, 1);
    assert.equal(result.isError, true);
    const answered = payload(result);
    assert.equal(answered.error, 'client_threw');
    assert.equal(answered.origin, undefined);
    assert.equal(answered.status, undefined);
    assert.equal(answered.step, 'activate');
    assert.ok(
      answered.message.includes(
        'The activation run RUN-5 answered the status "paused"',
      ),
    );
    assert.equal(
      connection.requests.some((r) => r.url.includes('/activation/results/')),
      false,
    );
  });

  it('a run start with no run id ends the write as a failure on our side', async () => {
    const connection = recordingConnection([
      undefined,
      undefined,
      undefined,
      undefined,
      { status: 202 },
    ]);

    const result: any = await handleCreateFunctionGroupUnitTest(
      ctx(connection) as any,
      { function_group_name: 'zfg_x', test_class_source: 'x' },
    );

    assert.equal(result.isError, true);
    const answered = payload(result);
    assert.equal(answered.error, 'client_threw');
    assert.equal(answered.origin, undefined);
    assert.equal(answered.status, undefined);
    assert.equal(answered.step, 'activate');
    assert.ok(answered.message.includes('The activation run answered no id'));
    assert.equal(
      connection.requests.some((r) => r.url.includes('/activation/runs/')),
      false,
    );
    assert.equal(
      connection.requests.some((r) => r.url.includes('/activation/results/')),
      false,
    );
  });

  it("a function group's main program: SAPL<group>, namespace in front", () => {
    assert.equal(functionGroupMainProgram('zfg_x'), 'SAPLZFG_X');
    assert.equal(functionGroupMainProgram('/ns/group'), '/NS/SAPLGROUP');
  });
});

/**
 * The function-group test include is activated with the group and its main
 * program on the endpoint the system's discovery offers
 * (fr0ster/mcp-abap-adt#351): the run where it lists
 * `/sap/bc/adt/activation/runs`, else the one `POST /sap/bc/adt/activation`.
 * The discoveries are the recorded ones of SAP_BASIS 7.40, the 751 partial
 * one and S/4HANA 2025; the 751 answers to the synchronous POST are the
 * recorded `activation-sync-activated-751` (an empty `200`: activated) and
 * `activation-preaudit-still-inactive-751` (the objects still inactive).
 */
describe('CreateFunctionGroupUnitTest: the activation endpoint by discovery', () => {
  const RUN_FINISHED =
    '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>';
  const RUN_ACTIVATED =
    '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/></chkl:messages>';

  /** A connection answering by request: the discovery and the activation as given, everything else `200`. */
  function system(discovery: string, activation = '') {
    const lines: string[] = [];
    const connection: IAbapConnection = {
      async connect() {},
      async getBaseUrl() {
        return 'https://example.com';
      },
      getSessionId() {
        return null;
      },
      setSessionType() {},
      async makeAdtRequest<T = unknown, D = unknown>(
        options: IAbapRequestOptions,
      ): Promise<IAdtWireResponse<T, D>> {
        lines.push(`${options.method} ${options.url.split('?')[0]}`);
        const url = options.url;
        let data = '';
        let headers: Record<string, string> = {};
        let status = 200;
        if (url === '/sap/bc/adt/discovery') data = discovery;
        else if (url.includes('_action=LOCK')) data = LOCK_SUCCESS_XML;
        else if (url.startsWith('/sap/bc/adt/activation/runs?')) {
          status = 202;
          headers = { location: '/sap/bc/adt/activation/runs/RUN-9' };
        } else if (url.startsWith('/sap/bc/adt/activation/runs/RUN-9'))
          data = RUN_FINISHED;
        else if (url.startsWith('/sap/bc/adt/activation/results/RUN-9'))
          data = RUN_ACTIVATED;
        else if (url.startsWith('/sap/bc/adt/activation?')) data = activation;
        // A recorded body is text; `T` is the caller's view of it, which a
        // replay does not narrow — the assertion every fake connection makes.
        return { data: data as T, status, statusText: 'OK', headers };
      },
    };
    return { connection, lines };
  }

  const create = (connection: IAbapConnection) =>
    handleCreateFunctionGroupUnitTest(ctx(connection) as any, {
      function_group_name: 'zfg_x',
      test_class_source: 'x',
    });

  for (const [_what, name] of [
    ['SAP_BASIS 7.40', 'system-description-basis-740--03-discovery'],
    ['751 (partial)', 'system-description-751-partial--01-discovery'],
  ]) {
    it(
      format(
        '%s lists no /activation/runs: the discovery, then one POST /activation',
        _what,
      ),
      async () => {
        const { connection, lines } = system(
          corpusBody(name),
          corpusBody('activation-sync-activated-751--01-activation'),
        );
        const result: any = await create(connection);
        assert.equal(result.isError, false);
        const activation = lines.slice(
          lines.indexOf('GET /sap/bc/adt/discovery'),
        );
        assert.deepStrictEqual(activation, [
          'GET /sap/bc/adt/discovery',
          'POST /sap/bc/adt/activation',
        ]);
      },
    );
  }

  it('S/4HANA 2025 lists /activation/runs: the discovery, then the run', async () => {
    const { connection, lines } = system(
      corpusBody('system-description-s4-2025--03-discovery'),
    );
    const result: any = await create(connection);
    assert.equal(result.isError, false);
    assert.deepStrictEqual(
      lines.slice(lines.indexOf('GET /sap/bc/adt/discovery')),
      [
        'GET /sap/bc/adt/discovery',
        'POST /sap/bc/adt/activation/runs',
        'GET /sap/bc/adt/activation/runs/RUN-9',
        'GET /sap/bc/adt/activation/results/RUN-9',
      ],
    );
  });

  it('751: the objects still inactive after the POST are an error naming them', async () => {
    const { connection } = system(
      corpusBody('system-description-751-partial--01-discovery'),
      corpusBody('activation-preaudit-still-inactive-751--01-activation'),
    );
    const result: any = await create(connection);
    assert.equal(result.isError, true);
    assert.equal(payload(result).step, 'activate');
    assert.ok(payload(result).still_inactive?.length > 0);
  });
});
