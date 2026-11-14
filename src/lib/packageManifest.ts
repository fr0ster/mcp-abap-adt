/**
 * A package's own manifest, read: its `name` and `version`.
 *
 * A launcher reads its `package.json` (a `require`, which a bundler inlines,
 * or a file read) — a value from outside the type system, so it is read here
 * by its shape, never assumed: a manifest without a text `name` and a text
 * `version` stops the start in words.
 */
import { child } from './outsideValue';

/** What a launcher reads of its manifest. */
export interface PackageManifest {
  readonly name: string;
  readonly version: string;
}

/** `value`, a package's parsed `package.json`, as its name and version. */
export function packageManifestOf(value: unknown): PackageManifest {
  const name = child(value, 'name');
  const version = child(value, 'version');
  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new Error('package.json names no name and version');
  }
  return { name, version };
}
