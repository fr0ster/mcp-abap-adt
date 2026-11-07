/**
 * A batch view keeps the system kind of the connection it is built over
 * (plan C2a, measured on premise: `ListTransports` on a connection whose
 * kind was only declared was refused `system_type_required` — its reads go
 * on a phase's item view, which carried no kind and fell back to
 * `SAP_SYSTEM_TYPE`). `SAP_SYSTEM_TYPE` is unset in every case here: the
 * kind comes from the declaration alone, as on an HTTP/SSE server or in an
 * embedder.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { roundConnection } from '../../../handlers/system/readonly/handleRuntimeListFeeds';
import { handleListTransports } from '../../../handlers/transport/readonly/handleListTransports';
import { runPhase } from '../../../lib/batch/phases';
import {
  createAbapConnection,
  systemKindOf,
} from '../../../lib/connectionFactory';
import { declareSystemKind, stateSystemKind } from '../../../lib/systemKind';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import {
  envelopeResponse,
  type InnerRequest,
  innerRequests,
  type PartAnswer,
} from '../../helpers/batchEnvelope';
import { endTestConnection } from '../../integration/helpers/openConnections';

const CONFIGURATIONS =
  '/sap/bc/adt/cts/transportrequests/searchconfiguration/configurations';
const BATCH_URL = '/sap/bc/adt/communication/batch';

const xml = { 'content-type': 'application/xml' };

/** The system: one search configuration, one modifiable request of OWNER_A. */
function transportPart(inner: InnerRequest): PartAnswer {
  const path = new URL(inner.url, 'https://system.invalid').pathname;
  if (path === CONFIGURATIONS) {
    return {
      status: 200,
      statusText: 'OK',
      headers: xml,
      body: `<?xml version="1.0" encoding="utf-8"?><configurations:configurations xmlns:configurations="http://www.sap.com/adt/configurations"><configuration:configuration client="000" xmlns:configuration="http://www.sap.com/adt/configuration"><atom:link href="${CONFIGURATIONS}/CFG1" rel="http://www.sap.com/adt/categories/configurations" type="application/vnd.sap.adt.configuration.v1+xml" etag="1" xmlns:atom="http://www.w3.org/2005/Atom"/></configuration:configuration></configurations:configurations>`,
    };
  }
  if (path === '/sap/bc/adt/cts/transportrequests') {
    return {
      status: 200,
      statusText: 'OK',
      headers: xml,
      body: '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:workbench tm:category="Workbench"><tm:modifiable><tm:request tm:number="K900001" tm:owner="OWNER_A" tm:desc="one" tm:type="K" tm:status="D"/></tm:modifiable></tm:workbench></tm:root>',
    };
  }
  return { status: 404, statusText: 'Not Found', body: '' };
}

/** The envelope, answered part by part from the model. */
function envelopeAnswer(request: StandInRequest) {
  const parts = innerRequests({
    url: request.url,
    method: 'POST',
    timeout: 0,
    headers: { 'Content-Type': request.contentType ?? '' },
    data: request.body,
  });
  const answer = envelopeResponse(parts.map(transportPart));
  const type = answer.headers['content-type'];
  const headers: Record<string, string> = {};
  if (typeof type === 'string') headers['content-type'] = type;
  return { status: 200, headers, text: String(answer.data) };
}

/**
 * A connection the factory did not build — a plain delegating one, as a
 * host or a guard wraps the built one — whose kind is only what
 * `declareSystemKind` states for it.
 */
function plainOver(inner: IAbapConnection): IAbapConnection {
  return {
    connect: () => inner.connect(),
    getBaseUrl: () => inner.getBaseUrl(),
    getSessionId: () => inner.getSessionId(),
    setSessionType: (type) => inner.setSessionType(type),
    makeAdtRequest: <T = unknown, D = unknown>(
      options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> => inner.makeAdtRequest<T, D>(options),
  };
}

let stand: AdtStandIn;
let inner: IAbapConnection & { disconnect(): Promise<void> };
let envelopes: number;

let saved: string | undefined;

beforeEach(async () => {
  saved = process.env.SAP_SYSTEM_TYPE;
  delete process.env.SAP_SYSTEM_TYPE;
  stand = await adtStandIn();
  envelopes = 0;
  stand.respond(
    (request) => request.url.startsWith(BATCH_URL),
    (request) => {
      envelopes += 1;
      return envelopeAnswer(request);
    },
  );
  // The factory builds only for a stated kind; the cases go through a
  // plain connection over it, whose kind is the declaration's alone.
  inner = createAbapConnection(
    { url: stand.url, client: '100', authType: 'basic', username: 'KIND_USER' },
    new BasicAuthProvider('KIND_USER', 'kind-password'),
    undefined,
    undefined,
    undefined,
    'onprem',
  );
  await inner.connect();
});

afterEach(async () => {
  await endTestConnection(inner);
  await stand.close();
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
});

/** The requests the system got outside an envelope, after the logon. */
const directs = (from: number): StandInRequest[] =>
  stand.requests
    .slice(from)
    .filter((request) => !request.url.startsWith(BATCH_URL));

describe('a batch view keeps the connection’s system kind', () => {
  it('a read through a phase’s item view of an onprem-declared connection gets onprem', async () => {
    const connection = plainOver(inner);
    declareSystemKind(connection, 'onprem');
    const context: HandlerContext = { connection };
    const results = await runPhase(context, ['one'], async (_item, view) =>
      systemKindOf(view),
    );
    expect(results).toEqual([{ ok: true, value: 'onprem' }]);
  });

  it('ListTransports in envelopes answers on a connection whose kind is only declared', async () => {
    const connection = plainOver(inner);
    declareSystemKind(connection, 'onprem');
    const context: HandlerContext = { connection };
    const from = stand.requests.length;
    const answer = await handleListTransports(context, { user: 'owner_a' });
    const text = answer.content.map((part) => part.text).join('\n');
    expect({ isError: answer.isError, text }).toEqual({
      isError: false,
      text: expect.stringContaining('K900001'),
    });
    expect(envelopes).toBeGreaterThan(0);
    expect(directs(from)).toEqual([]);
  });

  it('a feed’s round connection has the kind of the connection it is over', () => {
    const connection = plainOver(inner);
    declareSystemKind(connection, 'onprem');
    const view = roundConnection(connection, (request) =>
      inner.makeAdtRequest(request),
    );
    expect(systemKindOf(view)).toBe('onprem');
  });

  it('a connection stated with no kind gives its views none: SAP_SYSTEM_TYPE is not read for them', async () => {
    // A group registered on a plain McpServer with no systemType states
    // none; the environment names a kind all the same.
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = plainOver(inner);
    stateSystemKind(connection, undefined);
    const context: HandlerContext = { connection };
    const results = await runPhase(context, ['one'], async (_item, view) =>
      systemKindOf(view),
    );
    expect(results).toEqual([{ ok: true, value: undefined }]);
    const from = stand.requests.length;
    const answer = await handleListTransports(context, { user: 'owner_a' });
    const text = answer.content.map((part) => part.text).join('\n');
    expect(answer.isError).toBe(true);
    expect(text).toContain('system_type_required');
    expect(stand.requests.slice(from)).toEqual([]);
  });

  it('a connection with no kind is still refused system_type_required, nothing sent', async () => {
    const connection = plainOver(inner);
    const context: HandlerContext = { connection };
    const from = stand.requests.length;
    const answer = await handleListTransports(context, { user: 'owner_a' });
    const text = answer.content.map((part) => part.text).join('\n');
    expect(answer.isError).toBe(true);
    expect(text).toContain('system_type_required');
    expect(stand.requests.slice(from)).toEqual([]);
  });
});
