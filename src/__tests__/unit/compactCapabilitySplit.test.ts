/**
 * A read-only compact surface may not be able to write — enforced by imports.
 *
 * **Why the module graph and not the tool list.** `CompactReadOnlyHandlersGroup`
 * lists thirteen tools and no write tool, which is easy to assert and proves
 * little: every compact tool used to import one shared router whose map held
 * `create`, `update` and `delete` beside `get`, so a consumer importing the
 * read-only group linked every write handler in the package anyway. The point of
 * the split is that capability follows what is INSTALLED and imported, not what a
 * list happens to enumerate — so this walks the imports from each group's file and
 * asserts what is reachable.
 *
 * The write routes are the line: `compactWriteRoutes` is where `create`, `update`
 * and `delete` are bound to handlers. If it is reachable from the read-only group,
 * the split is decorative.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');

/** Every local module a file imports, resolved to a path under `src`. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers = [...source.matchAll(/from\s+'(\.[^']+)'/g)].map(
    (match) => match[1],
  );
  const resolved: string[] = [];
  for (const specifier of specifiers) {
    const withoutExtension = specifier.replace(/\.js$/, '');
    const candidate = join(dirname(file), withoutExtension);
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        readFileSync(candidate + suffix, 'utf8');
        resolved.push(candidate + suffix);
        break;
      } catch {
        // not this shape; try the next
      }
    }
  }
  return resolved;
}

/** The transitive closure of local imports, starting at one file. */
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

const groupFile = (name: string) =>
  join(SRC, 'lib', 'handlers', 'groups', `${name}.ts`);

describe('the compact capability split holds in the imports', () => {
  const readOnlyGraph = moduleGraph(groupFile('CompactReadOnlyHandlersGroup'));
  const modifyGraph = moduleGraph(groupFile('CompactModifyHandlersGroup'));
  const wholeGraph = moduleGraph(groupFile('CompactHandlersGroup'));

  const relative = (files: Set<string>, pattern: RegExp) =>
    [...files]
      .filter((file) => pattern.test(file))
      .map((file) => file.slice(SRC.length + 1))
      .sort();

  it('reads a graph at all — the walker is not silently empty', () => {
    // A resolver that finds nothing would make every assertion below pass.
    expect(readOnlyGraph.size).toBeGreaterThan(20);
    expect(relative(readOnlyGraph, /compactReadRoutes\.ts$/)).toEqual([
      'handlers/compact/high/compactReadRoutes.ts',
    ]);
  });

  it('the read-only group cannot reach the write routes', () => {
    expect(relative(readOnlyGraph, /compactWriteRoutes\.ts$/)).toEqual([]);
  });

  it('the read-only group links no create, update or delete handler', () => {
    expect(
      relative(readOnlyGraph, /\/handle(Create|Update|Delete)[A-Z]\w*\.ts$/),
    ).toEqual([]);
  });

  it('the read-only group links no lock, unlock or activate handler', () => {
    // A lock is an enqueue and an activation writes: neither belongs to a
    // surface a consumer hands out as read-only.
    expect(
      relative(readOnlyGraph, /\/handle(Lock|Unlock|Activate)[A-Z]\w*\.ts$/),
    ).toEqual([]);
  });

  it('the modifying group does reach the write routes', () => {
    // The other direction, so a split that simply lost the routes fails too.
    expect(relative(modifyGraph, /compactWriteRoutes\.ts$/)).toEqual([
      'handlers/compact/high/compactWriteRoutes.ts',
    ]);
  });

  it('the whole facade has both halves', () => {
    expect(relative(wholeGraph, /compactReadRoutes\.ts$/)).toHaveLength(1);
    expect(relative(wholeGraph, /compactWriteRoutes\.ts$/)).toHaveLength(1);
  });
});
