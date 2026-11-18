/**
 * Every path that hands a connection to work, enumerated (the owner's one
 * kind, 2026-11-17): the main connection (`getConnection`), a fresh one
 * (`openFreshConnection`, the host's factory inside it), a connection the
 * factory builds (`createAbapConnection`) and the configured one
 * (`getManagedConnection`). Each acquisition is pinned by file and count,
 * so a new path fails here until it is reviewed for the kind check — and
 * the points a connection passes check the kind before it is handed on:
 * `getConnection` and a stdio start's `bornAtStart` (`kindRefusal`), and
 * `openFreshConnection` (`admitOnKind`, before the host's connection is
 * connected). Pinned beside them: a source resolved, a birth, a build.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');

/** The production sources: every package's `src`, tests and builds left out. */
function productionSources(): string[] {
  const roots = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ROOT, entry.name, 'src'))
    .filter((dir) => fs.existsSync(dir));
  roots.push(path.join(ROOT, 'src'));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === '__tests__' ||
          entry.name === '__typechecks__' ||
          entry.name === 'node_modules' ||
          entry.name === 'dist'
        ) {
          continue;
        }
        walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  };
  for (const root of [...new Set(roots)]) walk(root);
  return files;
}

/** How often `needle` occurs in `text`, plain string search. */
function count(text: string, needle: string): number {
  let at = text.indexOf(needle);
  let n = 0;
  while (at >= 0) {
    n += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return n;
}

const PRIMITIVES = [
  '.getConnection(',
  'openFreshConnection(',
  'hostFactories.get(',
  'createAbapConnection(',
  'getManagedConnection(',
  // The builders and connectors beside them: a source resolved, a birth
  // (a logon or a leftover session taken up), a connection built.
  '.source.resolve(',
  'bornAtStart(',
  'birthEntry(',
  'buildConnection(',
  'connectedLogon(',
] as const;

/** The reviewed acquisitions: file → primitive → count (declarations and comments included). */
const PINNED: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'server-runtime/src/stdio/StdioServer.ts': {
    '.getConnection(': 2,
    'bornAtStart(': 1,
  },
  'src/embeddable/BaseMcpServer.ts': {
    // The sixth: the one repeat of a call SAP refused for its token in a
    // new session takes the instance's connection again, as any call does.
    '.getConnection(': 6,
    '.source.resolve(': 3,
    'birthEntry(': 3,
    'bornAtStart(': 1,
    'buildConnection(': 4,
    'connectedLogon(': 3,
    'createAbapConnection(': 3,
  },
  'src/handlers/package/high/handleDeletePackage.ts': {
    'openFreshConnection(': 1,
  },
  'src/lib/backgroundRuns/run.ts': { 'openFreshConnection(': 1 },
  'src/lib/clients.ts': { 'getManagedConnection(': 1 },
  'src/lib/connectionFactory.ts': { 'createAbapConnection(': 2 },
  'src/lib/debugger/ports.ts': { 'openFreshConnection(': 1 },
  'src/lib/longCall.ts': { 'openFreshConnection(': 1 },
  'src/lib/packageSessions.ts': {
    'openFreshConnection(': 3,
    'hostFactories.get(': 1,
    'createAbapConnection(': 1,
  },
  'src/lib/utils.ts': {
    'getManagedConnection(': 4,
    'createAbapConnection(': 2,
  },
};

describe('the paths that hand a connection to work', () => {
  it('are exactly the reviewed ones — a new one is reviewed for the kind check here', () => {
    const found: Record<string, Record<string, number>> = {};
    for (const file of productionSources()) {
      const text = fs.readFileSync(file, 'utf8');
      for (const primitive of PRIMITIVES) {
        const n = count(text, primitive);
        if (n === 0) continue;
        const key = path.relative(ROOT, file).split(path.sep).join('/');
        found[key] = { ...(found[key] ?? {}), [primitive]: n };
      }
    }
    expect(found).toEqual(PINNED);
  });

  it('getConnection checks the one kind before it resolves, builds or hands on', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'src/embeddable/BaseMcpServer.ts'),
      'utf8',
    );
    const start = text.indexOf('protected async getConnection(');
    const body = text.slice(start, text.indexOf('\n  }\n', start));
    const check = body.indexOf('this.kindRefusal()');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(body.indexOf('return context.connection'));
    expect(check).toBeLessThan(body.indexOf('context.source.resolve('));
  });

  it('bornAtStart checks the one kind before it resolves or builds', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'src/embeddable/BaseMcpServer.ts'),
      'utf8',
    );
    const start = text.indexOf('protected async bornAtStart(');
    const body = text.slice(start, text.indexOf('\n  }\n', start));
    const check = body.indexOf('this.kindRefusal()');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(body.indexOf('context.source.resolve('));
    expect(check).toBeLessThan(body.indexOf('this.birthEntry('));
  });

  it('openFreshConnection checks the host’s connection before it connects it', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'src/lib/packageSessions.ts'),
      'utf8',
    );
    const start = text.indexOf('export async function openFreshConnection(');
    const body = text.slice(start, text.indexOf('\n}\n', start));
    const factory = body.indexOf('hostFactories.get(');
    const check = body.indexOf('admitOnKind(', factory);
    expect(check).toBeGreaterThan(factory);
    expect(check).toBeLessThan(body.indexOf('connectedOrClosed(given'));
  });
});
