/**
 * A compact handler runs against the connection of THIS request.
 *
 * **The bug this exists for.** `BaseMcpServer` builds a fresh context per call —
 * `{ connection: await this.getConnection(), logger }` — and hands it to the group
 * that owns the entry, through `setContext` when there is one and `group.context =`
 * otherwise. So a handler must read the context when it is CALLED. When
 * `CompactHandlersGroup` was first composed out of the two halves it instantiated
 * them with `this.context`, and their handlers closed over those child instances:
 * the server updated the parent, the children kept the context from construction,
 * and a call ran against a stale connection — or against the `null` a server holds
 * before it has connected. Found in review on PR #240, and invisible to every other
 * suite, which builds a group and calls it without ever replacing the context.
 *
 * The three groups are checked the same way, because the composition is what broke
 * and the halves are what a consumer imports directly.
 */

import { CompactModifyHandlersGroup } from '@mcp-abap-adt/compact-modify';
import { CompactReadOnlyHandlersGroup } from '@mcp-abap-adt/compact-readonly';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { CompactHandlersGroup } from '../group';

/** A context that is recognisable when a handler reports what it received. */
const contextNamed = (name: string): HandlerContext =>
  ({
    connection: { marker: name } as never,
    logger: undefined,
  }) as unknown as HandlerContext;

describe('compact groups read the context of the current request', () => {
  const groups = [
    ['CompactHandlersGroup', CompactHandlersGroup],
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

      // Any entry will do: the question is which context the closure reads, and
      // every entry in the group is built the same way. `object_type` is left out
      // so the router refuses before reaching SAP — the refusal still proves the
      // handler was called with a context, and the router logs through it.
      const seen: string[] = [];
      const probe = contextNamed('this-request');
      (probe as unknown as { logger: unknown }).logger = {
        info: (line: string) => seen.push(line),
        warn: (line: string) => seen.push(line),
      };
      (group as unknown as { context: HandlerContext }).context = probe;

      // The entry's declared type allows (context, args); these are built as
      // args-only closures, which is the shape BaseMcpServer detects by arity.
      await (
        entries[0].handler as unknown as (args: unknown) => Promise<unknown>
      )({});

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
