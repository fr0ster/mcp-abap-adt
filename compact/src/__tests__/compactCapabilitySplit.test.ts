/**
 * A read-only compact surface may not be able to write — enforced by imports,
 * across package boundaries now.
 *
 * **Why the module graph and not the tool list.** `@mcp-abap-adt/compact-readonly`
 * lists thirteen tools and no write tool, which is easy to assert and proves little:
 * every compact tool once imported one shared router whose map held `create`,
 * `update` and `delete` beside `get`, so a consumer importing the read-only half
 * linked every write handler anyway. The point of the split is that capability
 * follows what is IMPORTED, so this walks the imports.
 *
 * **What changed when the halves became packages.** The line to watch is no longer
 * only a relative file: a write route can now arrive as a BARE specifier —
 * `@mcp-abap-adt/lib/handlers/write`, or the sibling package itself. So the walker
 * collects both kinds, follows the relative ones, and asserts on the bare ones by
 * name. That makes the guarantee stronger than the pre-package version: it is the
 * package's dependency surface that is checked, not one directory's.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');

interface Graph {
  files: Set<string>;
  bare: Set<string>;
}

/** Every local file reachable from an entry, and every package it names. */
function graphFrom(entry: string): Graph {
  const files = new Set<string>();
  const bare = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) {
        bare.add(specifier);
        continue;
      }
      const candidate = join(dirname(file), specifier.replace(/\.js$/, ''));
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          statSync(candidate + suffix);
          stack.push(candidate + suffix);
          break;
        } catch {
          // not this shape
        }
      }
    }
  }
  return { files, bare };
}

const packageEntry = (pkg: string) => join(REPO, pkg, 'src', 'index.ts');

describe('the compact capability split holds across the packages', () => {
  const readOnly = graphFrom(packageEntry('compact-readonly'));
  const modify = graphFrom(packageEntry('compact-modify'));
  const whole = graphFrom(packageEntry('compact'));

  const localFiles = (graph: Graph, pattern: RegExp) =>
    [...graph.files]
      .filter((file) => pattern.test(file))
      .map((file) => file.slice(REPO.length + 1))
      .sort();

  it('reads a graph at all — the walker is not silently empty', () => {
    // A resolver that finds nothing would make every assertion below pass.
    expect(readOnly.files.size).toBeGreaterThan(10);
    expect([...readOnly.bare]).toContain('@mcp-abap-adt/lib/handlers/read');
  });

  it('the read-only package never names the write barrel', () => {
    expect([...readOnly.bare]).not.toContain(
      '@mcp-abap-adt/lib/handlers/write',
    );
  });

  it('the read-only package never names the modifying package', () => {
    expect(
      [...readOnly.bare].filter((name) => name.includes('compact-modify')),
    ).toEqual([]);
  });

  it('the read-only package links no write route file', () => {
    expect(localFiles(readOnly, /compactWriteRoutes\.ts$/)).toEqual([]);
  });

  it('the modifying package does name the write barrel', () => {
    // The other direction, so a split that simply lost the routes fails too.
    expect([...modify.bare]).toContain('@mcp-abap-adt/lib/handlers/write');
    expect(localFiles(modify, /compactWriteRoutes\.ts$/)).toHaveLength(1);
  });

  it('the command serves both halves', () => {
    expect([...whole.bare]).toContain('@mcp-abap-adt/compact-readonly');
    expect([...whole.bare]).toContain('@mcp-abap-adt/compact-modify');
  });

  it('the read-only package declares no dependency on the modifying one', () => {
    // The manifest is the other half of the same promise: a package that cannot
    // import a write route must not be able to install one either.
    const manifest = JSON.parse(
      readFileSync(join(REPO, 'compact-readonly', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([
      '@mcp-abap-adt/lib',
    ]);
  });

  it('every compact tool file belongs to exactly one half', () => {
    const handlersOf = (pkg: string) =>
      readdirSync(join(REPO, pkg, 'src', 'handlers')).filter((name) =>
        name.startsWith('handleHandler'),
      );
    const read = handlersOf('compact-readonly');
    const write = handlersOf('compact-modify');
    expect(read).toHaveLength(13);
    expect(write).toHaveLength(9);
    expect(read.filter((name) => write.includes(name))).toEqual([]);
  });
});
