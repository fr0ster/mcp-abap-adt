/**
 * D55's sweep, kept: every place the server creates a connection, takes
 * ownership of one, or retains connections has a listed end
 * (`tools/connection-ends.json`). The scan below finds the creation sites in
 * every package's `src` — calls of `createAbapConnection`, connection's
 * `createConnection`, `new AdtOnPremConnector` / `new AdtCloudConnector`,
 * `openFreshConnection`, `inOwnSessionOverRfc`, `connectionForPackageLock`,
 * `getManagedConnection`, a consumer's `freshConnection` factory, the
 * debugger's ports, and every `Map` / `WeakMap` / `Set` / `WeakSet` whose
 * type names a connection — and they must equal the JSON's: a new site
 * without a listed end fails, and so does a listed site that is gone.
 *
 * Plain code over the repository's own sources: comments and imports are
 * skipped, a call is its name followed by `(`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const REPO = path.resolve(__dirname, '../../../..');
const PACKAGES = [
  'src',
  'compact/src',
  'compact-http/src',
  'compact-sse/src',
  'compact-readonly/src',
  'compact-modify/src',
  'server/src',
  'http/src',
  'sse/src',
];

/** What a creation site is, as the scan names it. */
const CALLS = [
  'createAbapConnection(',
  'createConnection(',
  'new AdtOnPremConnector(',
  'new AdtCloudConnector(',
  'openFreshConnection(',
  'inOwnSessionOverRfc(',
  'connectionForPackageLock(',
  'getManagedConnection(',
  'liveDebugPorts(',
  'liveAmdpPorts(',
];
/** A consumer's `freshConnection`, called where it is taken (D22). */
const FRESH_FACTORY = 'await factory()';
const COLLECTIONS = ['new Map<', 'new WeakMap<', 'new Set<', 'new WeakSet<'];

interface Site {
  file: string;
  site: string;
}

function tsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The code of a line: nothing of a comment or an import. */
function codeOf(line: string, inComment: { on: boolean }): string {
  let text = line;
  if (inComment.on) {
    const end = text.indexOf('*/');
    if (end < 0) return '';
    inComment.on = false;
    text = text.slice(end + 2);
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) return '';
  if (trimmed.startsWith('import ') || trimmed.startsWith('export {'))
    return '';
  const open = text.indexOf('/*');
  if (open >= 0) {
    const close = text.indexOf('*/', open + 2);
    if (close < 0) {
      inComment.on = true;
      return text.slice(0, open);
    }
    return text.slice(0, open) + text.slice(close + 2);
  }
  const slashes = text.indexOf('//');
  return slashes >= 0 ? text.slice(0, slashes) : text;
}

/** A function's own declaration is not a call of it. */
const isDeclaration = (code: string, call: string) => {
  const name = call.slice(0, -1);
  return (
    code.includes(`function ${name}(`) || code.includes(`function ${name}<`)
  );
};

/** Whitespace runs as one space: plain code. */
function collapsed(text: string): string {
  let out = '';
  let space = false;
  for (const c of text) {
    const isSpace = c === ' ' || c === '\n' || c === '\t' || c === '\r';
    if (isSpace) {
      if (!space && out !== '') out += ' ';
      space = true;
    } else {
      out += c;
      space = false;
    }
  }
  return out.trim();
}

/** The creation sites under `repo`, sorted. */
function scanSites(repo = REPO): Site[] {
  const sites: Site[] = [];
  for (const pkg of PACKAGES) {
    for (const file of tsFiles(path.join(repo, pkg))) {
      const relative = path.relative(repo, file).split(path.sep).join('/');
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const comment = { on: false };
      for (let i = 0; i < lines.length; i += 1) {
        const code = codeOf(lines[i] ?? '', comment);
        if (code.trim() === '') continue;
        for (const call of CALLS) {
          let at = code.indexOf(call);
          while (at >= 0) {
            const before = at > 0 ? code[at - 1] : ' ';
            const partOfName =
              before !== undefined &&
              ((before >= 'a' && before <= 'z') ||
                (before >= 'A' && before <= 'Z') ||
                (before >= '0' && before <= '9') ||
                before === '_');
            if (!partOfName && !isDeclaration(code, call)) {
              sites.push({ file: relative, site: call.slice(0, -1) });
            }
            at = code.indexOf(call, at + call.length);
          }
        }
        if (code.includes(FRESH_FACTORY)) {
          sites.push({ file: relative, site: 'freshConnection' });
        }
        for (const collection of COLLECTIONS) {
          const at = code.indexOf(collection);
          if (at < 0) continue;
          // The type arguments, up to the constructor's `(`, over lines.
          let type = code.slice(at + collection.length);
          let j = i;
          while (!type.includes('>(') && j + 1 < lines.length) {
            j += 1;
            type += lines[j] ?? '';
          }
          type = type.slice(0, type.indexOf('>('));
          if (type.includes('Connection')) {
            sites.push({
              file: relative,
              site: `${collection.slice(4, -1)}<${collapsed(type)}>`,
            });
          }
        }
      }
    }
  }
  return sites.sort((a, b) =>
    `${a.file} ${a.site}`.localeCompare(`${b.file} ${b.site}`),
  );
}

interface ListedEnd {
  file: string;
  function: string;
  site: string;
  end: string;
  why: string;
}

const LISTED = path.join(REPO, 'tools/connection-ends.json');

const listed = (): ListedEnd[] =>
  JSON.parse(fs.readFileSync(LISTED, 'utf8')) as ListedEnd[];

describe('every owned connection has a listed end (D55)', () => {
  it("the scan's creation sites equal tools/connection-ends.json's", () => {
    const found = scanSites().map((s) => `${s.file} ${s.site}`);
    const named = listed()
      .map((l) => `${l.file} ${l.site}`)
      .sort((a, b) => a.localeCompare(b));
    expect(found).toEqual(named);
  });

  it('every listed site names its end and why', () => {
    for (const entry of listed()) {
      expect(entry.function.trim()).not.toBe('');
      expect(entry.end.trim()).not.toBe('');
      expect(entry.why.trim()).not.toBe('');
    }
  });

  it('the scan finds a new creation site, and skips comments and declarations (load-bearing)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-ends-'));
    try {
      fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'src/lib/probe.ts'),
        [
          '// createAbapConnection(settings) in a comment',
          '/* openFreshConnection(c) */',
          'export function createAbapConnection() {}',
          'export const leak = () => createAbapConnection();',
          'const kept = new Map<string, IAbapConnection>();',
          '',
        ].join('\n'),
      );
      const found = scanSites(root);
      expect(found).toHaveLength(2);
      expect(found).toEqual(
        expect.arrayContaining([
          { file: 'src/lib/probe.ts', site: 'Map<string, IAbapConnection>' },
          { file: 'src/lib/probe.ts', site: 'createAbapConnection' },
        ]),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
