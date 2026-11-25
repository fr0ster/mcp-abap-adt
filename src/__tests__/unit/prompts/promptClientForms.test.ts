/**
 * How a client shows a prompt, as the docs state it: Claude Code's two forms
 * in its own documentation's words (https://code.claude.com/docs/en/mcp.md,
 * "Use MCP prompts as commands"), and other clients' own pickers. The
 * generated PROMPTS.md is checked as committed; its words come from
 * `tools/generate-tools-docs.js`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { repositoryRoot } from '../../helpers/repoRoot';

const ROOT = repositoryRoot(__dirname);

/** The Claude Code docs' sentences, as they read there. */
const LISTED = 'lists each MCP prompt as `/servername:promptname (MCP)`.';
const TYPED = 'Typing `/mcp__servername__promptname` also runs it.';

describe('how clients show a prompt', () => {
  for (const file of [
    'README.md',
    'docs/user-guide/PROMPTS.md',
    'docs/user-guide/CLIENT_CONFIGURATION.md',
    'tools/generate-tools-docs.js',
  ]) {
    it(file, () => {
      const text = readFileSync(join(ROOT, file), 'utf8')
        .split('\\`')
        .join('`')
        .split(/\s+/)
        .join(' ');
      assert.ok(text.includes(LISTED), `${file} quotes the listed form`);
      assert.ok(text.includes(TYPED), `${file} quotes the typed form`);
      assert.ok(
        text.includes('/abap:get (MCP)') &&
          text.includes('/mcp__abap__get class ZCL_DEMO'),
        `${file} shows both forms for a server named abap`,
      );
      assert.ok(
        text.includes('show prompts in their own pickers'),
        `${file} names other clients' pickers`,
      );
    });
  }
});
