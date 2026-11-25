/**
 * The compact surface stays frozen — the same 34 tools — 28, plus the four debug tools and `HandlerDebugBatch` the compact write binaries serve and `HandlerBatch`, which every compact binary serves.
 *
 * **Why it lives here now.** `tests/fixtures/tools/surface.json` in `lib` froze all
 * 370 tools, 22 of them compact. The facade moved into packages, so `lib`'s fixture
 * lost those rows — and a ratchet that loses its subject silently is worse than no
 * ratchet. The rows moved with the tools: `compact/tests/fixtures/surface.json`
 * holds them, and this reads the surface from the two halves' entry builders rather
 * than from a script, because the packages are the surface now.
 *
 * The rule is the one `toolSurface` applies in `lib`: a tool may gain a parameter
 * (a caller that worked still works), but not lose one, and not lose or rename a
 * tool. The count is asserted first, so a fixture that stopped being read cannot
 * make the rest vacuous. One loss is decided (`REMOVED`): `HandlerCreate`'s
 * `program_type` (24.0.0, D2), which SAP ignores on create. Two tools left
 * by decision (24.0.0, D25): `HandlerSearch` and `HandlerWhereUsed`, whose
 * calls are `HandlerSystem`'s `search_object` and `where_used`; the fixture
 * holds `HandlerSystem` in their place.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { compactBatchEntries } from '../../../lib/compact/batch/group';
import {
  compactDebugBatchEntries,
  compactDebugEntries,
} from '../../../lib/compact/debug/group';
import type { ToolDefinition } from '../../../lib/handlers/interfaces';
import { declaredRequired, listedJson } from '../../helpers/listedJson';
import { repositoryRoot } from '../../helpers/repoRoot';

interface Row {
  group: string;
  name: string;
  inputs: string;
  available_in: string;
}

/** `name*` for a required parameter, `name` for an optional one — the fixture's shape. */
function inputsOf(schema: ToolDefinition['inputSchema']): string {
  const properties = listedJson(schema).properties ?? {};
  const required = new Set(declaredRequired(schema));
  const names = Object.keys(properties).map((name) =>
    required.has(name) ? `${name}*` : name,
  );
  return names.length === 0 ? '(none)' : names.join(', ');
}

describe('the compact tool surface', () => {
  const frozen: Row[] = JSON.parse(
    readFileSync(
      join(
        repositoryRoot(__dirname),
        'compact',
        'tests',
        'fixtures',
        'surface.json',
      ),
      'utf8',
    ),
  );

  const current = [
    ...compactReadOnlyEntries(),
    // The data tool, opt-in: on the surface, served only when asked for.
    ...compactDataEntries(),
    ...compactModifyEntries(),
    ...compactDebugEntries(),
    ...compactDebugBatchEntries(),
    ...compactBatchEntries(),
  ].map((entry) => ({
    group: 'compact',
    name: entry.toolDefinition.name,
    inputs: inputsOf(entry.toolDefinition.inputSchema),
    // Rendered exactly as the fixture holds it: sorted, comma and a space, and
    // "all" when a tool declares no restriction — the shape `list-tools.ts` wrote.
    available_in: [
      ...((entry.toolDefinition as { available_in?: readonly string[] })
        .available_in ?? ['all']),
    ]
      .sort()
      .join(', '),
  }));

  it('enumerates the whole facade, so the assertions below are not vacuous', () => {
    // 24.2.0: HandlerUnlock is HandlerLock's `action: 'unlock'` (33).
    assert.equal(frozen.length, 33);
    assert.equal(current.length, 33);
  });

  it('has the same tools', () => {
    assert.deepStrictEqual(
      current.map((row) => row.name).sort(),
      frozen.map((row) => row.name).sort(),
    );
  });

  /** The parameters a tool lost by decision, by tool. */
  const REMOVED: Readonly<Record<string, readonly string[]>> = {
    // 24.0.0, the owner (D2): SAP ignores the program type on create.
    HandlerCreate: ['program_type'],
  };

  it('loses no parameter and changes none from optional to required', () => {
    const byName = new Map(frozen.map((row) => [row.name, row]));
    for (const row of current) {
      const before = byName.get(row.name);
      if (!before) continue;
      const was = before.inputs === '(none)' ? [] : before.inputs.split(', ');
      const now = row.inputs === '(none)' ? [] : row.inputs.split(', ');
      // Every parameter that existed is still there, with the same requiredness.
      assert.deepStrictEqual(
        {
          tool: row.name,
          missing: was.filter(
            (p) => !now.includes(p) && !(REMOVED[row.name] ?? []).includes(p),
          ),
        },
        { tool: row.name, missing: [] },
      );
    }
  });

  it('changes no tool availability', () => {
    const byName = new Map(frozen.map((row) => [row.name, row.available_in]));
    for (const row of current) {
      if (!byName.has(row.name)) continue;
      assert.deepStrictEqual(
        { tool: row.name, available: row.available_in },
        {
          tool: row.name,
          available: byName.get(row.name),
        },
      );
    }
  });
});
