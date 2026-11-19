/**
 * Options that did nothing are removed (D26 E1, E4, E5, E6): each line marked
 * `@ts-expect-error` fails `npm run test:check` the moment it compiles again.
 *
 * Nothing runs here: it is not a test file, and the runner never loads it.
 */

import type { ConnectionContext } from '../../embeddable/ConnectionContext';
import type { EmbeddableMcpServerOptions } from '../../embeddable/EmbeddableMcpServer';
import type { RouteRegistrationOptions } from '../../embeddable/IHttpApplication';
import type { IAdtSystemContext } from '../../lib/systemContext';

type Exposition = NonNullable<EmbeddableMcpServerOptions['exposition']>;

/** E1: `compact` built nothing. */
// @ts-expect-error `compact` is no exposition: the compact binaries or the exporter serve it.
export const compactExposition: Exposition = ['compact'];
export const highExposition: Exposition = ['readonly', 'high'];

/** E4: `client` was read by nothing. */
// @ts-expect-error the connection's client is the connection's setting.
export const contextClient: IAdtSystemContext = { client: '100' };
export const contextResponsible: IAdtSystemContext = { responsible: 'USER' };

declare const connection: Extract<
  ConnectionContext,
  { kind: 'injected' }
>['connection'];

/** E5: `sessionId` and `metadata` were read by nothing. */
export const context: ConnectionContext = { kind: 'injected', connection };
export const withSessionId: ConnectionContext = {
  kind: 'injected',
  connection,
  // @ts-expect-error a connection context carries no session id.
  sessionId: 's',
};
export const withMetadata: ConnectionContext = {
  kind: 'injected',
  connection,
  // @ts-expect-error a connection context carries no metadata.
  metadata: {},
};

/** E6: `addJsonMiddleware` was ignored by both servers. */
export const middleware: RouteRegistrationOptions = {
  // @ts-expect-error the servers never read it.
  addJsonMiddleware: false,
};
