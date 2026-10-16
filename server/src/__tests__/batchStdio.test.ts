/**
 * Batch mode on stdio is the one instance's (spec §2, §8): the owner the
 * launcher gives the process's one instance is the batch every call of the
 * session reaches, and the client's close — the instance close — drops it
 * with nothing sent.
 */

import { InstanceBatch } from '@mcp-abap-adt/lib/embeddable';
import {
  BatchHandlersGroup,
  type HandlerContext,
  HighLevelHandlersGroup,
} from '@mcp-abap-adt/lib/handlers';
import { isLogoff } from '../../../src/__tests__/helpers/adtStandIn';
import { stand, turns, until } from './helpers/loginStand';

jest.setTimeout(30_000);

const placeholder = { connection: undefined } as unknown as HandlerContext;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it("stdio: the batch is the one instance's; the client's close drops it with nothing sent", async () => {
  const owner = new InstanceBatch({ keepRawParts: false });
  const s = await stand({
    batch: owner,
    groups: [
      new HighLevelHandlersGroup(placeholder),
      new BatchHandlersGroup(placeholder),
    ],
  });
  try {
    expect(await s.callTool('BatchBegin', {})).toMatchObject({
      isError: false,
    });
    expect(owner.mode()).toBe('communication');
    expect(await s.callTool('GetProgram', { program_name: 'PROG_A' })).toEqual({
      text: '',
      isError: false,
    });
    expect(
      await s.callTool('GetInterface', { interface_name: 'IF_A' }),
    ).toEqual({
      text: '',
      isError: false,
    });
    // Both calls of the session recorded into the one instance's batch.
    expect(owner.opened()?.recorded.map((call) => call.number)).toEqual([1, 2]);
    const signal = owner.signal();

    await s.client.close();
    await until(() => owner.mode() === 'off');
    expect(signal.aborted).toBe(true);
    expect(owner.holdsState()).toBe(false);
    await until(() => s.adt.logoffs() === 1);
    await turns(20);
    expect(
      s.adt.requests.filter((r) => r.url.includes('/communication/batch')),
    ).toEqual([]);
    expect(s.adt.requests.filter((r) => isLogoff(r.url))).toHaveLength(1);
  } finally {
    await s.close();
  }
});
