/**
 * `lib`'s two public handler halves stay two halves.
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
    expect(read).toHaveLength(35);
    // 69 handlers plus TYPE_TO_FAMILY, the activation family map.
    expect(write).toHaveLength(70);
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

  it('together cover the compact facade, module for module', () => {
    // The union is what the facade needs; a handler that belongs to neither
    // barrel would leave the package that routes to it unable to import it.
    const facade = new Set(
      [
        ...moduleGraph(
          join(
            SRC,
            'lib',
            'handlers',
            'groups',
            'CompactReadOnlyHandlersGroup.ts',
          ),
        ),
        ...moduleGraph(
          join(
            SRC,
            'lib',
            'handlers',
            'groups',
            'CompactModifyHandlersGroup.ts',
          ),
        ),
      ].filter((file) =>
        /\/handlers\/(?!compact\/)[a-z_]+\/\w+\/handle\w+\.ts$/.test(file),
      ),
    );
    const barrelled = new Set([
      ...moduleGraph(join(SRC, 'lib', 'handlers', 'read.ts')),
      ...moduleGraph(join(SRC, 'lib', 'handlers', 'write.ts')),
    ]);
    const missing = [...facade]
      .filter((file) => !barrelled.has(file))
      .map((file) => file.slice(SRC.length + 1))
      .sort();
    expect(missing).toEqual([]);
  });
});
