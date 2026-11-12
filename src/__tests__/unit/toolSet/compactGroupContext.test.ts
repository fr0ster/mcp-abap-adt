/**
 * A compact handler runs against the connection of THIS request.
 *
 * `BaseMcpServer` builds a fresh context per call —
 * `{ connection: await this.getConnection(), logger }` — and passes it to the
 * entry's call. When `CompactHandlersGroup` was first composed out of the two
 * halves, their handlers closed over a context of their own and a call ran
 * against a stale connection (found in review on PR #240). An entry now holds
 * no context: it runs on the one its call is given.
 *
 * The three groups are checked the same way, because the composition is what broke
 * and the halves are what a consumer imports directly.
 */

import {
  CompactModifyHandlersGroup,
  compactModifyEntries,
} from '@mcp-abap-adt/compact-modify';
import {
  CompactReadOnlyHandlersGroup,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { CompactHandlersGroup } from '../../../lib/compact/group';
import { declareSystemKind } from '../../../lib/systemKind';

/** lib's composition of the two halves, as `compactToolSetOf` builds it for the compact write binaries. */
class BothHalvesGroup extends CompactHandlersGroup {
  constructor(context: HandlerContext) {
    super(context, [compactReadOnlyEntries, compactModifyEntries]);
  }
}

/** A context that is recognisable when a handler reports what it received. */
const contextNamed = (name: string): HandlerContext =>
  ({
    connection: { marker: name } as never,
    logger: undefined,
  }) as unknown as HandlerContext;

describe('compact groups read the context of the current request', () => {
  const groups = [
    ['CompactHandlersGroup', BothHalvesGroup],
    ['CompactReadOnlyHandlersGroup', CompactReadOnlyHandlersGroup],
    ['CompactModifyHandlersGroup', CompactModifyHandlersGroup],
  ] as const;

  for (const [name, Group] of groups) {
    it(`${name} passes the context set after the handlers were built`, async () => {
      // Built with the context a server has at startup — possibly no connection
      // at all, which is the worse half of the original defect.
      const group = new Group(contextNamed('at-build-time'));
      const entries = group.getHandlers();
      expect(entries.length).toBeGreaterThan(0);

      // What BaseMcpServer does before each call.
      (group as unknown as { context: HandlerContext }).context =
        contextNamed('this-request');

      // A create whose type the declared variant serves: the router logs
      // the route through the context the call was given, before SAP.
      const seen: string[] = [];
      const probe = contextNamed('this-request');
      (probe as unknown as { logger: unknown }).logger = {
        info: (line: string) => seen.push(line),
        warn: (line: string) => seen.push(line),
      };
      declareSystemKind(probe.connection, 'onprem');
      (group as unknown as { context: HandlerContext }).context = probe;

      const create = entries.find(
        (entry) => entry.toolDefinition.name === 'HandlerCreate',
      );
      const read = entries.find(
        (entry) => entry.toolDefinition.name === 'HandlerGet',
      );
      if (create !== undefined) {
        await create
          .call(probe, { object_type: 'CLASS' })
          .catch(() => undefined);
      } else if (read !== undefined) {
        // `object_type` left out: the router refuses before SAP, through its log.
        await read.call(probe, {});
      } else {
        throw new Error(`${name} serves neither HandlerCreate nor HandlerGet`);
      }

      // The handler logged through the context it was given, so it read the
      // current one rather than the one captured at build time.
      expect(seen.length).toBeGreaterThan(0);
    });

    it(`${name} answers the connection of the current context`, () => {
      const group = new Group(contextNamed('at-build-time'));
      group.getHandlers();
      (group as unknown as { context: HandlerContext }).context =
        contextNamed('this-request');
      const current = (group as unknown as { context: HandlerContext }).context;
      expect((current.connection as unknown as { marker: string }).marker).toBe(
        'this-request',
      );
    });
  }
});
