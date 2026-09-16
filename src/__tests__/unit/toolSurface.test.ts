import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tool surface is a contract with callers who never read this repository.
 *
 * `detail` is the one addition the adt-clients 19 migration may make; anything
 * else moving is a regression, and this is where it is caught.
 *
 * `scripts/list-tools.ts` answers a FLAT ARRAY of
 * `{ group, name, inputs, available_in }`, where `inputs` is a formatted
 * string — `"table_name*, max_rows"`, with `*` marking required and the
 * sentinel `"(none)"` for a tool that takes nothing — and `available_in` is
 * a sorted, comma-joined list of SAP environments, or the sentinel
 * `"(everywhere)"` for a tool that declares none. Not an object keyed by
 * group, and not a `params` array: a test written against either would fail
 * on an unchanged surface and the ratchet would be useless from the first
 * task onward.
 *
 * **`available_in` is checked here too, and was not always.** The parameter
 * comparison below only ever read `inputs` — a tool that gained or lost an
 * environment passed it silently, unless a `legacyExposure`/`legacyThrows`
 * ledger elsewhere happened to name that exact tool. Two earlier tasks
 * recorded the gap without closing it; this file is the ratchet, so this is
 * where it closes: a changed `available_in`, in either direction, fails the
 * same way an added or removed parameter does.
 */
describe('the MCP tool surface', () => {
  type Row = {
    group: string;
    name: string;
    inputs: string;
    available_in: string;
  };

  const read = (rows: Row[]) =>
    new Map(rows.map((r) => [`${r.group}/${r.name}`, r.inputs]));
  const availability = (rows: Row[]) =>
    new Map(rows.map((r) => [`${r.group}/${r.name}`, r.available_in]));
  const parameters = (inputs: string) =>
    inputs === '(none)' ? [] : inputs.split(', ');

  const frozen: Row[] = JSON.parse(
    readFileSync(
      join(__dirname, '../../../tests/fixtures/tools/surface.json'),
      'utf8',
    ),
  );

  const current: Row[] = JSON.parse(
    execFileSync('npx', ['tsx', 'scripts/list-tools.ts'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  );

  it('enumerates the whole surface, so the assertions below are not vacuous', () => {
    // A run that listed nothing would satisfy every comparison that follows.
    expect(frozen.length).toBeGreaterThan(300);
    expect(current.length).toBe(frozen.length);
  });

  it('has the same tools in the same groups', () => {
    expect([...read(current).keys()].sort()).toEqual(
      [...read(frozen).keys()].sort(),
    );
  });

  it('changes no parameter except by adding detail', () => {
    const now = read(current);
    for (const [tool, before] of read(frozen)) {
      const after = now.get(tool);
      if (after === before) continue;

      const had = parameters(before);
      const has = parameters(after ?? '(none)');

      // Nothing may leave, and the only thing that may arrive is `detail` —
      // optional, so it carries no `*`.
      expect({ tool, lost: had.filter((p) => !has.includes(p)) }).toEqual({
        tool,
        lost: [],
      });
      expect({ tool, added: has.filter((p) => !had.includes(p)) }).toEqual({
        tool,
        added: ['detail'],
      });
    }
  });

  /**
   * Two tools narrow deliberately, and they are named here so the narrowing
   * cannot spread by accident.
   *
   * A package cannot be edited on a legacy system — reading its metadata and
   * its contents is fine, changing it is not. `CreatePackage` and
   * `ValidatePackageLow` already said so; `UpdatePackageLow` and
   * `DeletePackageLow` still offered `legacy` and could only refuse there.
   *
   * The reads keep `legacy` on purpose, even though `AdtPackageLegacy`
   * currently blocks them too: that block is upstream and is wrong by the
   * same rule — the commit that introduced it (`0c9ae6b9`, "block legacy
   * packages") gives the reason as "the endpoint exists in discovery but does
   * not return usable results **via RFC**", which is a statement about a
   * connection type rather than about reading. Hiding the read tools here
   * would bake that over-block into this repository's surface.
   */
  const NARROWED_ON_PURPOSE: Record<string, string> = {
    'low/UpdatePackageLow': 'cloud, onprem',
    'low/DeletePackageLow': 'cloud, onprem',
  };

  it('changes no tool availability, except where this file says so', () => {
    const now = availability(current);
    for (const [tool, before] of availability(frozen)) {
      expect({ tool, available_in: now.get(tool) }).toEqual({
        tool,
        available_in: NARROWED_ON_PURPOSE[tool] ?? before,
      });
    }
  });

  it('every deliberate narrowing is still one — a stale entry hides nothing', () => {
    const frozenAvailability = availability(frozen);
    for (const [tool, narrowed] of Object.entries(NARROWED_ON_PURPOSE)) {
      expect({ tool, was: frozenAvailability.get(tool) }).not.toEqual({
        tool,
        was: narrowed,
      });
    }
  });
});
