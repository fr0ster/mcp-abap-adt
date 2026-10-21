/**
 * lib's entry points as a host applying these rules uses them: the shipped
 * resolver (`defaultSystemContextResolver`) unless the case states another
 * (`null` included), and `responsibleRules` — so the suites moved here from
 * lib run their cases unchanged against the rules, now that lib applies
 * none by default.
 */
import { StandServer as LibStandServer } from '../../../../src/__tests__/unit/backgroundRuns/harness';
import { EmbeddableMcpServer as LibEmbeddableMcpServer } from '../../../../src/embeddable/EmbeddableMcpServer';
import type { HandlerContext } from '../../../../src/handlers/interfaces';
import { BaseHandlerGroup } from '../../../../src/lib/handlers/base/BaseHandlerGroup';
import { HandlerExporter as LibHandlerExporter } from '../../../../src/lib/handlers/HandlerExporter';
import {
  defaultSystemContextResolver,
  withResolvedSystemContext as libWithResolvedSystemContext,
  type SystemContextResolver,
} from '../../../../src/lib/requestSystemResolution';
import { responsibleRules } from '../../index';

type EmbeddableOptions = ConstructorParameters<
  typeof LibEmbeddableMcpServer
>[0];
type ExporterOptions = ConstructorParameters<typeof LibHandlerExporter>[0];

/** lib's `withResolvedSystemContext` with the shipped resolver and the rules. */
export function withResolvedSystemContext<T>(
  connection: Parameters<typeof libWithResolvedSystemContext>[0],
  fn: () => Promise<T> | T,
  resolver: SystemContextResolver | null = defaultSystemContextResolver,
  systemType?: string,
): Promise<T> {
  return libWithResolvedSystemContext(
    connection,
    fn,
    resolver,
    systemType,
    responsibleRules,
  );
}

/** An embedder's server with the shipped resolver and the rules. */
export class EmbeddableMcpServer extends LibEmbeddableMcpServer {
  constructor(options: EmbeddableOptions) {
    super({
      systemContextResolver: defaultSystemContextResolver,
      systemContextRules: responsibleRules,
      ...options,
    });
  }
}

/** An embedder's exporter with the shipped resolver and the rules. */
export class HandlerExporter extends LibHandlerExporter {
  constructor(options?: ExporterOptions) {
    super({
      systemContextResolver: defaultSystemContextResolver,
      systemContextRules: responsibleRules,
      ...options,
    });
  }
}

/** The background stand's instance (a host's) with the rules. */
export class StandServer extends LibStandServer {
  constructor(options: ConstructorParameters<typeof LibStandServer>[0]) {
    super({ systemContextRules: responsibleRules, ...options });
  }
}

/** A handler group's context carrying the shipped resolver and the rules. */
export function withRules(context: HandlerContext): HandlerContext {
  return {
    systemContextResolver: defaultSystemContextResolver,
    systemContextRules: responsibleRules,
    ...context,
  };
}

export { BaseHandlerGroup, defaultSystemContextResolver, responsibleRules };
