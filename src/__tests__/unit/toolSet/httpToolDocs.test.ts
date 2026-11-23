/**
 * The generated tool pages say what each transport serves (#308).
 *
 * A Streamable HTTP binary serves its stdio set without the leftover-session
 * tools, every tool declaring an optional `state_handle`, and the long-session
 * tools (`SessionOpen`, `SessionClose`; compact `HandlerSession`). The pages
 * (`npm run docs:tools`, and compact's `docs:tools`) render that as their
 * Streamable HTTP section, taken from the registration the HTTP server uses
 * (`streamableHttpSurface`); the stdio and SSE parts claim none of it. A page
 * left stale after the surface changed goes red here.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { compactToolSet as compactHttpSet } from '../../../../compact-http/src/launcher';
import { readOnlyToolSet as compactHttpRoSet } from '../../../../compact-http-ro/src/launcher';
import { compactModifyEntries } from '../../../../compact-modify/src/group';
import { compactAbapGitEntries } from '../../../lib/compact/abapGit/group';
import { compactBackgroundRunEntries } from '../../../lib/compact/backgroundRuns/group';
import { compactBatchEntries } from '../../../lib/compact/batch/group';
import {
  compactDebugBatchEntries,
  compactDebugEntries,
} from '../../../lib/compact/debug/group';
import { compactLeftoverSessionEntries } from '../../../lib/compact/session/group';
import { STATE_HANDLE_ARGUMENT_WORDS } from '../../../lib/state/stateHandleArgument';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  streamableHttpSurface,
  type ToolSet,
} from '../../../lib/toolSet';
import { jsonAt, listedJson } from '../../helpers/listedJson';
import { repositoryRoot } from '../../helpers/repoRoot';

const generator = require(
  path.join(repositoryRoot(__dirname), 'tools', 'generate-tools-docs.js'),
);
const compactGenerator = require(
  path.join(repositoryRoot(__dirname), 'compact', 'tools', 'generate-docs.js'),
);

const REPO = repositoryRoot(__dirname);
const read = (...parts: string[]) =>
  fs.readFileSync(path.join(REPO, ...parts), 'utf8');

const ALL = read('docs', 'user-guide', 'AVAILABLE_TOOLS.md');
const READONLY = read('docs', 'user-guide', 'AVAILABLE_TOOLS_READONLY.md');
const HIGH = read('docs', 'user-guide', 'AVAILABLE_TOOLS_HIGH.md');
const COMPACT = read('compact', 'docs', 'AVAILABLE_TOOLS.md');

const HTTP_HEADING = '## Streamable HTTP Binaries';

/** The page before its Streamable HTTP section: the stdio and SSE part. */
function stdioPart(page: string): string {
  const at = page.indexOf(HTTP_HEADING);
  assert.ok(at > 0);
  return page.slice(0, at);
}

describe('the surface a Streamable HTTP binary adds', () => {
  it('the full sets add SessionOpen and SessionClose, declaring state_handle; the leftover-session tools are stdio only', () => {
    // The logoff is the full set's alone: it changes the system.
    const cases: [ToolSet, string[]][] = [
      [fullToolSet, ['ListLeftoverSessions', 'LogoffLeftoverSession']],
      [fullReadOnlyToolSet, ['ListLeftoverSessions']],
    ];
    for (const [set, stdioOnly] of cases) {
      const surface = streamableHttpSurface(set, { dataTools: true });
      assert.deepStrictEqual(
        surface.sessionTools.map((tool) => tool.name),
        ['SessionOpen', 'SessionClose'],
      );
      assert.deepStrictEqual([...surface.stdioOnly].sort(), stdioOnly);
      assert.equal(surface.stateHandleWords, STATE_HANDLE_ARGUMENT_WORDS);
      for (const tool of surface.sessionTools) {
        assert.deepStrictEqual(
          jsonAt(listedJson(tool.inputSchema), 'state_handle'),
          {
            type: 'string',
            description: STATE_HANDLE_ARGUMENT_WORDS,
          },
        );
      }
    }
  });

  it('the compact sets add HandlerSession', () => {
    for (const set of [compactHttpSet, compactHttpRoSet]) {
      assert.deepStrictEqual(
        streamableHttpSurface(set, { dataTools: true }).sessionTools.map(
          (tool) => tool.name,
        ),
        ['HandlerSession'],
      );
    }
  });
});

describe('the full tool pages (npm run docs:tools)', () => {
  it('a kind variant that differs is on the page: the cloud pull with overwrite', () => {
    const pull = generator
      .loadToolsFromHandlers()
      .find((tool: { name: string }) => tool.name === 'PullAbapGitRepo');
    assert.ok(pull);
    const shown: string = generator.variantMarkdown(pull);
    assert.ok(shown.includes('**Parameters (`cloud`):**'), shown);
    assert.ok(shown.includes('- `overwrite` (array, optional)'), shown);
    for (const page of [ALL, HIGH]) assert.ok(page.includes(shown));
  });

  it('AVAILABLE_TOOLS.md carries the Streamable HTTP section of mcp-abap-adt-http, as generated now', () => {
    const section = generator.httpSectionMarkdown(
      streamableHttpSurface(fullToolSet, { dataTools: true }),
    );
    assert.ok(section.includes('`state_handle`'));
    assert.ok(section.includes(STATE_HANDLE_ARGUMENT_WORDS));
    assert.ok(section.includes('SessionOpen'));
    assert.ok(section.includes('SessionClose'));
    assert.ok(section.includes('mcp-abap-adt-http'));
    assert.ok(ALL.includes(section));
  });

  it('AVAILABLE_TOOLS_READONLY.md carries the section of mcp-abap-adt-http-ro', () => {
    const section = generator.httpSectionMarkdown(
      streamableHttpSurface(fullReadOnlyToolSet, { dataTools: true }),
    );
    assert.ok(section.includes('mcp-abap-adt-http-ro'));
    assert.ok(READONLY.includes(section));
  });

  it('each page lists its Streamable HTTP section in its navigation, the long-session tools under it', () => {
    const navigation = (page: string) => {
      const start = page.indexOf('## Navigation');
      assert.ok(start > 0);
      return page.slice(start, page.indexOf('\n---\n', start));
    };
    const all = generator.httpNavigationMarkdown(
      streamableHttpSurface(fullToolSet, { dataTools: true }),
    );
    assert.ok(all.includes('[SessionOpen](#sessionopen-streamable-http)'));
    assert.ok(all.includes('[SessionClose](#sessionclose-streamable-http)'));
    assert.ok(navigation(ALL).includes(all));
    assert.ok(ALL.includes('<a id="sessionopen-streamable-http"></a>'));
    assert.ok(
      navigation(READONLY).includes(
        generator.httpNavigationMarkdown(
          streamableHttpSurface(fullReadOnlyToolSet, { dataTools: true }),
        ),
      ),
    );
    assert.ok(
      navigation(HIGH).includes(
        '- [Streamable HTTP Binaries](#streamable-http-binaries)',
      ),
    );
  });

  it('AVAILABLE_TOOLS_HIGH.md names the state_handle rule of mcp-abap-adt-http', () => {
    assert.ok(
      HIGH.includes(
        generator.stateHandleRule(
          streamableHttpSurface(fullToolSet, { dataTools: true }),
        ),
      ),
    );
  });

  it('the stdio and SSE part of each page lists no session tool, declares no state_handle and no longer says HTTP serves the stdio set minus the leftover tools alone', () => {
    for (const page of [ALL, READONLY]) {
      const part = stdioPart(page);
      assert.ok(!part.includes('#### SessionOpen'));
      assert.ok(!part.includes('#### SessionClose'));
      assert.ok(!part.includes(STATE_HANDLE_ARGUMENT_WORDS));
    }
    assert.ok(
      !READONLY.includes(
        '(and `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`: the same set without',
      ),
    );
  });
});

describe('the compact tool page (compact docs:tools)', () => {
  it('carries the Streamable HTTP section of -compact-http and -compact-http-ro, as generated now', () => {
    const section = compactGenerator.httpSection([
      streamableHttpSurface(compactHttpSet, { dataTools: true }),
      streamableHttpSurface(compactHttpRoSet, { dataTools: true }),
    ]);
    assert.ok(section.includes('`state_handle`'));
    assert.ok(section.includes(STATE_HANDLE_ARGUMENT_WORDS));
    assert.ok(section.includes('HandlerSession'));
    assert.ok(section.includes('mcp-abap-adt-compact-http'));
    assert.ok(section.includes('mcp-abap-adt-compact-http-ro'));
    assert.ok(COMPACT.includes(section));
  });

  it('its stdio and SSE part lists no HandlerSession and no longer says HTTP serves the stdio set minus the leftover tools alone', () => {
    const part = stdioPart(COMPACT);
    assert.ok(!part.includes('### HandlerSession'));
    assert.ok(!part.includes(STATE_HANDLE_ARGUMENT_WORDS));
    assert.ok(
      !COMPACT.includes(
        'each with its `-ro`, the same without the leftover-session tools)',
      ),
    );
  });

  it('is the page generated now from the compact tools, whole', () => {
    assert.equal(
      COMPACT,
      compactGenerator.compactPage({
        readOnly: { compactReadOnlyEntries, compactDataEntries },
        modify: { compactModifyEntries },
        debug: { compactDebugEntries, compactDebugBatchEntries },
        background: { compactBackgroundRunEntries },
        session: { compactLeftoverSessionEntries },
        batch: { compactBatchEntries },
        abapGit: { compactAbapGitEntries },
        toolSet: {
          compactToolSetOf,
          compactReadOnlyToolSetOf,
          streamableHttpSurface,
        },
      }).text,
      'compact/docs/AVAILABLE_TOOLS.md is stale: run `npm run build` and `npm --prefix compact run docs:tools`',
    );
  });
});
