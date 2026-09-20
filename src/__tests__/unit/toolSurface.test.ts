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

      // Nothing may leave, and what may arrive is `detail` — optional, so it
      // carries no `*` — or, on the two DDLX check tools, `version`.
      //
      // **Why that second exception exists.** The DDLX checkruns endpoint
      // does not fall back to the version that exists: an activated
      // extension answers `notProcessed` when asked for `inactive`, which is
      // what the shipped default asked for, so from these two tools an
      // activated extension could not be checked at all (#178, eseuve). A
      // parameter was the only way to say which one — measured on trial and
      // captured in `check-ddlx-active-version` /
      // `check-ddlx-inactive-version`.
      expect({ tool, lost: had.filter((p) => !has.includes(p)) }).toEqual({
        tool,
        lost: [],
      });
      const MAY_GAIN_VERSION = new Set([
        'high/CheckMetadataExtension',
        'low/CheckMetadataExtensionLow',
      ]);
      expect({ tool, added: has.filter((p) => !had.includes(p)) }).toEqual({
        tool,
        added: MAY_GAIN_VERSION.has(tool) ? ['version'] : ['detail'],
      });
    }
  });

  /**
   * The snapshot moved once, deliberately, and this is what it moved by.
   *
   * Every tool that declared `legacy` stopped: support for legacy systems
   * (BASIS < 7.50) is parked on `parked/legacy-support` until it can be tried
   * against a live one. Nothing in this repository ever was — the environment
   * was declared on 142 tools, and `available_in` naming an environment
   * nobody had verified is a claim rather than a fact.
   *
   * The refreeze was checked rather than trusted: `inputs` had to match the
   * old snapshot row for row, and each `available_in` had to equal the old
   * one with `legacy` removed and nothing else. A tool that had quietly
   * gained or lost anything else would have stopped the refreeze.
   */
  /**
   * The second deliberate move: three tools arrived.
   *
   * ATC was in `@mcp-abap-adt/adt-clients` 19 and exposed by nothing here —
   * `AdtRuntimeClient.getAtc()` with the variant, the worklist, the run, its
   * status and its findings, and no `src/handlers/atc` to reach them. The
   * refreeze was checked rather than trusted: every existing row had to match
   * the old snapshot exactly, in `inputs` and in `available_in`, and the only
   * difference allowed was these three names appearing. A tool that had
   * quietly gained or lost anything else would have stopped it.
   */
  it('adds tools only deliberately', () => {
    const arrived = [...read(current).keys()].filter(
      (tool) => !read(frozen).has(tool),
    );
    expect(arrived).toEqual([]);
  });

  it('no tool declares legacy', () => {
    expect(current.filter((r) => /legacy/.test(r.available_in))).toEqual([]);
  });

  it('changes no tool availability', () => {
    const now = availability(current);
    for (const [tool, before] of availability(frozen)) {
      expect({ tool, available_in: now.get(tool) }).toEqual({
        tool,
        available_in: before,
      });
    }
  });
});
