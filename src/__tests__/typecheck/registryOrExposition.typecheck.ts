/**
 * `exposition` and `readOnlyDedupStrategy` beside `handlersRegistry` are a
 * type error (D26 E2): they build the default registry, which a given
 * registry replaces, so beside one they did nothing. Each line marked
 * `@ts-expect-error` fails `npm run test:check` the moment it compiles.
 *
 * Nothing runs here: it is not a test file, and the runner never loads it.
 */

import type { EmbeddableMcpServerOptions } from '../../embeddable/EmbeddableMcpServer';
import type { IReadOnlyDedupStrategy } from '../../lib/handlers/groups/strategies/index.js';
import type { IHandlersRegistry } from '../../lib/handlers/interfaces.js';

declare const connection: EmbeddableMcpServerOptions['connection'];
declare const registry: IHandlersRegistry;
declare const dedup: IReadOnlyDedupStrategy;

export const withRegistry: EmbeddableMcpServerOptions = {
  connection,
  handlersRegistry: registry,
};
export const withExposition: EmbeddableMcpServerOptions = {
  connection,
  exposition: ['readonly', 'high'],
  readOnlyDedupStrategy: dedup,
};
export const registryAndExposition: EmbeddableMcpServerOptions = {
  connection,
  handlersRegistry: registry,
  // @ts-expect-error a given registry replaces the default one `exposition` builds.
  exposition: ['high'],
};
// @ts-expect-error the dedup strategy shapes only the default registry.
export const registryAndDedup: EmbeddableMcpServerOptions = {
  connection,
  handlersRegistry: registry,
  readOnlyDedupStrategy: dedup,
};
