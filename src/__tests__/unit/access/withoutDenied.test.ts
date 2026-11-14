/**
 * The denied actions at registration (spec §3.1): a denied tool absent from
 * its group, a denied value or code absent from the narrowed definition and
 * refused by the narrowed call, a compact tool left out only when every form
 * of it is denied, the groups keeping their class, the entries matching
 * nothing named, and nothing denied changing nothing.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import {
  type DeniedActions,
  parseDeniedEntry,
} from '../../../lib/access/deniedActions';
import {
  unmatchedEntries,
  withoutDenied,
} from '../../../lib/access/withoutDenied';
import { COMPACT_ACTIVATE } from '../../../lib/adtProjections';
import { BaseHandlerGroup } from '../../../lib/handlers/base/BaseHandlerGroup';
import type {
  HandlerEntry,
  IHandlerGroup,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { listedTool, searchMeta } from '../../../lib/listedTool';
import { declareSystemKind } from '../../../lib/systemKind';
import { fullToolSet, type ToolSet } from '../../../lib/toolSet';
import { listedJson } from '../../helpers/listedJson';
import { parityConnection, silentLogger } from '../../helpers/lowToCompact';

const denied = (...entries: string[]): DeniedActions =>
  entries.map((entry) => parseDeniedEntry(entry, 'test'));

const groupsOf = (set: ToolSet): IHandlerGroup[] =>
  set.groups(noConnectionContext(), 'stdio', { dataTools: true });

const namesOf = (groups: readonly IHandlerGroup[]): string[] =>
  groups.flatMap((group) =>
    group.getHandlers().map((entry) => entry.toolDefinition.name),
  );

function entryOf(groups: readonly IHandlerGroup[], name: string): HandlerEntry {
  for (const group of groups) {
    for (const entry of group.getHandlers()) {
      if (entry.toolDefinition.name === name) return entry;
    }
  }
  throw new Error(`no tool ${name}`);
}

/** The values the definition's `argument` lists, on its own statement. */
function enumOf(definition: ToolDefinition, argument: string): string[] {
  const node = listedJson(definition.inputSchema).properties?.[argument];
  if (node === undefined || typeof node === 'boolean') return [];
  if (node.const !== undefined) return [String(node.const)];
  return (node.enum ?? []).map(String);
}

const compact = (...entries: string[]) =>
  withoutDenied(groupsOf(compactToolSet), denied(...entries));

/** Whether the narrowed call refuses `args` before anything runs. */
async function refuses(entry: HandlerEntry, args: Record<string, unknown>) {
  const connection = parityConnection();
  await assert.rejects(
    entry.call({ connection, logger: silentLogger }, args),
    (error: unknown) =>
      error instanceof Error &&
      error.message.startsWith('Input validation error'),
  );
  assert.equal(connection.requests.length, 0);
}

describe('withoutDenied', () => {
  it('leaves a denied tool out, and every tool a prefix names', () => {
    const full = withoutDenied(groupsOf(fullToolSet), denied('DeleteClass'));
    assert.equal(namesOf(full).includes('DeleteClass'), false);
    assert.ok(namesOf(full).includes('DeleteProgram'));
    const prefixed = namesOf(
      withoutDenied(groupsOf(fullToolSet), denied('Delete*')),
    );
    assert.deepEqual(
      prefixed.filter((name) => name.startsWith('Delete')),
      [],
    );
    assert.ok(
      namesOf(groupsOf(fullToolSet)).some((n) => n.startsWith('Delete')),
    );
    assert.ok(namesOf(compact('Delete*')).includes('HandlerDeletionCheck'));
  });

  it('HandlerActivate.CLASS: CLASS gone from object_type, BEHAVIOR_IMPLEMENTATION kept, the code arguments free strings', async () => {
    const entry = entryOf(compact('HandlerActivate.CLASS'), 'HandlerActivate');
    const types = enumOf(entry.toolDefinition, 'object_type');
    assert.equal(types.includes('CLASS'), false);
    assert.ok(types.includes('BEHAVIOR_IMPLEMENTATION'));
    const shape = listedJson(entry.toolDefinition.inputSchema).properties;
    const adtType = shape?.object_adt_type;
    assert.ok(adtType !== undefined && typeof adtType !== 'boolean');
    assert.equal(adtType.type, 'string');
    assert.equal(adtType.enum, undefined);
    await refuses(entry, { object_type: 'CLASS', object_name: 'ZC' });
  });

  it('HandlerActivate.CLAS/OC: the code refused in every spelling, CLASS and BEHAVIOR_IMPLEMENTATION kept', async () => {
    const entry = entryOf(
      compact('HandlerActivate.CLAS/OC'),
      'HandlerActivate',
    );
    const types = enumOf(entry.toolDefinition, 'object_type');
    assert.ok(types.includes('CLASS'));
    assert.ok(types.includes('BEHAVIOR_IMPLEMENTATION'));
    for (const code of ['CLAS/OC', 'clas/oc', 'class']) {
      await refuses(entry, { object_adt_type: code, object_name: 'ZC' });
      await refuses(entry, { objects: [{ name: 'ZC', type: code }] });
    }
  });

  it('HandlerGet.CLAS/OC: object_adt_type refuses it', async () => {
    const entry = entryOf(compact('HandlerGet.CLAS/OC'), 'HandlerGet');
    assert.equal(
      enumOf(entry.toolDefinition, 'object_adt_type').includes('CLAS/OC'),
      false,
    );
    assert.ok(enumOf(entry.toolDefinition, 'object_type').includes('CLASS'));
    await refuses(entry, {
      part: 'object_structure',
      object_adt_type: 'CLAS/OC',
      object_name: 'ZC',
    });
  });

  it('HandlerActivate.CLAS* removes CLASS and CLAS/OC', async () => {
    const entry = entryOf(compact('HandlerActivate.CLAS*'), 'HandlerActivate');
    assert.equal(
      enumOf(entry.toolDefinition, 'object_type').includes('CLASS'),
      false,
    );
    await refuses(entry, { object_adt_type: 'CLAS/OC', object_name: 'ZC' });
  });

  it('HandlerActivate: names alone denied leaves codes, codes alone leaves names, both leave it out', () => {
    const names = entryOf(
      compact(
        ...COMPACT_ACTIVATE.onprem.map((name) => `HandlerActivate.${name}`),
      ),
      'HandlerActivate',
    );
    assert.deepEqual(enumOf(names.toolDefinition, 'object_type'), []);
    assert.equal(
      names.toolDefinition.inputSchema.safeParse({
        object_adt_type: 'INTF/OI',
        object_name: 'Z',
      }).success,
      true,
    );
    const everyCode = compact(
      ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(
        (letter) => `HandlerActivate.${letter}*`,
      ),
    );
    assert.equal(namesOf(everyCode).includes('HandlerActivate'), false);
  });

  it('HandlerProfileRun with every value denied is left out', () => {
    assert.equal(
      namesOf(
        compact('HandlerProfileRun.CLASS', 'HandlerProfileRun.PROGRAM'),
      ).includes('HandlerProfileRun'),
      false,
    );
  });

  it('HandlerGetData.sql: sql_query gone; the given query never reaches SAP', async () => {
    const entry = entryOf(compact('HandlerGetData.sql'), 'HandlerGetData');
    assert.equal(
      'sql_query' in
        (listedJson(entry.toolDefinition.inputSchema).properties ?? {}),
      false,
    );
    const alone = parityConnection();
    declareSystemKind(alone, 'onprem');
    await entry
      .call(
        { connection: alone, logger: silentLogger },
        {
          sql_query: 'SELECT carrid FROM scarr',
        },
      )
      .catch(() => undefined);
    assert.equal(alone.requests.length, 0);
    const beside = parityConnection();
    declareSystemKind(beside, 'onprem');
    const answer = await entry.call(
      { connection: beside, logger: silentLogger },
      { object_name: 'MARA', sql_query: 'SELECT carrid FROM scarr' },
    );
    assert.equal(beside.requests.length, 1, JSON.stringify(answer));
    assert.equal(beside.requests[0]?.data, 'SELECT * FROM MARA');
  });

  it('with no variant stated, the search texts name only the members left', () => {
    const entry = entryOf(compact('HandlerDelete.CLASS'), 'HandlerDelete');
    const listed = listedTool(entry.toolDefinition, undefined);
    assert.ok(listed.listed);
    const members = entry.toolDefinition.members ?? [];
    assert.equal(members.includes('CLASS'), false);
    assert.deepEqual(listed.search, searchMeta('HandlerDelete', members));
    assert.notDeepEqual(listed.search, searchMeta('HandlerDelete'));
  });

  it('keeps each group’s class, name and stated system type', () => {
    const groups = groupsOf(compactToolSet);
    const narrowed = withoutDenied(
      groups,
      denied('HandlerDelete.CLASS', 'HandlerDebugStep'),
    );
    assert.equal(narrowed.length, groups.length);
    for (const [index, group] of narrowed.entries()) {
      const inner = groups[index];
      assert.ok(inner !== undefined);
      assert.ok(group instanceof BaseHandlerGroup);
      assert.ok(inner instanceof BaseHandlerGroup);
      assert.equal(group.getName(), inner.getName());
      assert.equal(group.statedSystemType(), inner.statedSystemType());
    }
  });

  it('names the entries that match nothing here', () => {
    const groups = [...groupsOf(fullToolSet), ...groupsOf(compactToolSet)];
    assert.deepEqual(
      unmatchedEntries(
        groups,
        denied(
          'HandlerCreate.PROGRAM',
          'HandlerCreate.NOPE',
          'DebugStepX',
          'GetPackage.CLASS',
          'DeleteClass',
        ),
      ),
      ['HandlerCreate.NOPE', 'DebugStepX', 'GetPackage.CLASS'],
    );
  });

  it('nothing denied returns the same groups', () => {
    const groups = groupsOf(compactToolSet);
    const same = withoutDenied(groups, []);
    assert.equal(same.length, groups.length);
    for (const [index, group] of same.entries()) {
      assert.equal(group, groups[index]);
    }
  });
});
