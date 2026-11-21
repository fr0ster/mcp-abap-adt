/**
 * The public surface of `@mcp-abap-adt/lib/prompts` (M6): what an embedder
 * needs and HANDLER_EXPORTER.md documents — `registerAbapPrompts` alone.
 * Its signature names `McpServer` (the SDK's) and `CompositeHandlersRegistry`
 * (`@mcp-abap-adt/lib/handlers`); everything else under `src/lib/prompts/`
 * is internal, imported by its own module.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import * as prompts from '../../../lib/prompts';
import { repositoryRoot } from '../../helpers/repoRoot';

describe('@mcp-abap-adt/lib/prompts', () => {
  it('exports registerAbapPrompts alone', () => {
    assert.deepEqual(Object.keys(prompts).sort(), ['registerAbapPrompts']);
  });

  it('is the subpath the package maps to src/lib/prompts/index', () => {
    const manifest: { exports: Record<string, { import: string }> } =
      JSON.parse(
        readFileSync(join(repositoryRoot(__dirname), 'package.json'), 'utf8'),
      );
    assert.equal(
      manifest.exports['./prompts']?.import,
      './dist/lib/prompts/index.js',
    );
  });
});
