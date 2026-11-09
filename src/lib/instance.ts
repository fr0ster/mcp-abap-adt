/**
 * Each loaded copy of `@mcp-abap-adt/lib` registers itself here, once, when
 * this module loads: one frozen entry pushed onto a process-wide array. The
 * array's length is the number of copies in the process; a server runtime
 * reads it with `libInstances()` and refuses to start on more than one. `lib`
 * itself refuses nothing.
 *
 * A copy from 24.0.0 on registers `{ version, label }`: its package version,
 * read from its own manifest (`require('../../package.json')` — the package
 * root from `src/lib/` and from `dist/lib/`, inlined by a bundler), and
 * `bundled` inside a Node SEA executable (`node:sea`'s `isSea()`), `dist`
 * otherwise. No path is registered. A copy before 24.0.0 registered
 * `{ file }`; such an entry is kept and counted, and its value is never read
 * beyond telling the two shapes apart.
 */
import { isSea } from 'node:sea';
import { packageManifestOf } from './packageManifest';

/** What a copy from 24.0.0 on registers. */
export interface LibCopy {
  readonly version: string;
  readonly label: 'dist' | 'bundled';
}

/** What a copy before 24.0.0 registered: a file, never read here. */
export interface EarlierLibCopy {
  readonly file: string;
}

/** One registered copy, of either generation. */
export type LibInstance = LibCopy | EarlierLibCopy;

const REGISTRY = Symbol.for('@mcp-abap-adt/lib/instances');

/** Whether `entry`, read off the global, is an entry of either shape. */
function isEntry(entry: unknown): entry is LibInstance {
  if (typeof entry !== 'object' || entry === null) return false;
  if ('version' in entry || 'label' in entry) {
    return (
      'version' in entry &&
      typeof entry.version === 'string' &&
      'label' in entry &&
      (entry.label === 'dist' || entry.label === 'bundled')
    );
  }
  return 'file' in entry && typeof entry.file === 'string';
}

/**
 * Whether `value` is the registry another copy of this module left on the
 * global: a list whose entries are each of either shape.
 */
function isRegistry(value: unknown): value is LibInstance[] {
  return Array.isArray(value) && value.every(isEntry);
}

function registry(): LibInstance[] {
  const found: unknown = Reflect.get(globalThis, REGISTRY);
  if (isRegistry(found)) return found;
  const created: LibInstance[] = [];
  Reflect.set(globalThis, REGISTRY, created);
  return created;
}

registry().push(
  Object.freeze({
    version: packageManifestOf(require('../../package.json')).version,
    label: isSea() ? 'bundled' : 'dist',
  }),
);

/** Every copy of `lib` loaded in this process, in load order. */
export function libInstances(): readonly LibInstance[] {
  return Object.freeze([...registry()]);
}
