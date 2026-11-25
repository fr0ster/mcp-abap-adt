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
 * - `ActivateObjects` takes the text elements as references: the program
 *   alone leaves `PROG/PX` in `still_inactive` (measured on premise, §8),
 *   and each object named with its text elements activates both (§8, §10,
 *   §12.1, §13.4). Where-used of a program's and of a function group's text
 *   elements is answered (`PROG/PX` with its `container`, §11, §13.6).
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
  holdLock,
  lockReleased,
  member,
  onPremise,
  onRequest,
  ownPackage,
  payloadOf,
  releaseHeldLocks,
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

/** The text elements `kind` `name` answers at `version`, as a prerequisite read. */
async function texts(
  kind: string,
  name: string,
  version: 'active' | 'inactive',
): Promise<unknown> {
  return payloadOf(
    succeeded(
      `GetTextElements ${kind} ${version}`,
      await livePrepare('GetTextElements', {
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

/** Two symbols written, left inactive: the case then writes the first alone. */
async function twoSymbols(kind: string, name: string): Promise<void> {
  succeeded(
    `UpdateTextElements ${kind} two symbols`,
    await livePrepare('UpdateTextElements', {
      object_kind: kind,
      object_name: name,
      symbols: [
        { key: '001', text: 'First symbol', max_length: 20 },
        { key: '002', text: 'Second symbol', max_length: 20 },
      ],
      activate: false,
      ...onRequest(),
    }),
  );
  assert.deepEqual(symbolKeys(await texts(kind, name, 'inactive')), [
    '001',
    '002',
  ]);
}

/** `ActivateObjects` of `objects`, answered as SAP answered it. */
async function activateObjects(
  objects: { name: string; type: string; parentName?: string }[],
) {
  return livePrepare('ActivateObjects', { objects });
}

/** The types `still_inactive` of an answer names. */
function stillInactiveTypes(text: string): unknown[] {
  const listed = member(JSON.parse(text), 'still_inactive');
  return Array.isArray(listed)
    ? listed.map((entry) => member(entry, 'type'))
    : [];
}

/** The where-used of text elements in `container`: SAP answers a list. */
async function textElementsWhereUsed(
  name: string,
  container: 'program' | 'function_group',
): Promise<void> {
  succeeded(
    `GetWhereUsed PROG/PX ${container}`,
    await livePrepare('GetWhereUsed', {
      object_name: name,
      object_type: 'PROG/PX',
      container,
    }),
  );
}

liveSuite(['onprem', 'cloud'], 'Text elements', () => {
  after(async () => {
    await releaseHeldLocks();
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
    await twoSymbols('program', N.program);
    // The program alone runs nothing: its text elements are still inactive
    // (measured on premise, `texts-translation.md` §8).
    const alone = await activateObjects([{ name: N.program, type: 'PROG/P' }]);
    assert.equal(alone.isError, true, alone.text);
    assert.ok(stillInactiveTypes(alone.text).includes('PROG/PX'), alone.text);
    // Both named: both activate (§8, §10).
    succeeded(
      'ActivateObjects program pair',
      await activateObjects([
        { name: N.program, type: 'PROG/P' },
        { name: N.program, type: 'PROG/PX' },
      ]),
    );
    await textElementsWhereUsed(N.program, 'program');
    await twoSymbols('program', N.program);
    // The text elements alone activate (measured on premise, §10 steps
    // 51–52).
    const activated = await liveCall('HandlerActivate', {
      object_type: 'PROGRAM_TEXT_ELEMENTS',
      object_name: N.program,
    });
    succeeded('HandlerActivate PROGRAM_TEXT_ELEMENTS', activated);
    const written = await liveCall('UpdateTextElements', {
      object_kind: 'program',
      object_name: N.program,
      symbols: [{ key: '001', text: 'First symbol', max_length: 20 }],
      selections: [{ name: 'P_TEST', text: 'Test parameter' }],
      headings: { list_header: 'List header', column_header_1: 'Column' },
      transport_request: request(),
      activate: true,
    });
    succeeded('UpdateTextElements program', written);
    const read = await liveCall('GetTextElements', {
      object_kind: 'program',
      object_name: N.program,
      version: 'active',
    });
    const texts = payloadOf(succeeded('GetTextElements program', read));
    assert.deepEqual(symbolKeys(texts), ['001']);
    assert.deepEqual(member(texts, 'selections'), [
      { name: 'P_TEST', text: 'Test parameter', ddic_reference: false },
    ]);
    assert.equal(
      member(member(texts, 'headings'), 'list_header'),
      'List header',
    );
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
    await twoSymbols('function_group', N.group);
    // The group and its text elements, at the group's address (§12.1, §13.4).
    succeeded(
      'ActivateObjects function group pair',
      await activateObjects([
        { name: N.group, type: 'FUGR/F' },
        { name: N.group, type: 'PROG/PX', parentName: N.group },
      ]),
    );
    await textElementsWhereUsed(N.group, 'function_group');
    await twoSymbols('function_group', N.group);
    // The text elements alone activate (measured on premise, §12.1).
    const activated = await liveCall('HandlerActivate', {
      object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
      object_name: N.group,
    });
    succeeded('HandlerActivate FUNCTION_GROUP_TEXT_ELEMENTS', activated);
    const written = await liveCall('UpdateTextElements', {
      object_kind: 'function_group',
      object_name: N.group,
      symbols: [{ key: '001', text: 'First symbol', max_length: 20 }],
      transport_request: request(),
      activate: true,
    });
    succeeded('UpdateTextElements function group', written);
    const read = await liveCall('GetTextElements', {
      object_kind: 'function_group',
      object_name: N.group,
      version: 'active',
    });
    assert.deepEqual(
      symbolKeys(payloadOf(succeeded('GetTextElements function group', read))),
      ['001'],
    );
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
    await twoSymbols('class', N.class);
    // The class and its text elements (measured on both, §8, §14).
    succeeded(
      'ActivateObjects class pair',
      await activateObjects([
        { name: N.class, type: 'CLAS/OC' },
        { name: N.class, type: 'CLAS/OCX' },
      ]),
    );
    await twoSymbols('class', N.class);
    // The class's text elements alone: unverified until this run (the pair
    // is measured, §8, §14).
    const activated = await liveCall('HandlerActivate', {
      object_type: 'CLASS_TEXT_ELEMENTS',
      object_name: N.class,
    });
    succeeded('HandlerActivate CLASS_TEXT_ELEMENTS', activated);
    const written = await liveCall('UpdateTextElements', {
      object_kind: 'class',
      object_name: N.class,
      symbols: [{ key: '001', text: 'First symbol', max_length: 20 }],
      transport_request: request(),
      activate: true,
    });
    succeeded('UpdateTextElements class', written);
    const read = await liveCall('GetTextElements', {
      object_kind: 'class',
      object_name: N.class,
      version: 'active',
    });
    assert.deepEqual(
      symbolKeys(payloadOf(succeeded('GetTextElements class', read))),
      ['001'],
    );
  });

  it("compact: a program's text elements locked, written, unlocked, activated and read", async () => {
    if (!onPremise()) {
      skipRunningTest('the cloud has no program of the customer to write');
      return;
    }
    const locked = await liveCall('HandlerLock', {
      object_type: 'PROGRAM_TEXT_ELEMENTS',
      object_name: N.program,
    });
    const handle = member(
      payloadOf(succeeded('HandlerLock PROGRAM_TEXT_ELEMENTS', locked)),
      'lock_handle',
    );
    assert.equal(typeof handle, 'string', locked.text);
    if (typeof handle === 'string') {
      holdLock({
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        object_name: N.program,
        lock_handle: handle,
      });
    }
    const written = await liveCall('HandlerUpdate', {
      object_type: 'PROGRAM_TEXT_ELEMENTS',
      program_name: N.program,
      symbols: [{ key: '003', text: 'Compact symbol', max_length: 20 }],
      lock_handle: handle,
      transport_request: request(),
    });
    const unlocked = await liveCall('HandlerLock', {
      action: 'unlock',
      object_type: 'PROGRAM_TEXT_ELEMENTS',
      object_name: N.program,
      lock_handle: handle,
    });
    if (unlocked.isError !== true) lockReleased(String(handle));
    succeeded('HandlerUpdate PROGRAM_TEXT_ELEMENTS', written);
    succeeded('HandlerUnlock PROGRAM_TEXT_ELEMENTS', unlocked);
    succeeded(
      'HandlerActivate PROGRAM_TEXT_ELEMENTS',
      await livePrepare('HandlerActivate', {
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        object_name: N.program,
      }),
    );
    const read = await liveCall('HandlerGet', {
      object_type: 'PROGRAM_TEXT_ELEMENTS',
      part: 'source',
      program_name: N.program,
      version: 'active',
    });
    assert.deepEqual(
      symbolKeys(
        payloadOf(succeeded('HandlerGet PROGRAM_TEXT_ELEMENTS', read)),
      ),
      ['003'],
    );
  });

  it("compact: a function group's text elements locked, written, unlocked, activated and read", async () => {
    const locked = await liveCall('HandlerLock', {
      object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
      object_name: N.group,
    });
    const handle = member(
      payloadOf(succeeded('HandlerLock FUNCTION_GROUP_TEXT_ELEMENTS', locked)),
      'lock_handle',
    );
    assert.equal(typeof handle, 'string', locked.text);
    if (typeof handle === 'string') {
      holdLock({
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        object_name: N.group,
        lock_handle: handle,
      });
    }
    const written = await liveCall('HandlerUpdate', {
      object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
      function_group_name: N.group,
      symbols: [{ key: '003', text: 'Compact symbol', max_length: 20 }],
      lock_handle: handle,
      transport_request: request(),
    });
    const unlocked = await liveCall('HandlerLock', {
      action: 'unlock',
      object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
      object_name: N.group,
      lock_handle: handle,
    });
    if (unlocked.isError !== true) lockReleased(String(handle));
    succeeded('HandlerUpdate FUNCTION_GROUP_TEXT_ELEMENTS', written);
    succeeded('HandlerUnlock FUNCTION_GROUP_TEXT_ELEMENTS', unlocked);
    succeeded(
      'HandlerActivate FUNCTION_GROUP_TEXT_ELEMENTS',
      await livePrepare('HandlerActivate', {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        object_name: N.group,
      }),
    );
    const read = await liveCall('HandlerGet', {
      object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
      part: 'source',
      function_group_name: N.group,
      version: 'active',
    });
    assert.deepEqual(
      symbolKeys(
        payloadOf(succeeded('HandlerGet FUNCTION_GROUP_TEXT_ELEMENTS', read)),
      ),
      ['003'],
    );
  });

  it("compact: a class's text elements locked, written, unlocked, activated and read", async () => {
    const locked = await liveCall('HandlerLock', {
      object_type: 'CLASS_TEXT_ELEMENTS',
      object_name: N.class,
    });
    const handle = member(
      payloadOf(succeeded('HandlerLock CLASS_TEXT_ELEMENTS', locked)),
      'lock_handle',
    );
    assert.equal(typeof handle, 'string', locked.text);
    if (typeof handle === 'string') {
      holdLock({
        object_type: 'CLASS_TEXT_ELEMENTS',
        object_name: N.class,
        lock_handle: handle,
      });
    }
    const written = await liveCall('HandlerUpdate', {
      object_type: 'CLASS_TEXT_ELEMENTS',
      class_name: N.class,
      symbols: [{ key: '003', text: 'Compact symbol', max_length: 20 }],
      lock_handle: handle,
      transport_request: request(),
    });
    const unlocked = await liveCall('HandlerLock', {
      action: 'unlock',
      object_type: 'CLASS_TEXT_ELEMENTS',
      object_name: N.class,
      lock_handle: handle,
    });
    if (unlocked.isError !== true) lockReleased(String(handle));
    succeeded('HandlerUpdate CLASS_TEXT_ELEMENTS', written);
    succeeded('HandlerUnlock CLASS_TEXT_ELEMENTS', unlocked);
    succeeded(
      'HandlerActivate CLASS_TEXT_ELEMENTS',
      await livePrepare('HandlerActivate', {
        object_type: 'CLASS_TEXT_ELEMENTS',
        object_name: N.class,
      }),
    );
    const read = await liveCall('HandlerGet', {
      object_type: 'CLASS_TEXT_ELEMENTS',
      part: 'source',
      class_name: N.class,
      version: 'active',
    });
    assert.deepEqual(
      symbolKeys(payloadOf(succeeded('HandlerGet CLASS_TEXT_ELEMENTS', read))),
      ['003'],
    );
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
    const read = await liveCall('GetTextElements', {
      object_kind: 'program',
      object_name: name,
      version: 'active',
    });
    const texts = payloadOf(succeeded('GetTextElements delivered', read));
    assert.equal(member(texts, 'object_name'), name.toUpperCase());
    const compact = await liveCall('HandlerGet', {
      object_type: 'PROGRAM_TEXT_ELEMENTS',
      part: 'source',
      program_name: name,
      version: 'active',
    });
    succeeded('HandlerGet PROGRAM_TEXT_ELEMENTS delivered', compact);
  });
});
