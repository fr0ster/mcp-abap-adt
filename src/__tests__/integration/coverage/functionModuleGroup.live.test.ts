/**
 * A function module addressed through a function group, live (plan D7,
 * #2): the group is checked against the module's metadata before anything
 * else is sent.
 *
 * Measured before the fix (on premise, 2026-11-04): SAP ignores the group
 * segment of a module's address, so a module of group A was read, locked,
 * written and activated through group B's address. The test creates two
 * groups, A with a module and B empty, and checks that every path given B
 * is refused and changes nothing (each effect read back through A), and
 * that the same paths given A go on.
 *
 * The calls go through `livePrepare`: the keys these paths stand for are
 * pinned and covered live by their family tasks (their ledger rows); this
 * file proves the group check on both systems.
 *
 * Every object's name is read free before its create and recorded for
 * cleanup before it; everything is deleted in reverse creation order and
 * read absent after (the module by a repository search: its read answers
 * no `404` while it is absent).
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, it } from 'node:test';
import {
  configuredSystemKind,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import { assertEquals } from '../helpers/liveAssert';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const GROUP_A = `ZMCP_GA${SUFFIX}`;
const GROUP_B = `ZMCP_GB${SUFFIX}`;
const MODULE = `Z_MCP_GC_${SUFFIX}`;
const ABSENT = `Z_MCP_GN_${SUFFIX}`;

/**
 * A source whose body holds `marker`. SAP keeps its own first lines of a
 * module's source (the signature) and stores the body sent (measured on
 * premise, 2026-11-05), so a write is read back by its body.
 */
const sourceWith = (marker: string): string =>
  `FUNCTION ${MODULE.toLowerCase()}.\n  DATA ${marker} TYPE i.\nENDFUNCTION.`;
const FIRST = 'lv_first';
const SECOND = 'lv_second';
const OTHER = 'lv_other';

/** `$TMP` on premise; the configured package on the cloud, which has none. */
const packageName = (): string =>
  configuredSystemKind() === 'onprem' ? '$TMP' : resolvePackageName();

/** The configured request on the cloud; none on premise (`$TMP`). */
function onRequest(): { transport_request?: string } {
  if (configuredSystemKind() === 'onprem') return {};
  const request = resolveTransportRequest();
  return request === undefined || request === ''
    ? {}
    : { transport_request: request };
}

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The refusal of group B: an error answer carrying the mismatch code and naming group A. */
function expectGroupRefused(step: string, answer: LiveAnswer): void {
  if (!answer.isError) {
    throw new Error(`${step} was not refused: ${answer.text}`);
  }
  const payload: unknown = JSON.parse(answer.text);
  assertEquals(
    { step, code: member(payload, 'code') },
    {
      step,
      code: 'FUNCTION_GROUP_MISMATCH',
    },
  );
  assert.ok(String(member(payload, 'message')).includes(GROUP_A));
}

/** The module's source, read through its own group at `version`. */
async function sourceOf(version: 'active' | 'inactive'): Promise<string> {
  const answer = succeeded(
    `GetFunctionModule ${version}`,
    await livePrepare('GetFunctionModule', {
      function_group_name: GROUP_A,
      function_module_name: MODULE,
      version,
    }),
  );
  const source = member(JSON.parse(answer.text), 'source');
  if (typeof source !== 'string') {
    throw new Error(`GetFunctionModule answered no source: ${answer.text}`);
  }
  return source;
}

/** The body markers a source holds, of those the test writes. */
const markersIn = (source: string): string[] =>
  [FIRST, SECOND, OTHER].filter((marker) =>
    source.includes(`DATA ${marker} TYPE i.`),
  );

/** Whether a repository search for the function module's name answers a hit. */
async function moduleFound(name: string): Promise<boolean> {
  const answer = succeeded(
    `SearchObject ${name}`,
    await livePrepare('SearchObject', {
      object_name: name,
      object_type: 'FUNC',
    }),
  );
  return answer.text.includes(name);
}

/** The function module is in no group: a repository search for its name answers no hit. */
async function expectNoModule(name: string): Promise<void> {
  if (await moduleFound(name)) {
    throw new Error(`the function module ${name} exists`);
  }
}

/** Creates a function group after its name was read free, recorded for cleanup first. */
async function createGroup(group: string): Promise<void> {
  await expectNameFree({
    tool: 'GetFunctionGroup',
    args: { function_group_name: group },
  });
  recordCreated('DeleteFunctionGroup', {
    function_group_name: group,
    ...onRequest(),
  });
  succeeded(
    `CreateFunctionGroup ${group}`,
    await livePrepare('CreateFunctionGroup', {
      function_group_name: group,
      package_name: packageName(),
      description: 'MCP group check live case',
      ...onRequest(),
    }),
  );
}

liveSuite(
  ['onprem', 'cloud'],
  'a function module addressed through a group',
  () => {
    before(async () => {
      await expectNoModule(MODULE);
      await createGroup(GROUP_A);
      await createGroup(GROUP_B);
      recordCreated('DeleteFunctionModule', {
        function_module_name: MODULE,
        function_group_name: GROUP_A,
        ...onRequest(),
      });
      succeeded(
        'CreateFunctionModule',
        await livePrepare('CreateFunctionModule', {
          function_group_name: GROUP_A,
          function_module_name: MODULE,
          description: 'MCP group check live case',
          ...onRequest(),
        }),
      );
      // Written and activated through its own group while it exists only
      // inactive: the check reads the working area.
      succeeded(
        'UpdateFunctionModule',
        await livePrepare('UpdateFunctionModule', {
          function_group_name: GROUP_A,
          function_module_name: MODULE,
          source_code: sourceWith(FIRST),
          activate: true,
          ...onRequest(),
        }),
      );
      // The search finds the module it is later asked about: its absence
      // after the cleanup is the search's answer, not an empty one.
      assert.equal(await moduleFound(MODULE), true);
    });

    after(async () => {
      await deleteRecorded();
      await expectNoModule(MODULE);
      await expectAbsent({
        tool: 'GetFunctionGroup',
        args: { function_group_name: GROUP_A },
      });
      await expectAbsent({
        tool: 'GetFunctionGroup',
        args: { function_group_name: GROUP_B },
      });
    });

    it('GetFunctionModule through another group is refused; through its own group it reads the source', async () => {
      expectGroupRefused(
        'GetFunctionModule B',
        await livePrepare('GetFunctionModule', {
          function_group_name: GROUP_B,
          function_module_name: MODULE,
        }),
      );
      expectGroupRefused(
        'GetFunctionModule B metadata',
        await livePrepare('GetFunctionModule', {
          function_group_name: GROUP_B,
          function_module_name: MODULE,
          part: 'metadata',
        }),
      );
      const own = succeeded(
        'GetFunctionModule A',
        await livePrepare('GetFunctionModule', {
          function_group_name: GROUP_A,
          function_module_name: MODULE,
        }),
      );
      assertEquals(markersIn(String(member(JSON.parse(own.text), 'source'))), [
        FIRST,
      ]);
    });

    it('UpdateFunctionModule through another group is refused and writes nothing; through its own group it writes', async () => {
      expectGroupRefused(
        'UpdateFunctionModule B',
        await livePrepare('UpdateFunctionModule', {
          function_group_name: GROUP_B,
          function_module_name: MODULE,
          source_code: sourceWith(OTHER),
          activate: true,
          ...onRequest(),
        }),
      );
      assertEquals(markersIn(await sourceOf('inactive')), [FIRST]);
      assertEquals(markersIn(await sourceOf('active')), [FIRST]);

      succeeded(
        'UpdateFunctionModule A',
        await livePrepare('UpdateFunctionModule', {
          function_group_name: GROUP_A,
          function_module_name: MODULE,
          source_code: sourceWith(SECOND),
          activate: true,
          ...onRequest(),
        }),
      );
      assertEquals(markersIn(await sourceOf('active')), [SECOND]);
    });

    it('HandlerLock through another group is refused; through its own group it locks and unlocks', async () => {
      expectGroupRefused(
        'HandlerLock B',
        await livePrepare('HandlerLock', {
          object_type: 'FUNCTION_MODULE',
          object_name: `${GROUP_B}|${MODULE}`,
        }),
      );
      const locked = succeeded(
        'HandlerLock A',
        await livePrepare('HandlerLock', {
          object_type: 'FUNCTION_MODULE',
          object_name: `${GROUP_A}|${MODULE}`,
        }),
      );
      const handle = member(JSON.parse(locked.text), 'lock_handle');
      if (typeof handle !== 'string' || handle === '') {
        throw new Error(`HandlerLock answered no handle: ${locked.text}`);
      }
      expectGroupRefused(
        'HandlerUnlock B',
        await livePrepare('HandlerUnlock', {
          object_type: 'FUNCTION_MODULE',
          object_name: `${GROUP_B}|${MODULE}`,
          lock_handle: handle,
        }),
      );
      succeeded(
        'HandlerUnlock A',
        await livePrepare('HandlerUnlock', {
          object_type: 'FUNCTION_MODULE',
          object_name: `${GROUP_A}|${MODULE}`,
          lock_handle: handle,
        }),
      );
    });

    it('CheckFunctionModule, GetWhereUsed and ActivateObjects through another group are refused; through its own group they run', async () => {
      expectGroupRefused(
        'CheckFunctionModule B',
        await livePrepare('CheckFunctionModule', {
          function_group_name: GROUP_B,
          function_module_name: MODULE,
        }),
      );
      succeeded(
        'CheckFunctionModule A',
        await livePrepare('CheckFunctionModule', {
          function_group_name: GROUP_A,
          function_module_name: MODULE,
        }),
      );
      expectGroupRefused(
        'GetWhereUsed B',
        await livePrepare('GetWhereUsed', {
          object_name: `${GROUP_B}|${MODULE}`,
          object_type: 'FUGR/FF',
        }),
      );
      succeeded(
        'GetWhereUsed A',
        await livePrepare('GetWhereUsed', {
          object_name: `${GROUP_A}|${MODULE}`,
          object_type: 'FUGR/FF',
        }),
      );
      expectGroupRefused(
        'ActivateObjects B',
        await livePrepare('ActivateObjects', {
          objects: [{ name: MODULE, type: 'FUGR/FF', parentName: GROUP_B }],
        }),
      );
      succeeded(
        'ActivateObjects A',
        await livePrepare('ActivateObjects', {
          objects: [{ name: MODULE, type: 'FUGR/FF', parentName: GROUP_A }],
        }),
      );
    });

    it('DeleteFunctionModule through another group is refused and the module stays', async () => {
      expectGroupRefused(
        'DeleteFunctionModule B',
        await livePrepare('DeleteFunctionModule', {
          function_group_name: GROUP_B,
          function_module_name: MODULE,
          ...onRequest(),
        }),
      );
      assertEquals(markersIn(await sourceOf('active')), [SECOND]);
    });

    it("a module that does not exist is SAP's refusal of the metadata read, relayed with its key", async () => {
      const answer = await livePrepare('GetFunctionModule', {
        function_group_name: GROUP_A,
        function_module_name: ABSENT,
      });
      assert.equal(answer.isError, true);
      const payload: unknown = JSON.parse(answer.text);
      const messages = member(payload, 'messages');
      const keys = Array.isArray(messages)
        ? messages.map((message) => member(message, 't100'))
        : [];
      // Measured on premise (2026-11-05): `404`, `FL 110`, whatever group.
      assertEquals(
        {
          step: member(payload, 'step'),
          status: member(payload, 'status'),
          code: member(payload, 'code'),
          keys: keys.map((key) => [member(key, 'id'), member(key, 'no')]),
        },
        {
          step: 'check function group',
          status: 404,
          code: undefined,
          keys: [['FL', '110']],
        },
      );
    });
  },
);
