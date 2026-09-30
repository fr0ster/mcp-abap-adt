/**
 * `lib`'s two public handler halves stay two halves.
 *
 * (The union's coverage of the compact facade is asserted where the facade lives,
 * in `compact/src/__tests__/compactCapabilitySplit.test.ts` — from here the
 * packages' graphs are not visible and their needs are not lib's business.)
 *
 * **What they are for.** The compact facade is moving into packages of its own, and
 * `@mcp-abap-adt/compact-readonly` must not be able to reach a write handler —
 * capability is what a package imports, not what its tool list enumerates. It
 * therefore imports `@mcp-abap-adt/lib/handlers/read` and nothing wider. One barrel
 * of all 104 handlers the facade needs would relink every write route into that
 * package the moment it imported it, so the two barrels are the condition for the
 * split to survive packaging rather than a stylistic choice.
 *
 * **What this holds.** That the halves are disjoint, that together they still cover
 * what the facade needs, and that the read barrel's module graph does not reach a
 * write handler. The membership was measured from the groups' import graphs — 35
 * read, 69 write, no overlap — so the assertions below are the measurement, kept.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as readBarrel from '../../lib/handlers/read';
import * as writeBarrel from '../../lib/handlers/write';

const SRC = resolve(__dirname, '../..');

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
    const candidate = join(dirname(file), match[1].replace(/\.js$/, ''));
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        readFileSync(candidate + suffix, 'utf8');
        out.push(candidate + suffix);
        break;
      } catch {
        // not this shape
      }
    }
  }
  return out;
}

function moduleGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of importsOf(file)) stack.push(next);
  }
  return seen;
}

describe("lib's read and write handler barrels", () => {
  const read = Object.keys(readBarrel).sort();
  const write = Object.keys(writeBarrel).sort();

  it('export the halves that were measured', () => {
    // 35 were what the compact facade's read half routed to. The metadata readers
    // and the preview-URL tool joined them when `HandlerGet` gained `part`, which
    // is why this number moves deliberately and in a commit that says so.
    // 15.1: search, where-used, table/SQL data and package contents joined, for
    // the compact facade's read half.
    expect(read).toHaveLength(59);
    // 78 handlers plus TYPE_TO_FAMILY, the activation family map. 15.0.0
    // added the eight unit-test tools per carrier (report, function group,
    // module, CDS run) and the compact facade's run start.
    expect(write).toHaveLength(79);
  });

  it('share not one symbol', () => {
    expect(read.filter((name) => write.includes(name))).toEqual([]);
  });

  it('name what they are: the read half writes nothing', () => {
    // A create/update/delete/activate/lock export in the read barrel is the
    // mistake this file exists to catch, whatever the symbol is called.
    expect(
      read.filter((name) =>
        // `(?![a-z])` so `handleRuntimeListFeeds` is not read as a "Run": the
        // verb has to end where the rule says it does.
        /^handle(Create|Update|Delete|Activate|Lock|Unlock|Release|Publish|Run)(?![a-z])/.test(
          name,
        ),
      ),
    ).toEqual([]);
  });

  it('the read barrel links no write handler module', () => {
    const graph = moduleGraph(join(SRC, 'lib', 'handlers', 'read.ts'));
    const offenders = [...graph]
      .filter((file) =>
        /\/handle(Create|Update|Delete|Activate|Lock|Unlock)[A-Z]\w*\.ts$/.test(
          file,
        ),
      )
      .map((file) => file.slice(SRC.length + 1))
      .sort();
    expect(offenders).toEqual([]);
  });
});
