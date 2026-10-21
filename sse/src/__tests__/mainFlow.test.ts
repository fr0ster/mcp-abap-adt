/**
 * One SSE connection, one instance, one connection, ONE main flow: two
 * `UpdateClass` sent at once on one SSE connection run one after another —
 * the second's first request reaches SAP only after the first's `UNLOCK`.
 * The server enforces it; the client sent both at once.
 */

import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '@mcp-abap-adt/lib/handlers';
import { HighLevelHandlersGroup } from '../../../src/lib/handlers/groups/HighLevelHandlersGroup';
import { sseStand, until } from './shutdown/harness';

jest.setTimeout(30_000);

const SOURCE = 'CLASS zcl_placeholder DEFINITION. ENDCLASS.';

/** The shipped `UpdateClass` alone, its handler reading its group's context. */
function updateClassGroup(): IHandlerGroup {
  const group = new HighLevelHandlersGroup({
    connection: null,
    logger: undefined,
  } as unknown as HandlerContext) as unknown as {
    getHandlers(): HandlerEntry[];
    context: HandlerContext;
  };
  const entry = group
    .getHandlers()
    .find((e) => e.toolDefinition.name === 'UpdateClass');
  if (!entry) throw new Error('no UpdateClass');
  return {
    getName: () => 'flow-UpdateClass',
    getHandlers: () => [entry],
    registerHandlers: () => {},
    setContext: (context: HandlerContext) => {
      group.context = context;
    },
  } as unknown as IHandlerGroup;
}

const of = (name: string) => (url: string) =>
  url.toLowerCase().includes(name.toLowerCase());

it('two UpdateClass sent at once on one SSE connection: the second starts only after the first’s UNLOCK', async () => {
  const s = await sseStand({ groups: [updateClassGroup()] });
  try {
    const connection = await s.open();
    const held = s.standIn.hold(
      (r) => r.url.includes('_action=LOCK') && of('ZCL_FIRST')(r.url),
    );
    await connection.call(
      'UpdateClass',
      { class_name: 'ZCL_FIRST', source_code: SOURCE },
      1,
    );
    await held.arrived;
    await connection.call(
      'UpdateClass',
      { class_name: 'ZCL_SECOND', source_code: SOURCE },
      2,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The first holds the flow: nothing of the second has reached SAP.
    expect(s.indexOf(of('ZCL_SECOND'))).toBe(-1);
    held.release();
    await connection.answer(1);
    await connection.answer(2);
    await until(() => s.indexOf(of('ZCL_SECOND')) >= 0);

    let firstUnlock = -1;
    s.standIn.requests.forEach((r, i) => {
      if (r.url.includes('_action=UNLOCK') && of('ZCL_FIRST')(r.url))
        firstUnlock = i;
    });
    expect(firstUnlock).toBeGreaterThanOrEqual(0);
    expect(s.indexOf(of('ZCL_SECOND'))).toBeGreaterThan(firstUnlock);
  } finally {
    await s.close();
  }
});
