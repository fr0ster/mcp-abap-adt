/**
 * The stateful sites: every place that turns a connection's
 * session type — the server's own in every package's `src`, and adt-clients'
 * in its installed `dist` — is a row of `tools/stateful-sites.json`, naming
 * the window it opens, where the connection returns to stateless, and whose
 * site it is. The scan below finds the sites and they must equal the JSON's:
 * a new `setSessionType('stateful')` without a row fails, and so does a
 * listed site that is gone. A server site may open no tool window: the
 * debugger's own session is the one stateful server site.
 *
 * What is a site: a call of `setSessionType` with its literal argument, a
 * call of `restoreSessionInConnection` or `inStatefulSession`, and the
 * session header `x-sap-adt-sessiontype` written in code. Plain code over the
 * sources: comments and imports are skipped, a call is its name followed by
 * `(` (or `?.(`).
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
  'compact-readonly-entries/src',
  'compact-modify/src',
  'server/src',
  'http/src',
  'sse/src',
  'background-runs-memory/src',
  'responsible-rules/src',
  'core-ro/src',
  'http-ro/src',
  'sse-ro/src',
  'compact-ro/src',
  'compact-http-ro/src',
  'compact-sse-ro/src',
];
const ADT_CLIENTS = 'node_modules/@mcp-abap-adt/adt-clients/dist';

interface Site {
  file: string;
  site: string;
}

function sourceFiles(dir: string, extension: '.ts' | '.js'): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...sourceFiles(full, extension));
    } else if (
      entry.name.endsWith(extension) &&
      !entry.name.endsWith('.d.ts')
    ) {
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

const isNamePart = (c: string | undefined) =>
  c !== undefined &&
  ((c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') ||
    c === '_' ||
    c === '$');

/** The sites of one line of code. */
function sitesOf(code: string): string[] {
  const sites: string[] = [];
  // setSessionType(<literal>) and setSessionType?.(<literal>).
  for (const call of ['setSessionType(', 'setSessionType?.(']) {
    let at = code.indexOf(call);
    while (at >= 0) {
      if (!isNamePart(code[at - 1])) {
        const from = at + call.length;
        const to = code.indexOf(')', from);
        const argument = (to < 0 ? code.slice(from) : code.slice(from, to))
          .trim()
          .split('"')
          .join("'");
        sites.push(`setSessionType(${argument})`);
      }
      at = code.indexOf(call, at + call.length);
    }
  }
  // A call of a window helper, the compiled `(0, m.inStatefulSession)(`
  // included; never its declaration.
  for (const name of ['restoreSessionInConnection', 'inStatefulSession']) {
    let at = code.indexOf(name);
    while (at >= 0) {
      const after = code.slice(at + name.length);
      const called = after.startsWith('(') || after.startsWith(')(');
      const declared = code.includes(`function ${name}`);
      if (!isNamePart(code[at - 1]) && called && !declared) sites.push(name);
      at = code.indexOf(name, at + name.length);
    }
  }
  if (code.toLowerCase().includes('x-sap-adt-sessiontype')) {
    sites.push('x-sap-adt-sessiontype');
  }
  return sites;
}

/** Every site under `dirs`, as `file site`, one per occurrence, sorted. */
function scan(
  root: string,
  dirs: string[],
  extension: '.ts' | '.js',
): string[] {
  const found: Site[] = [];
  for (const dir of dirs) {
    for (const file of sourceFiles(path.join(root, dir), extension)) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      const comment = { on: false };
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const code = codeOf(line, comment);
        if (code.trim() === '') continue;
        for (const site of sitesOf(code)) found.push({ file: relative, site });
      }
    }
  }
  return found
    .map((s) => `${s.file} ${s.site}`)
    .sort((a, b) => a.localeCompare(b));
}

interface Row {
  file: string;
  function: string;
  site: string;
  count: number;
  window: string;
  stateless: string;
  whose: 'server' | 'adt-clients';
}

const LISTED = path.join(REPO, 'tools/stateful-sites.json');
const listed = (): Row[] =>
  JSON.parse(fs.readFileSync(LISTED, 'utf8')) as Row[];

/** The JSON's rows of `whose`, one entry per counted occurrence, sorted. */
function rowsOf(whose: Row['whose']): string[] {
  const out: string[] = [];
  for (const row of listed()) {
    if (row.whose !== whose) continue;
    for (let i = 0; i < row.count; i += 1) out.push(`${row.file} ${row.site}`);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

describe('every stateful site is listed with its window', () => {
  it("the server's sites equal tools/stateful-sites.json's", () => {
    expect(scan(REPO, PACKAGES, '.ts')).toEqual(rowsOf('server'));
  });

  it("adt-clients' sites, in its installed dist, equal tools/stateful-sites.json's", () => {
    expect(scan(REPO, [ADT_CLIENTS], '.js')).toEqual(rowsOf('adt-clients'));
  });

  it('every row names its function, its window, where it returns to stateless, and whose it is', () => {
    for (const row of listed()) {
      expect(row.function.trim()).not.toBe('');
      expect(row.window.trim()).not.toBe('');
      expect(row.stateless.trim()).not.toBe('');
      expect(['server', 'adt-clients']).toContain(row.whose);
      expect(row.count).toBeGreaterThan(0);
    }
  });

  it("the server's one stateful site is the debugger's own session", () => {
    const stateful = listed().filter(
      (r) =>
        r.whose === 'server' &&
        (r.site.includes("'stateful'") ||
          r.site === 'restoreSessionInConnection' ||
          r.site === 'inStatefulSession' ||
          r.site === 'x-sap-adt-sessiontype'),
    );
    expect(stateful.map((r) => `${r.file} ${r.function}`)).toEqual([
      'src/lib/debugger/ports.ts openStateful',
    ]);
  });

  it('the scan finds a new site, and skips comments and declarations (load-bearing)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stateful-sites-'));
    try {
      fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'src/lib/probe.ts'),
        [
          "// connection.setSessionType('stateful') in a comment",
          "/* restoreSessionInConnection(c, 'id', {}) */",
          'export async function restoreSessionInConnection() {}',
          "export const leak = (c) => c.setSessionType('stateful');",
          "export const back = (c) => c.setSessionType?.('stateless');",
          'export const kept = (c) => restoreSessionInConnection(c);',
          "const headers = { 'x-sap-adt-sessiontype': 'stateful' };",
          '',
        ].join('\n'),
      );
      expect(scan(root, ['src'], '.ts')).toEqual([
        'src/lib/probe.ts restoreSessionInConnection',
        "src/lib/probe.ts setSessionType('stateful')",
        "src/lib/probe.ts setSessionType('stateless')",
        'src/lib/probe.ts x-sap-adt-sessiontype',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
