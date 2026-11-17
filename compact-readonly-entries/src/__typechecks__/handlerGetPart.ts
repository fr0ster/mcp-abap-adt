/**
 * HandlerGet's `part`, as its schema parses it, is the read-part union on
 * every variant (no-assertions plan, S3b): the handler dispatches it with a
 * `switch`, so no runtime check of a part stands where the type proves it.
 * Checked by `test:check`; never emitted (excluded from the package build).
 */
import type * as z from 'zod';
import type { TOOL_DEFINITION } from '../handlers/handleHandlerGet';

type ReadPart =
  | 'source'
  | 'metadata'
  | 'urls'
  | 'contents'
  | 'main_programs'
  | 'draft'
  | 'object_structure'
  | 'node_structure'
  | 'virtual_folders'
  | 'activation_status'
  | 'activation_results';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
/** Compiles only for `true`. */
type Holds<T extends true> = T;

type PartOn<S extends z.ZodType> =
  z.output<S> extends { part?: infer P } ? NonNullable<P> : never;

export type OnPremise = Holds<
  Equal<PartOn<typeof TOOL_DEFINITION.variants.onprem.inputSchema>, ReadPart>
>;
export type Cloud = Holds<
  Equal<PartOn<typeof TOOL_DEFINITION.variants.cloud.inputSchema>, ReadPart>
>;
