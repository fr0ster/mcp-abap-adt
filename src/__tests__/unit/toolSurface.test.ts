import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tool surface is a contract with callers who never read this repository.
 *
 * `detail` is the one addition the adt-clients 19 migration may make; anything
 * else moving is a regression, and this is where it is caught.
 *
 * `scripts/list-tools.ts` answers a FLAT ARRAY of `{ group, name, inputs }`,
 * where `inputs` is a formatted string — `"table_name*, max_rows"`, with `*`
 * marking required and the sentinel `"(none)"` for a tool that takes nothing.
 * Not an object keyed by group, and not a `params` array: a test written
 * against either would fail on an unchanged surface and the ratchet would be
 * useless from the first task onward.
 */
describe('the MCP tool surface', () => {
  type Row = { group: string; name: string; inputs: string };

  const read = (rows: Row[]) =>
    new Map(rows.map((r) => [`${r.group}/${r.name}`, r.inputs]));
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
});
