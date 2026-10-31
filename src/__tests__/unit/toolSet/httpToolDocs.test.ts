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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compactToolSet as compactHttpSet } from '../../../../compact-http/src/launcher';
import { readOnlyToolSet as compactHttpRoSet } from '../../../../compact-http-ro/src/launcher';
import { STATE_HANDLE_ARGUMENT_WORDS } from '../../../lib/state/stateHandleArgument';
import {
  fullReadOnlyToolSet,
  fullToolSet,
  streamableHttpSurface,
  type ToolSet,
} from '../../../lib/toolSet';

const generator = require('../../../../tools/generate-tools-docs.js');
const compactGenerator = require('../../../../compact/tools/generate-docs.js');

const REPO = path.join(__dirname, '..', '..', '..', '..');
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
  expect(at).toBeGreaterThan(0);
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
      const surface = streamableHttpSurface(set);
      expect(surface.sessionTools.map((tool) => tool.name)).toEqual([
        'SessionOpen',
        'SessionClose',
      ]);
      expect([...surface.stdioOnly].sort()).toEqual(stdioOnly);
      expect(surface.stateHandleWords).toBe(STATE_HANDLE_ARGUMENT_WORDS);
      for (const tool of surface.sessionTools) {
        const schema = tool.inputSchema as {
          properties: Record<string, unknown>;
        };
        expect(schema.properties.state_handle).toEqual({
          type: 'string',
          description: STATE_HANDLE_ARGUMENT_WORDS,
        });
      }
    }
  });

  it('the compact sets add HandlerSession', () => {
    for (const set of [compactHttpSet, compactHttpRoSet]) {
      expect(
        streamableHttpSurface(set).sessionTools.map((tool) => tool.name),
      ).toEqual(['HandlerSession']);
    }
  });
});

describe('the full tool pages (npm run docs:tools)', () => {
  it('AVAILABLE_TOOLS.md carries the Streamable HTTP section of mcp-abap-adt-http, as generated now', () => {
    const section = generator.httpSectionMarkdown(
      streamableHttpSurface(fullToolSet),
    );
    expect(section).toContain('`state_handle`');
    expect(section).toContain(STATE_HANDLE_ARGUMENT_WORDS);
    expect(section).toContain('SessionOpen');
    expect(section).toContain('SessionClose');
    expect(section).toContain('mcp-abap-adt-http');
    expect(ALL).toContain(section);
  });

  it('AVAILABLE_TOOLS_READONLY.md carries the section of mcp-abap-adt-http-ro', () => {
    const section = generator.httpSectionMarkdown(
      streamableHttpSurface(fullReadOnlyToolSet),
    );
    expect(section).toContain('mcp-abap-adt-http-ro');
    expect(READONLY).toContain(section);
  });

  it('each page lists its Streamable HTTP section in its navigation, the long-session tools under it', () => {
    const navigation = (page: string) => {
      const start = page.indexOf('## Navigation');
      expect(start).toBeGreaterThan(0);
      return page.slice(start, page.indexOf('\n---\n', start));
    };
    const all = generator.httpNavigationMarkdown(
      streamableHttpSurface(fullToolSet),
    );
    expect(all).toContain('[SessionOpen](#sessionopen-streamable-http)');
    expect(all).toContain('[SessionClose](#sessionclose-streamable-http)');
    expect(navigation(ALL)).toContain(all);
    expect(ALL).toContain('<a id="sessionopen-streamable-http"></a>');
    expect(navigation(READONLY)).toContain(
      generator.httpNavigationMarkdown(
        streamableHttpSurface(fullReadOnlyToolSet),
      ),
    );
    expect(navigation(HIGH)).toContain(
      '- [Streamable HTTP Binaries](#streamable-http-binaries)',
    );
  });

  it('AVAILABLE_TOOLS_HIGH.md names the state_handle rule of mcp-abap-adt-http', () => {
    expect(HIGH).toContain(
      generator.stateHandleRule(streamableHttpSurface(fullToolSet)),
    );
  });

  it('the stdio and SSE part of each page lists no session tool, declares no state_handle and no longer says HTTP serves the stdio set minus the leftover tools alone', () => {
    for (const page of [ALL, READONLY]) {
      const part = stdioPart(page);
      expect(part).not.toContain('#### SessionOpen');
      expect(part).not.toContain('#### SessionClose');
      expect(part).not.toContain(STATE_HANDLE_ARGUMENT_WORDS);
    }
    expect(READONLY).not.toContain(
      '(and `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`: the same set without',
    );
  });
});

describe('the compact tool page (compact docs:tools)', () => {
  it('carries the Streamable HTTP section of -compact-http and -compact-http-ro, as generated now', () => {
    const section = compactGenerator.httpSection([
      streamableHttpSurface(compactHttpSet),
      streamableHttpSurface(compactHttpRoSet),
    ]);
    expect(section).toContain('`state_handle`');
    expect(section).toContain(STATE_HANDLE_ARGUMENT_WORDS);
    expect(section).toContain('HandlerSession');
    expect(section).toContain('mcp-abap-adt-compact-http');
    expect(section).toContain('mcp-abap-adt-compact-http-ro');
    expect(COMPACT).toContain(section);
  });

  it('its stdio and SSE part lists no HandlerSession and no longer says HTTP serves the stdio set minus the leftover tools alone', () => {
    const part = stdioPart(COMPACT);
    expect(part).not.toContain('### HandlerSession');
    expect(part).not.toContain(STATE_HANDLE_ARGUMENT_WORDS);
    expect(COMPACT).not.toContain(
      'each with its `-ro`, the same without the leftover-session tools)',
    );
  });
});
