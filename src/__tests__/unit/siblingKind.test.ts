/**
 * A sibling of a connection the factory built (`openFreshConnection` over
 * `siblingRecordOf`) is built for the kind recorded for that connection —
 * never for what `SAP_SYSTEM_TYPE` says when the sibling is opened. Nothing
 * is sent: the connect is a stand-in.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import {
  AdtCloudConnector,
  AdtOnPremConnector,
  type SapConfig,
} from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { resetProcessLatchForTests } from '../../lib/activeTools';
import {
  createAbapConnection,
  systemKindOf,
} from '../../lib/connectionFactory';
import { openFreshConnection } from '../../lib/packageSessions';

const previous = process.env.SAP_SYSTEM_TYPE;
beforeEach(() => resetProcessLatchForTests());
afterEach(() => {
  jest.restoreAllMocks();
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

const settings: SapConfig = {
  url: 'https://sap.example.invalid',
  client: '000',
  authType: 'basic',
};

/** Stands in for `connect` and `disconnect` on the class that owns them. */
function sendNothing(connection: object): void {
  for (const method of ['connect', 'disconnect'] as const) {
    let proto: object | null = Object.getPrototypeOf(connection);
    while (proto && !Object.hasOwn(proto, method)) {
      proto = Object.getPrototypeOf(proto);
    }
    if (!proto) throw new Error(`no ${method}`);
    jest
      .spyOn(proto as Record<string, () => Promise<void>>, method)
      .mockResolvedValue(undefined);
  }
}

/** Ends a sibling on the stand-in `disconnect`: nothing is sent. */
async function endStandIn(connection: object): Promise<void> {
  await (connection as { disconnect: () => Promise<void> }).disconnect();
}

it.each([
  ['cloud', 'onprem', AdtCloudConnector],
  ['onprem', 'cloud', AdtOnPremConnector],
] as const)(
  'built for %s, opened while SAP_SYSTEM_TYPE says %s: the sibling is %s',
  async (built, now, connector) => {
    process.env.SAP_SYSTEM_TYPE = built;
    const credential = new BasicAuthProvider('user', 'secret') as IAuthProvider;
    const main = createAbapConnection(settings, credential);
    sendNothing(main);
    process.env.SAP_SYSTEM_TYPE = now;
    const sibling = await openFreshConnection(main, undefined as never);
    expect(sibling).toBeInstanceOf(connector);
    expect(systemKindOf(sibling)).toBe(built);
    await endStandIn(sibling);
  },
);

it('opened with SAP_SYSTEM_TYPE gone: still the recorded kind, not refused', async () => {
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  const main = createAbapConnection(
    settings,
    new BasicAuthProvider('user', 'secret') as IAuthProvider,
  );
  sendNothing(main);
  delete process.env.SAP_SYSTEM_TYPE;
  const sibling = await openFreshConnection(main, undefined as never);
  expect(sibling).toBeInstanceOf(AdtCloudConnector);
  await endStandIn(sibling);
});
