/**
 * Test 5: the rows are complete. Every member of every compact tool of an
 * operation that is a type of that operation (spec §2.2) has a compact row;
 * every full `<Operation><Type>` tool a binary lists for such a type has a
 * full row; and every row's tool is in its set's registry. A new type with
 * no row fails here.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactReadOnlyToolSet } from '../../../../compact-ro/src/launcher';
import { readOnlyToolSet as coreReadOnlyToolSet } from '../../../../core-ro/src/launcher';
import type { ToolDefinition } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  COMPACT_ROWS,
  FULL_ROWS,
  PROMPT_OBJECT_TYPES,
  type PromptObjectType,
} from '../../../lib/prompts/objectRows';
import type { ObjectOperation } from '../../../lib/prompts/types';
import type { AbapSystemKind } from '../../../lib/systemKind';
import { fullToolSet, type ToolSet } from '../../../lib/toolSet';
import { promptSourceFor } from '../../helpers/promptSources';

const OPERATIONS: readonly ObjectOperation[] = [
  'create',
  'get',
  'update',
  'delete',
  'activate',
  'check',
];

const KINDS: readonly AbapSystemKind[] = ['onprem', 'cloud'];

/**
 * The types of the vocabulary an operation does not work on (spec §2.2):
 * a transport request is the `transport` prompt's, and compact's
 * `UNIT_TEST` / `CDS_UNIT_TEST` read a run's result, not an object.
 */
const NOT_AN_OBJECT_OF: Readonly<
  Partial<Record<ObjectOperation, readonly PromptObjectType[]>>
> = {
  create: ['TRANSPORT'],
  get: ['TRANSPORT', 'UNIT_TEST', 'CDS_UNIT_TEST'],
};

/** The types `operation` works on. */
const typesOf = (operation: ObjectOperation): PromptObjectType[] =>
  PROMPT_OBJECT_TYPES.filter(
    (type) => !(NOT_AN_OBJECT_OF[operation] ?? []).includes(type),
  );

/** `DATA_ELEMENT` → `DataElement`: the type as a full tool's name spells it. */
const pascal = (type: string): string =>
  type
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join('');

const OPERATION_WORD: Readonly<Record<ObjectOperation, string>> = {
  create: 'Create',
  get: 'Get',
  update: 'Update',
  delete: 'Delete',
  activate: 'Activate',
  check: 'Check',
};

/** The definitions `set`'s registry holds, by name. */
function definitionsOf(set: ToolSet): Map<string, ToolDefinition> {
  const out = new Map<string, ToolDefinition>();
  for (const group of set.groups(noConnectionContext(), 'stdio', {
    dataTools: true,
  })) {
    for (const entry of group.getHandlers()) {
      out.set(entry.toolDefinition.name, entry.toolDefinition);
    }
  }
  return out;
}

describe('test 5: the rows are complete', () => {
  const compact = definitionsOf(compactToolSet);
  const full = definitionsOf(fullToolSet);

  for (const operation of OPERATIONS) {
    it(`every member of compact's ${operation} tool that is a type of it has a row`, () => {
      const row = COMPACT_ROWS[operation];
      const tool = compact.get(row.tool);
      assert.ok(tool, `compact serves ${row.tool}`);
      const rowMembers: readonly string[] = row.members;
      const types: readonly string[] = typesOf(operation);
      for (const kind of KINDS) {
        const members: readonly string[] = tool.variants?.[kind].members ?? [];
        assert.ok(members.length > 0, `${row.tool} states members on ${kind}`);
        assert.deepEqual(
          members.filter(
            (member) => types.includes(member) && !rowMembers.includes(member),
          ),
          [],
          `${row.tool} on ${kind}`,
        );
      }
    });

    it(`every full ${operation} tool a binary lists for a type has a row`, () => {
      for (const set of [fullToolSet, coreReadOnlyToolSet]) {
        for (const kind of KINDS) {
          const listed = promptSourceFor(set, kind, {
            transport: 'stdio',
            backgroundRuns: set.backgroundRuns,
          }).tools;
          for (const type of typesOf(operation)) {
            const name = `${OPERATION_WORD[operation]}${pascal(type)}`;
            if (!listed.has(name)) continue;
            assert.equal(
              FULL_ROWS[operation][type]?.tool,
              name,
              `${name} on ${kind} has the full row of ${operation} ${type}`,
            );
          }
        }
      }
    });

    it(`every ${operation} row's tool is in its set's registry`, () => {
      assert.ok(compact.has(COMPACT_ROWS[operation].tool));
      for (const row of Object.values(FULL_ROWS[operation])) {
        assert.ok(full.has(row.tool), `the full set holds ${row.tool}`);
      }
    });
  }

  it('compact-ro serves its operations from the same rows', () => {
    const readOnly = definitionsOf(compactReadOnlyToolSet);
    assert.ok(readOnly.has(COMPACT_ROWS.get.tool));
    assert.ok(readOnly.has(COMPACT_ROWS.check.tool));
  });
});
