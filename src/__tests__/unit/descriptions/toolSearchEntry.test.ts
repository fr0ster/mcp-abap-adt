/**
 * `@mcp-abap-adt/lib/tool-search`, the subpath a consumer's tool search
 * imports the search texts from: resolved through the package's own
 * `exports` as a consumer's Node resolves it (after a build), exactly its
 * public names, and the texts it answers the ones `tools/list` carries.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import {
  TOOL_SEARCH_META_KEY,
  toolSearchText,
  toolSearchTexts,
} from '@mcp-abap-adt/lib/tool-search';
import { repositoryRoot } from '../../helpers/repoRoot';

const root = repositoryRoot(__dirname);
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
      assert.equal(run.status, 0);
      const { resolved, names, size, ddl } = JSON.parse(run.stdout);
      assert.equal(
        resolved,
        path.join(root, 'dist', 'lib', 'toolSearch', 'index.js'),
      );
      assert.equal(
        fs.existsSync(
          path.join(root, 'dist', 'lib', 'toolSearch', 'index.d.ts'),
        ),
        true,
      );
      assert.deepStrictEqual(names, PUBLIC);
      assert.equal(size, toolSearchTexts().size);
      assert.deepStrictEqual(ddl, toolSearchText('GetDdl'));
    },
  );
});

describe('the search texts', () => {
  it('answers a tool by name, and none for a name no tool has', () => {
    assert.equal(TOOL_SEARCH_META_KEY, 'mcp-abap-adt/search');
    const ddl = toolSearchText('GetDdl');
    assert.ok(ddl?.keywords.includes('CDS view'));
    assert.ok(ddl?.semantic.includes('CDS view'));
    assert.equal(toolSearchText('NoSuchTool'), undefined);
    assert.equal(toolSearchTexts().get('GetDdl'), ddl);
  });
});
