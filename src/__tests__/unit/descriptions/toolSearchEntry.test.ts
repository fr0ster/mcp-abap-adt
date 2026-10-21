/**
 * `@mcp-abap-adt/lib/tool-search`, the subpath a consumer's tool search
 * imports the search texts from: resolved through the package's own
 * `exports` as a consumer's Node resolves it (after a build), exactly its
 * public names, and the texts it answers the ones `tools/list` carries.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  TOOL_SEARCH_META_KEY,
  toolSearchText,
  toolSearchTexts,
} from '@mcp-abap-adt/lib/tool-search';

const root = path.join(__dirname, '..', '..', '..', '..');
const PUBLIC = ['TOOL_SEARCH_META_KEY', 'toolSearchText', 'toolSearchTexts'];

describe('@mcp-abap-adt/lib/tool-search through the package exports', () => {
  const built = fs.existsSync(
    path.join(root, 'dist', 'lib', 'toolSearch', 'index.js'),
  );
  const t = built ? it : it.skip;

  t(
    'resolves to the built module and its types, exports only the public names, and reads the shipped table',
    () => {
      const script = [
        "const resolved = require.resolve('@mcp-abap-adt/lib/tool-search');",
        "const m = require('@mcp-abap-adt/lib/tool-search');",
        "const names = Object.keys(m).filter((k) => k !== '__esModule').sort();",
        "const ddl = m.toolSearchText('GetDdl');",
        'process.stdout.write(JSON.stringify({ resolved, names, size: m.toolSearchTexts().size, ddl }));',
      ].join('\n');
      const run = spawnSync(process.execPath, ['-e', script], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(run.status).toBe(0);
      const { resolved, names, size, ddl } = JSON.parse(run.stdout);
      expect(resolved).toBe(
        path.join(root, 'dist', 'lib', 'toolSearch', 'index.js'),
      );
      expect(
        fs.existsSync(
          path.join(root, 'dist', 'lib', 'toolSearch', 'index.d.ts'),
        ),
      ).toBe(true);
      expect(names).toEqual(PUBLIC);
      expect(size).toBe(toolSearchTexts().size);
      expect(ddl).toEqual(toolSearchText('GetDdl'));
    },
  );
});

describe('the search texts', () => {
  it('answers a tool by name, and none for a name no tool has', () => {
    expect(TOOL_SEARCH_META_KEY).toBe('mcp-abap-adt/search');
    const ddl = toolSearchText('GetDdl');
    expect(ddl?.keywords).toContain('CDS view');
    expect(ddl?.semantic).toContain('CDS view');
    expect(toolSearchText('NoSuchTool')).toBeUndefined();
    expect(toolSearchTexts().get('GetDdl')).toBe(ddl);
  });
});
