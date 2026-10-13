/**
 * Which leftover-session tools an exposition serves (owner's decision on
 * C21): the list and the logoff with every set — a logoff is a system
 * action, not a data change — and the resume only with a writing set (full
 * `high` / `low`, compact `rw`).
 */

import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type { HandlerSet } from '../../../lib/config/IServerConfig';
import { registryForExposition } from '../../../lib/handlers/registry/expositionRegistry';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  registryOf,
  type ToolSet,
} from '../../../lib/toolSet';

const FULL = [
  'ListLeftoverSessions',
  'ResumeLeftoverSession',
  'LogoffLeftoverSession',
];
const COMPACT = [
  'HandlerLeftoverSessionList',
  'HandlerLeftoverSessionResume',
  'HandlerLeftoverSessionLogoff',
];

const leftoverOf = (tools: string[], names: string[]) =>
  tools.filter((t) => names.includes(t));

describe('the object-oriented handler sets an embedder combines', () => {
  it.each<[HandlerSet[], string[]]>([
    [['readonly'], ['ListLeftoverSessions', 'LogoffLeftoverSession']],
    [
      ['readonly', 'debug'],
      ['ListLeftoverSessions', 'LogoffLeftoverSession'],
    ],
    [['debug'], ['ListLeftoverSessions', 'LogoffLeftoverSession']],
    [['readonly', 'high'], FULL],
    [['high'], FULL],
  ])('%j serves %j', (exposition, expected) => {
    const tools = registryForExposition(exposition)
      .getHandlerGroups()
      .flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));
    expect(leftoverOf(tools, FULL)).toEqual(expected);
  });
});

/** The binary fixes its set (C23): the resume only in a write binary. */
describe('the binaries', () => {
  it.each<[string, ToolSet, string[]]>([
    ['core', fullToolSet, FULL],
    [
      'core-ro',
      fullReadOnlyToolSet,
      ['ListLeftoverSessions', 'LogoffLeftoverSession'],
    ],
  ])('%s serves %j', (_kind, set, expected) => {
    const tools = registryOf(set)
      .getHandlerGroups()
      .flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));
    expect(leftoverOf(tools, FULL)).toEqual(expected);
  });

  it.each<[string, ToolSet, string[]]>([
    [
      'compact-ro',
      compactReadOnlyToolSetOf(compactReadOnlyEntries),
      ['HandlerLeftoverSessionList', 'HandlerLeftoverSessionLogoff'],
    ],
    [
      'compact',
      compactToolSetOf({
        readOnly: compactReadOnlyEntries,
        modify: compactModifyEntries,
      }),
      COMPACT,
    ],
  ])('%s serves %j', (_kind, set, expected) => {
    const tools = registryOf(set)
      .getHandlerGroups()
      .flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));
    expect(leftoverOf(tools, COMPACT)).toEqual(expected);
  });
});
