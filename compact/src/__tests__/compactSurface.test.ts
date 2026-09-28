/**
 * The compact surface stays frozen — the same 22 tools with the same parameters.
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
 * make the rest vacuous.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly';

interface Row {
  group: string;
  name: string;
  inputs: string;
  available_in: string;
}

/** `name*` for a required parameter, `name` for an optional one — the fixture's shape. */
function inputsOf(schema: unknown): string {
  const container = schema as
    | { properties?: Record<string, unknown>; required?: string[] }
    | undefined;
  const properties = container?.properties ?? {};
  const required = new Set(container?.required ?? []);
  const names = Object.keys(properties).map((name) =>
    required.has(name) ? `${name}*` : name,
  );
  return names.length === 0 ? '(none)' : names.join(', ');
}

describe('the compact tool surface', () => {
  const frozen: Row[] = JSON.parse(
    readFileSync(join(__dirname, '../../tests/fixtures/surface.json'), 'utf8'),
  );

  const context = () => ({}) as never;
  const current = [
    ...compactReadOnlyEntries(context),
    ...compactModifyEntries(context),
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
    expect(frozen).toHaveLength(22);
    expect(current).toHaveLength(22);
  });

  it('has the same tools', () => {
    expect(current.map((row) => row.name).sort()).toEqual(
      frozen.map((row) => row.name).sort(),
    );
  });

  it('loses no parameter and changes none from optional to required', () => {
    const byName = new Map(frozen.map((row) => [row.name, row]));
    for (const row of current) {
      const before = byName.get(row.name);
      if (!before) continue;
      const was = before.inputs === '(none)' ? [] : before.inputs.split(', ');
      const now = row.inputs === '(none)' ? [] : row.inputs.split(', ');
      // Every parameter that existed is still there, with the same requiredness.
      expect({
        tool: row.name,
        missing: was.filter((p) => !now.includes(p)),
      }).toEqual({ tool: row.name, missing: [] });
    }
  });

  it('changes no tool availability', () => {
    const byName = new Map(frozen.map((row) => [row.name, row.available_in]));
    for (const row of current) {
      if (!byName.has(row.name)) continue;
      expect({ tool: row.name, available: row.available_in }).toEqual({
        tool: row.name,
        available: byName.get(row.name),
      });
    }
  });
});
