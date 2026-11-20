/**
 * Text elements, live, on both systems: each case creates its object in the
 * package the coverage suites create in (`ownPackage`), its name read free
 * first and recorded for cleanup before its create.
 *
 * - On premise: a program (symbols, selections, headings), a function group
 *   and a class (symbols). On the cloud: a function group and a class — the
 *   cloud creates both (measured 2026-11-19, `texts-translation.md` §13) — and
 *   the read of a delivered program the configuration names
 *   (`text_elements_cloud_read`).
 * - Each write lands inactive and the update tool's `activate: true`
 *   activates the object with its text elements (measured on both systems:
 *   the pair activated and left the inactive list, §8, §12.1, §13, §14).
 * - A part is written whole: an entry left out is deleted (Code, both
 *   systems: `lcl_textpool->save`; measured on both, §8, §14).
 *
 * The cleanup deletes every object and reads it absent.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import { getTestCase } from '../helpers/configHelpers';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import { skipRunningTest } from '../helpers/runningTest';
import {
  member,
  onPremise,
  onRequest,
  ownPackage,
  payloadOf,
  request,
  succeeded,
} from './ownObjects';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const N = {
  program: `ZMCP_TP_${SUFFIX}`,
  group: `ZMCP_TG${SUFFIX}`,
  class: `ZCL_MCP_TC_${SUFFIX}`,
};
const DESCRIPTION = 'MCP text elements live case';

/** Reads `read` free, records its delete, then creates the object. */
async function create(
  read: { tool: string; args: Record<string, unknown> },
  remove: { tool: string; args: Record<string, unknown> },
  createTool: string,
  createArgs: Record<string, unknown>,
): Promise<void> {
  await expectNameFree(read);
  recordCreated(remove.tool, { ...remove.args, ...onRequest() });
  succeeded(
    createTool,
    await livePrepare(createTool, { ...createArgs, ...onRequest() }),
  );
}

/** The text elements `kind` `name` answers at `version`. */
async function texts(
  kind: string,
  name: string,
  version: 'active' | 'inactive',
): Promise<unknown> {
  return payloadOf(
    succeeded(
      `GetTextElements ${kind} ${version}`,
      await liveCall('GetTextElements', {
        object_kind: kind,
        object_name: name,
        version,
      }),
    ),
  );
}

/** The keys of the symbols `read` answers. */
function symbolKeys(read: unknown): unknown[] {
  const symbols = member(read, 'symbols');
  return Array.isArray(symbols)
    ? symbols.map((symbol) => member(symbol, 'key'))
    : [];
}

/** Writes two symbols and activates, then writes the first alone. */
async function writeSymbols(kind: string, name: string): Promise<void> {
  succeeded(
    `UpdateTextElements ${kind}`,
    await liveCall('UpdateTextElements', {
      object_kind: kind,
      object_name: name,
      symbols: [
        { key: '001', text: 'First symbol', max_length: 20 },
        { key: '002', text: 'Second symbol', max_length: 20 },
      ],
      transport_request: request(),
      activate: false,
    }),
  );
  assert.deepEqual(symbolKeys(await texts(kind, name, 'inactive')), [
    '001',
    '002',
  ]);
  succeeded(
    `UpdateTextElements ${kind} first alone, activated`,
    await liveCall('UpdateTextElements', {
      object_kind: kind,
      object_name: name,
      symbols: [{ key: '001', text: 'First symbol', max_length: 20 }],
      transport_request: request(),
      activate: true,
    }),
  );
  assert.deepEqual(symbolKeys(await texts(kind, name, 'active')), ['001']);
}

liveSuite(['onprem', 'cloud'], 'Text elements', () => {
  after(async () => {
    await deleteRecorded();
    await expectAbsent({
      tool: 'GetFunctionGroup',
      args: { function_group_name: N.group },
    });
    await expectAbsent({ tool: 'GetClass', args: { class_name: N.class } });
  });

  it("a program's symbols, selections and headings", async () => {
    if (!onPremise()) {
      skipRunningTest('the cloud has no program of the customer to write');
      return;
    }
    await create(
      { tool: 'GetProgram', args: { program_name: N.program } },
      { tool: 'DeleteProgram', args: { program_name: N.program } },
      'CreateProgram',
      {
        program_name: N.program,
        description: DESCRIPTION,
        package_name: ownPackage(),
      },
    );
    succeeded(
      'UpdateProgram',
      await livePrepare('UpdateProgram', {
        program_name: N.program,
        source_code: [
          `REPORT ${N.program.toLowerCase()}.`,
          'PARAMETERS p_test TYPE c LENGTH 10.',
          "WRITE / 'text elements'.",
        ].join('\n'),
        activate: true,
        ...onRequest(),
      }),
    );
    await writeSymbols('program', N.program);
    succeeded(
      'UpdateTextElements program selections and headings',
      await liveCall('UpdateTextElements', {
        object_kind: 'program',
        object_name: N.program,
        selections: [{ name: 'P_TEST', text: 'Test parameter' }],
        headings: { list_header: 'List header', column_header_1: 'Column' },
        transport_request: request(),
        activate: true,
      }),
    );
    const read = await texts('program', N.program, 'active');
    assert.deepEqual(member(read, 'selections'), [
      { name: 'P_TEST', text: 'Test parameter', ddic_reference: false },
    ]);
    assert.equal(
      member(member(read, 'headings'), 'list_header'),
      'List header',
    );
    succeeded(
      'DeleteProgram',
      await liveCall('DeleteProgram', {
        program_name: N.program,
        ...onRequest(),
      }),
    );
    await expectAbsent({
      tool: 'GetProgram',
      args: { program_name: N.program },
    });
  });

  it("a function group's symbols", async () => {
    await create(
      { tool: 'GetFunctionGroup', args: { function_group_name: N.group } },
      {
        tool: 'DeleteFunctionGroup',
        args: { function_group_name: N.group },
      },
      'CreateFunctionGroup',
      {
        function_group_name: N.group,
        description: DESCRIPTION,
        package_name: ownPackage(),
        activate: true,
      },
    );
    await writeSymbols('function_group', N.group);
  });

  it("a class's symbols", async () => {
    await create(
      { tool: 'GetClass', args: { class_name: N.class } },
      { tool: 'DeleteClass', args: { class_name: N.class } },
      'CreateClass',
      {
        class_name: N.class,
        description: DESCRIPTION,
        package_name: ownPackage(),
      },
    );
    await writeSymbols('class', N.class);
  });

  it('the text elements of a delivered program, read on the cloud', async () => {
    if (onPremise()) {
      skipRunningTest('the delivered-program read is the cloud case');
      return;
    }
    const name = member(
      getTestCase('text_elements_cloud_read', 'read_delivered_program')?.params,
      'program_name',
    );
    if (typeof name !== 'string' || name === '') {
      skipRunningTest(
        'text_elements_cloud_read.test_cases[name=read_delivered_program].params.program_name is not set',
      );
      return;
    }
    const read = await texts('program', name, 'active');
    assert.equal(member(read, 'object_name'), name.toUpperCase());
  });
});
