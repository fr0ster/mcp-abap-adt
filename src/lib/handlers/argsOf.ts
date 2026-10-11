/**
 * The arguments a tool's handler receives, derived from the tool's JSON
 * schema. Type level only: the MCP boundary validates the arguments against
 * the same schema (`jsonSchemaToZod`), so inside the handler the compiler, not
 * a runtime re-check, holds every use and every direct caller to it.
 *
 * The schema must keep its literal types (`as const`, spread constants
 * included): a widened `type: string` maps to `unknown`.
 *
 * - `properties` + `required` → required and optional keys;
 * - `string` → string, with `enum` → the union of its values;
 * - `number` | `integer` → number; `boolean` → boolean;
 * - `array` → an array of what `items` maps to;
 * - `object` with `properties` → that object, without → a record;
 * - anything else → unknown.
 *
 * A `default` does not make a key required: a direct caller may omit it, and
 * the handler applies the default where it needs the value.
 */
export type ArgsOf<S> = S extends { properties: infer P }
  ? ObjectOf<P, RequiredKeysOf<S>>
  : Record<string, unknown>;

type RequiredKeysOf<S> = S extends { required: readonly (infer K)[] }
  ? K
  : never;

type Flatten<T> = { [K in keyof T]: T[K] } & {};

type ObjectOf<P, R> = Flatten<
  { -readonly [K in keyof P as K extends R ? K : never]: ValueOf<P[K]> } & {
    -readonly [K in keyof P as K extends R ? never : K]?: ValueOf<P[K]>;
  }
>;

type ValueOf<S> = S extends { type: 'string'; enum: readonly (infer E)[] }
  ? E
  : S extends { type: 'string' }
    ? string
    : S extends { type: 'number' | 'integer' }
      ? number
      : S extends { type: 'boolean' }
        ? boolean
        : S extends { type: 'array'; items: infer I }
          ? ValueOf<I>[]
          : S extends { type: 'array' }
            ? unknown[]
            : S extends { type: 'object'; properties: infer P }
              ? ObjectOf<P, RequiredKeysOf<S>>
              : S extends { type: 'object' }
                ? Record<string, unknown>
                : unknown;
