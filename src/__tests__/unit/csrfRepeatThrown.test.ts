/**
 * The one repeat when the handler's first request REJECTS with the
 * connection's `ADT_SESSION_REPLACED` (fr0ster/mcp-abap-adt#364 review): a
 * handler that sends its own stateful request and does not catch, on
 * stdio's server, which builds and holds its connection. The stand-in ends
 * the session; the stateful request with its cookie is answered in a new
 * one, which the connection throws for.
 */
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';
import { StdioServer } from '../../../server-runtime/src/stdio/StdioServer';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { SESSION_RENEWED_WORDS } from '../../lib/sessionRenewed';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  PROBE_PATH,
  probeGroup,
} from '../helpers/adtStandIn';

/** `ProbeStateful { id }`: one stateful POST on its connection, not caught. */
const stateful: HandlerEntry = {
  toolDefinition: {
    name: 'ProbeStateful',
    description: 'sends one stateful request on its connection',
    inputSchema: z.object({ id: z.string() }),
  },
  call: async (context, args) => {
    const connection: IAbapConnection = context.connection;
    const id = typeof args.id === 'string' ? args.id : '';
    connection.setSessionType('stateful');
    try {
      await connection.makeAdtRequest({
        url: `${PROBE_PATH}${id}`,
        method: 'POST',
        timeout: 0,
      });
    } finally {
      connection.setSessionType('stateless');
    }
    return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
  },
};

let stand: AdtStandIn;
let previous: string | undefined;

beforeEach(async () => {
  previous = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  stand = await adtStandIn();
});

afterEach(async () => {
  await stand.close();
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

it("a handler's first request rejecting ADT_SESSION_REPLACED runs once more, and says so", async () => {
  const provider = new BasicAuthProvider('PROBE_USER', 'probe-password');
  const server = new StdioServer(
    new CompositeHandlersRegistry([probeGroup([stateful])]),
    {
      settingsFor: async () => ({
        url: stand.url,
        client: '100',
        authType: 'basic' as const,
      }),
      getProvider: async () => provider,
    },
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'repeat-thrown', version: '1.0.0' });
  await Promise.all([
    server.start('dest', serverSide),
    client.connect(clientSide),
  ]);
  try {
    await client.callTool({ name: 'ProbeStateful', arguments: { id: 'one' } });
    const last = [...stand.requests]
      .reverse()
      .find((request) => !isLogoff(request.url));
    if (last === undefined) throw new Error('no request yet');
    stand.endSession(last.session);
    const before = stand.requests.filter((r) =>
      r.url.startsWith(`${PROBE_PATH}two`),
    ).length;

    const answered = await client.callTool({
      name: 'ProbeStateful',
      arguments: { id: 'two' },
    });

    expect(answered.isError).not.toBe(true);
    const sent = stand.requests.filter((r) =>
      r.url.startsWith(`${PROBE_PATH}two`),
    ).length;
    expect(sent - before).toBe(2);
    const content = answered.content;
    const first = Array.isArray(content) ? content[0] : undefined;
    const text =
      typeof first === 'object' && first !== null && 'text' in first
        ? String(first.text)
        : '';
    expect(JSON.parse(text)).toEqual({
      id: 'two',
      session_renewed: SESSION_RENEWED_WORDS,
    });
  } finally {
    await client.close();
    await server.close();
  }
});
