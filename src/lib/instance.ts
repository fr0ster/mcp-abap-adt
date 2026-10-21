/**
 * Each loaded copy of `@mcp-abap-adt/lib` registers itself here, once, when
 * this module loads: one frozen `{ file }` pushed onto a process-wide array.
 * The array's length is the number of copies in the process; a server
 * runtime reads it with `libInstances()` and refuses to start on more than
 * one. `lib` itself refuses nothing.
 *
 * `file` is this module's `__filename` when there is one, `bundled`
 * otherwise. It is only shown, never resolved, read or compared — nothing
 * here touches the file system, so a bundle with no package directory holds
 * one copy and registers once.
 */

export interface LibInstance {
  readonly file: string;
}

const REGISTRY = Symbol.for('@mcp-abap-adt/lib/instances');

function registry(): LibInstance[] {
  const holder = globalThis as Record<symbol, unknown>;
  const found = holder[REGISTRY];
  if (Array.isArray(found)) return found as LibInstance[];
  const created: LibInstance[] = [];
  holder[REGISTRY] = created;
  return created;
}

registry().push(
  Object.freeze({
    file: typeof __filename === 'string' ? __filename : 'bundled',
  }),
);

/** Every copy of `lib` loaded in this process, in load order. */
export function libInstances(): readonly LibInstance[] {
  return Object.freeze([...registry()]);
}
