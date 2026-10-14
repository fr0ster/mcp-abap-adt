/**
 * A resumed session's system context: a resume is the instance's
 * connection's birth, and the system lookup is part of the birth as it is of
 * a logon's — after the resume's own connect, in the resumed session, before
 * any tool on it proceeds. On ABAP Cloud a create then has the responsible
 * the system names.
 *
 * Against the stand-in: the resume sends one `systeminformation` in the
 * resumed session, after its connect; the first tool sends none and reads
 * the responsible it answered.
 */

import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { requireSystemContextForCreate } from '../../../lib/systemContextGuard';
import { PROBE_PATH } from '../../helpers/adtStandIn';
import { type LeftoverStand, leftoverStand } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: { url: string }) => r.url.includes('systeminformation');

/**
 * `NeedsResponsible`: as a create that writes `adtcore:responsible` — reads
 * the responsible the guard would refuse without, and sends it as a probe.
 */
const needsResponsible: HandlerEntry = {
  toolDefinition: {
    name: 'NeedsResponsible',
    description: 'NeedsResponsible',
    inputSchema: { type: 'object', properties: {} },
  },
  handler: (async (
    context: {
      connection: { makeAdtRequest(o: object): Promise<unknown> };
    },
    _args: unknown,
  ) => {
    const { responsible } = requireSystemContextForCreate();
    await context.connection.makeAdtRequest({
      url: `${PROBE_PATH}${responsible}`,
      method: 'GET',
      timeout: 10_000,
    });
    return { content: [{ type: 'text', text: responsible }] };
  }) as never,
} as unknown as HandlerEntry;

let stand: LeftoverStand;
let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
});
afterEach(async () => {
  await stand?.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

it('ABAP Cloud: a resumed session is looked up at its birth, before its first create', async () => {
  stand = await leftoverStand({ extra: [needsResponsible] });
  stand.standIn.body(
    isLookup,
    JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
  );
  const { handle, session } = await stand.leftover();
  const from = stand.standIn.requests.length;
  const resumed = await stand.call('ResumeLeftoverSession', { handle });
  expect(resumed.isError).toBe(false);
  const birth = stand.standIn.requests.slice(from);
  const lookups = birth.filter(isLookup);
  expect(lookups).toHaveLength(1);
  expect(lookups[0]?.session).toBe(session);
  // After the resume's own connect: not the first request.
  expect(birth.findIndex(isLookup)).toBeGreaterThan(0);

  const before = stand.standIn.requests.length;
  const created = await stand.call('NeedsResponsible');
  expect(created.isError).toBe(false);
  expect(created.text).toBe('CLOUD_USER');
  const after = stand.standIn.requests.slice(before);
  expect(after.filter(isLookup)).toEqual([]);
  const create = after.findIndex((r) => r.url === `${PROBE_PATH}CLOUD_USER`);
  expect(after[create]?.session).toBe(session);
});
