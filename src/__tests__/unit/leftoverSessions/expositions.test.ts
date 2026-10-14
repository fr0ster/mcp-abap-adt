/**
 * Which leftover-session tools a tool set serves: the list and the logoff in
 * every set — a logoff is a system action, not a data change — and no resume
 * in any: a stdio process is born on the one leftover session of its
 * destination at its start, before any tool call, so a resume tool could
 * only refuse. The leftover-session tools are stdio's only: an http or sse
 * binary lists none (`toolSet.test.ts`).
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

const FULL = ['ListLeftoverSessions', 'LogoffLeftoverSession'];
const COMPACT = ['HandlerLeftoverSessionList', 'HandlerLeftoverSessionLogoff'];

/** The leftover-session tools among `tools`, a resume of any name included. */
const leftoverOf = (tools: string[]) =>
  tools.filter((t) => t.includes('Leftover'));

const namesOf = (
  groups: { getHandlers(): { toolDefinition: { name: string } }[] }[],
) => groups.flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));

describe('the object-oriented handler sets an embedder combines', () => {
  it.each<[HandlerSet[]]>([
    [['readonly']],
    [['readonly', 'debug']],
    [['debug']],
    [['readonly', 'high']],
    [['high']],
  ])('%j serves the list and the logoff, no resume', (exposition) => {
    const tools = namesOf(registryForExposition(exposition).getHandlerGroups());
    expect(leftoverOf(tools)).toEqual(FULL);
  });
});

describe('the stdio binaries', () => {
  it.each<[string, ToolSet, string[]]>([
    ['core', fullToolSet, FULL],
    ['core-ro', fullReadOnlyToolSet, FULL],
    ['compact-ro', compactReadOnlyToolSetOf(compactReadOnlyEntries), COMPACT],
    [
      'compact',
      compactToolSetOf({
        readOnly: compactReadOnlyEntries,
        modify: compactModifyEntries,
      }),
      COMPACT,
    ],
  ])('%s serves %j and no resume', (_kind, set, expected) => {
    const tools = namesOf(registryOf(set, 'stdio').getHandlerGroups());
    expect(leftoverOf(tools)).toEqual(expected);
    expect(tools.some((t) => t.includes('Resume'))).toBe(false);
  });
});
