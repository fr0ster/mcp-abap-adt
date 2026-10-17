/**
 * No tool declares `session_id` or `session_state` (removed in 19.0.0): a
 * tool cannot reach into the connection's session — every call of one MCP
 * session runs on the instance's own connection, one at a time, and a lock
 * is carried by its `lock_handle` alone. Checked twice: in every shipped
 * tool's input schema, and in the sources of every package (no schema, field,
 * answer or check names them).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { BackgroundRunHandlersGroup } from '../../../lib/handlers/groups/BackgroundRunHandlersGroup';
import { HighLevelHandlersGroup } from '../../../lib/handlers/groups/HighLevelHandlersGroup';
import { LeftoverSessionHandlersGroup } from '../../../lib/handlers/groups/LeftoverSessionHandlersGroup';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../../lib/handlers/interfaces';

const REPO = path.resolve(__dirname, '../../../..');
const NAMES = ['session_id', 'session_state'];
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
  'core-ro/src',
  'http-ro/src',
  'sse-ro/src',
  'compact-ro/src',
  'compact-http-ro/src',
  'compact-sse-ro/src',
];

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

/** The property names a JSON schema declares, at any depth. */
function declared(schema: unknown, into: string[] = []): string[] {
  if (schema === null || typeof schema !== 'object') return into;
  const properties = (schema as { properties?: Record<string, unknown> })
    .properties;
  if (properties) {
    for (const [name, inner] of Object.entries(properties)) {
      into.push(name);
      declared(inner, into);
    }
  }
  for (const key of ['items', 'anyOf', 'oneOf', 'allOf']) {
    const value = (schema as Record<string, unknown>)[key];
    if (Array.isArray(value)) for (const v of value) declared(v, into);
    else declared(value, into);
  }
  return into;
}

describe('no tool takes session_id or session_state', () => {
  const placeholder = {
    connection: null,
    logger: undefined,
  } as unknown as HandlerContext;
  const groups = [
    new ReadOnlyHandlersGroup(placeholder),
    new HighLevelHandlersGroup(placeholder),
    new SystemHandlersGroup(placeholder),
    new SearchHandlersGroup(placeholder),
    new BackgroundRunHandlersGroup(placeholder),
    new LeftoverSessionHandlersGroup(placeholder),
    new CompactReadOnlyHandlersGroup(placeholder),
    new CompactModifyHandlersGroup(placeholder),
  ] as unknown as Array<{ getHandlers(): HandlerEntry[] }>;
  const tools = groups.flatMap((g) => g.getHandlers());

  it('the shipped tools are seen, so the check is not vacuous', () => {
    expect(tools.length).toBeGreaterThan(200);
    expect(tools.map((t) => t.toolDefinition.name)).toContain('HandlerUnlock');
  });

  it('no shipped tool declares either in its input schema, nor GetSession exists', () => {
    const offending = tools.flatMap((t) =>
      declared(t.toolDefinition.inputSchema)
        .filter((name) => NAMES.includes(name))
        .map((name) => `${t.toolDefinition.name}.${name}`),
    );
    expect(offending).toEqual([]);
    expect(tools.map((t) => t.toolDefinition.name)).not.toContain('GetSession');
  });

  it('no source of any package names either', () => {
    const offending: string[] = [];
    for (const pkg of PACKAGES) {
      for (const file of tsFiles(path.join(REPO, pkg))) {
        const text = fs.readFileSync(file, 'utf8');
        for (const name of NAMES) {
          if (text.includes(name)) {
            offending.push(`${path.relative(REPO, file)}: ${name}`);
          }
        }
      }
    }
    expect(offending).toEqual([]);
  });
});
