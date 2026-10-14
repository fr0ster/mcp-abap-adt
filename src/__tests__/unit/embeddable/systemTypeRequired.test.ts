/**
 * The system kind is required, never guessed: an `EmbeddableMcpServer`
 * whose `systemType` option and `SAP_SYSTEM_TYPE` state none — or a value
 * other than `onprem`, `cloud` or `legacy` — is refused at construction, so
 * the host learns it before any client sees a tool, and nothing is sent.
 */

import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import {
  ServerRefusal,
  SYSTEM_TYPE_REQUIRED_WORDS,
} from '../../../lib/auth/serverRefusal';

const previous = process.env.SAP_SYSTEM_TYPE;
afterEach(() => {
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

/** A connection that records every request: none may be sent. */
function recorded() {
  const requests: unknown[] = [];
  const connection = {
    makeAdtRequest: async (options: unknown) => {
      requests.push(options);
      return { status: 200, data: '' };
    },
  };
  return { connection, requests };
}

function construct(
  connection: object,
  systemType?: 'onprem' | 'cloud' | 'legacy',
): unknown {
  try {
    new EmbeddableMcpServer({
      connection: connection as never,
      ...(systemType !== undefined ? { systemType } : {}),
    });
  } catch (error) {
    return error;
  }
  return undefined;
}

it.each([
  ['neither the option nor SAP_SYSTEM_TYPE', undefined],
  ['a blank SAP_SYSTEM_TYPE', ' '],
  ['an SAP_SYSTEM_TYPE of no kind', 'abap-cloud'],
])('%s: refused at construction, nothing sent', (_what, env) => {
  if (env === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = env;
  const { connection, requests } = recorded();
  const thrown = construct(connection);
  expect(thrown).toBeInstanceOf(ServerRefusal);
  expect((thrown as ServerRefusal).serverRefusal).toBe('system_type_required');
  expect((thrown as Error).message).toBe(SYSTEM_TYPE_REQUIRED_WORDS);
  expect(requests).toEqual([]);
});

it.each(['onprem', 'cloud', 'legacy'] as const)(
  'the option %s states it, SAP_SYSTEM_TYPE unset',
  (systemType) => {
    delete process.env.SAP_SYSTEM_TYPE;
    expect(construct(recorded().connection, systemType)).toBeUndefined();
  },
);

it.each(['onprem', 'cloud', 'legacy'])(
  'SAP_SYSTEM_TYPE=%s states it without the option',
  (env) => {
    process.env.SAP_SYSTEM_TYPE = env;
    expect(construct(recorded().connection)).toBeUndefined();
  },
);
