/**
 * A debugger tool outside the main flow (`DEBUGGER_OWN_CONNECTION_TOOLS`,
 * spec §5.7) works only on the debugger's own connections: its handler — and
 * the local helpers it imports from its own directory — never reads the
 * call's `connection`. A tool that does (the memory-snapshot tools) stays in
 * the flow. Plain code over the sources: comments and imports skipped.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEBUGGER_OWN_CONNECTION_TOOLS } from '../../../lib/debugger/ownConnectionTools';

const REPO = path.resolve(__dirname, '../../../..');
const HANDLER_DIRS = ['src/handlers/debugger', 'src/lib/compact/debug'];

function tsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The code of a file: no comment, no import line. */
function codeOf(text: string): string[] {
  const out: string[] = [];
  let inComment = false;
  for (const raw of text.split('\n')) {
    let line = raw;
    if (inComment) {
      const end = line.indexOf('*/');
      if (end < 0) continue;
      inComment = false;
      line = line.slice(end + 2);
    }
    const open = line.indexOf('/*');
    if (open >= 0) {
      const close = line.indexOf('*/', open + 2);
      if (close < 0) {
        inComment = true;
        line = line.slice(0, open);
      } else {
        line = line.slice(0, open) + line.slice(close + 2);
      }
    }
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    if (trimmed.startsWith('import ')) continue;
    const slashes = line.indexOf('//');
    out.push(slashes >= 0 ? line.slice(0, slashes) : line);
  }
  return out;
}

/** The file that declares the tool `name` (`name: '<name>'`). */
function handlerFileOf(root: string, name: string): string | undefined {
  for (const dir of HANDLER_DIRS) {
    for (const file of tsFiles(path.join(root, dir))) {
      if (fs.readFileSync(file, 'utf8').includes(`name: '${name}'`))
        return file;
    }
  }
  return undefined;
}

/** `file` and the files it imports from its own directory (`./x`). */
function withLocalImports(file: string): string[] {
  const files = [file];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const at = line.indexOf("from './");
    if (at < 0) continue;
    const end = line.indexOf("'", at + 6);
    const local = line.slice(at + 6, end);
    const target = path.join(path.dirname(file), `${local}.ts`);
    if (fs.existsSync(target)) files.push(target);
  }
  return files;
}

/** The lines of `file` (and its local imports) that read a `.connection`. */
function connectionReads(file: string): string[] {
  const found: string[] = [];
  for (const each of withLocalImports(file)) {
    for (const line of codeOf(fs.readFileSync(each, 'utf8'))) {
      let at = line.indexOf('.connection');
      while (at >= 0) {
        const next = line[at + '.connection'.length];
        const partOfName =
          next !== undefined &&
          ((next >= 'a' && next <= 'z') ||
            (next >= 'A' && next <= 'Z') ||
            (next >= '0' && next <= '9') ||
            next === '_');
        if (!partOfName) {
          found.push(`${path.basename(each)}: ${line.trim()}`);
          break;
        }
        at = line.indexOf('.connection', at + 1);
      }
    }
  }
  return found;
}

describe('the debugger tools outside the main flow read no call connection', () => {
  it.each(DEBUGGER_OWN_CONNECTION_TOOLS.map((tool) => [tool]))(
    '%s: its handler is found and reads no `.connection`',
    (tool) => {
      const file = handlerFileOf(REPO, tool);
      expect(file).toBeDefined();
      expect(connectionReads(file as string)).toEqual([]);
    },
  );

  it('the memory-snapshot tools read it, and are not listed', () => {
    for (const tool of [
      'MemorySnapshotList',
      'MemorySnapshotGet',
      'MemorySnapshotDelta',
    ]) {
      const file = handlerFileOf(REPO, tool);
      expect(file).toBeDefined();
      expect(connectionReads(file as string).length).toBeGreaterThan(0);
      expect(DEBUGGER_OWN_CONNECTION_TOOLS).not.toContain(tool);
    }
  });

  it('the scan sees a read, also in a local import, and skips comments (load-bearing)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-own-'));
    try {
      const dir = path.join(root, 'src/handlers/debugger');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'probe.ts'),
        [
          "import { helper } from './helper';",
          "export const TOOL = { name: 'ProbeTool' };",
          '// context.connection in a comment',
          'export const run = (context) => helper(context);',
          '',
        ].join('\n'),
      );
      fs.writeFileSync(
        path.join(dir, 'helper.ts'),
        'export const helper = (context) => context.connection.makeAdtRequest({});\n',
      );
      const file = handlerFileOf(root, 'ProbeTool');
      expect(file).toBeDefined();
      expect(connectionReads(file as string)).toEqual([
        'helper.ts: export const helper = (context) => context.connection.makeAdtRequest({});',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
