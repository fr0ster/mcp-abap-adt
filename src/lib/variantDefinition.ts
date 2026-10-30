/**
 * A tool definition that differs by variant (#329, spec 5): built once per
 * variant from that variant's projections (`adtProjections.ts`), so its
 * enums and the lists its descriptions name are the values the variant's
 * table serves. The server registers the declared variant's
 * (`servedDefinition`); with no variant declared, the on-premise one.
 */
import type { ProjectionVariant } from './adtProjections';

/** What a tool states on one variant. */
export interface StatedOnVariant<S> {
  readonly description: string;
  readonly inputSchema: S;
}

/**
 * The definition's `description`, `inputSchema` and `variants`, from what
 * the tool states on each variant: the on-premise statement is also the
 * definition's own.
 */
export function byVariant<S>(
  state: (variant: ProjectionVariant) => StatedOnVariant<S>,
): {
  readonly description: string;
  readonly inputSchema: S;
  readonly variants: { readonly [V in ProjectionVariant]: StatedOnVariant<S> };
} {
  const onprem = state('onprem');
  return {
    description: onprem.description,
    inputSchema: onprem.inputSchema,
    variants: { onprem, cloud: state('cloud') },
  };
}
