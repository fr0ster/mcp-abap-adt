/**
 * The package guard: where a live run may create, by the configured system
 * kind — on premise `$TMP` or the development package, on the cloud
 * (which has no `$TMP`) exactly the build package, on the legacy system
 * `$TMP`. A package the config names is checked before anything is created
 * in it; a refusal names the config key and the package, and nothing is
 * created. A package a suite itself creates under an allowed parent is
 * checked by its parent.
 *
 * Pure on purpose: the system kind is the caller's, so the unit tests need
 * no config.
 */
import type { ConfiguredSystemKind } from './configuredSystemKind';

/** The packages a run may create in, per system kind. */
export const CREATION_PACKAGES: Readonly<
  Record<ConfiguredSystemKind, readonly string[]>
> = {
  onprem: ['$TMP', 'ZAC_TEST_PKG'],
  cloud: ['ZADT_BLD_PKG03'],
  legacy: ['$TMP'],
};

/**
 * Why `packageName`, named by the config key `key`, may not be created in
 * on a `kind` system; `undefined` when it may.
 */
export function packageRefusal(
  kind: ConfiguredSystemKind | undefined,
  key: string,
  packageName: string,
): string | undefined {
  if (kind === undefined) {
    return `the package guard: ${key} names ${packageName}, and no system kind is stated: nothing is created`;
  }
  const accepted = CREATION_PACKAGES[kind];
  if (accepted.includes(packageName.trim().toUpperCase())) return undefined;
  return `the package guard: ${key} names ${packageName}, which is none of ${accepted.join(', ')} on ${kind}: nothing is created`;
}

/**
 * The guard's refusal: a failure of the case, never a skip — a tester that
 * turns its start-up errors into a skip passes this one on.
 */
export class PackageGuardRefusal extends Error {}

/** `packageName` when it may be created in; otherwise the refusal is thrown. */
export function guardedPackage(
  kind: ConfiguredSystemKind | undefined,
  key: string,
  packageName: string,
): string {
  const refusal = packageRefusal(kind, key, packageName);
  if (refusal !== undefined) throw new PackageGuardRefusal(refusal);
  return packageName;
}

/**
 * What SAP says of a package the config names: it exists with this super
 * package (`undefined` when its document names none), or it does not exist.
 */
export type PackageOnSystem =
  | { exists: true; superPackage: string | undefined }
  | { exists: false };

/**
 * A package the config names together with the parent it is created under
 * (`shared_dependencies.package` under `shared_dependencies.super_package`):
 * allowed itself; else, when it exists, by its actual super package as SAP
 * reads it — never by the configured one; else, when it is still to be
 * created, by the configured parent it will be created under.
 */
export function guardedChildPackage(
  kind: ConfiguredSystemKind | undefined,
  key: string,
  packageName: string,
  onSystem: PackageOnSystem,
  parentKey: string,
  parent: string | undefined,
): string {
  if (packageRefusal(kind, key, packageName) === undefined) return packageName;
  if (onSystem.exists) {
    const actual = onSystem.superPackage;
    if (actual === undefined || actual.trim() === '') {
      return guardedPackage(kind, key, packageName);
    }
    guardedPackage(
      kind,
      `the super package SAP reads for ${key} (${packageName})`,
      actual,
    );
    return packageName;
  }
  if (parent === undefined || parent.trim() === '') {
    return guardedPackage(kind, key, packageName);
  }
  guardedPackage(kind, parentKey, parent);
  return packageName;
}
