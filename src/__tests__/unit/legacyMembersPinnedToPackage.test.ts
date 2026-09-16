/**
 * `LEGACY_NO_STRATEGY` and `LEGACY_THROWS` are hand-transcribed constants —
 * correct today because someone read the shipped `.js` and copied the
 * member names out. Nothing fails if `@mcp-abap-adt/adt-clients` adds,
 * removes, or renames an override; the transcription would simply go stale
 * and the ledger would keep reporting yesterday's shape. Task 26 turns this
 * ledger into an invariant, which makes that staleness a silent regression
 * rather than a loud one.
 *
 * This reads the installed package's own classes at run time — via
 * `require.resolve('@mcp-abap-adt/adt-clients')` and a relative path from
 * there, since none of the five classes involved are part of the package's
 * public `exports` map — and asserts the two constants against what is
 * actually shipped, not against a copy of it.
 */
import { dirname, join } from 'node:path';
import { AdtClientLegacy } from '@mcp-abap-adt/adt-clients';
import {
  LEGACY_NO_STRATEGY,
  LEGACY_THROWS,
} from '../../../scripts/lib/analyseOmissions';

/** The installed package's own root — resolved, not assumed. */
function packageRoot(): string {
  return dirname(dirname(require.resolve('@mcp-abap-adt/adt-clients')));
}

function loadClass(relativeDistPath: string, exportName: string): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(join(packageRoot(), relativeDistPath))[exportName];
}

/**
 * Own methods a `Legacy` class declares that are not overrides at all — a
 * private helper it introduces for its own use, never a member any caller
 * reaches. `typeof BaseClass.prototype[m] === 'function'` looks like the
 * obvious filter for "is this really an override", and it is wrong: modern
 * `AdtPackage` has no public `read` at all (it implements
 * `IAdtMetadataReadable`, not `IAdtReadable`), so that filter would silently
 * drop `read` from the "shipped" side and hide exactly the member this
 * task's own review found missing a strategy claim, not the number of
 * members. A short, explicit, cited exclude list says what is being left
 * out and why, instead of a heuristic that would have gotten this wrong.
 */
const PRIVATE_HELPERS = new Set([
  // `AdtUtilsLegacy.js`: `private refuse(operation, endpoint)` — the shared
  // body `getTableColumns`/`getTableContents`/`getSqlQuery` all call, not a
  // member any caller reaches through `getUtils()`.
  'AdtUtilsLegacy.refuse',
]);

function shippedOverrides(LegacyClass: any, legacyName: string): string[] {
  return Object.getOwnPropertyNames(LegacyClass.prototype)
    .filter((member) => member !== 'constructor')
    .filter((member) => !PRIVATE_HELPERS.has(`${legacyName}.${member}`))
    .sort();
}

describe('LEGACY_NO_STRATEGY is pinned to the shipped Legacy classes', () => {
  it.each([
    ['getPackage', 'dist/core/package/AdtPackageLegacy.js', 'AdtPackageLegacy'],
    [
      'getUnitTest',
      'dist/core/unitTest/AdtUnitTestLegacy.js',
      'AdtUnitTestLegacy',
    ],
    [
      'getRequest',
      'dist/core/transport/AdtRequestLegacy.js',
      'AdtRequestLegacy',
    ],
    ['getUtils', 'dist/core/shared/AdtUtilsLegacy.js', 'AdtUtilsLegacy'],
  ])('%s: the constant lists exactly what %s overrides', (factory, legacyPath, legacyName) => {
    const LegacyClass = loadClass(legacyPath, legacyName);
    const shipped = shippedOverrides(LegacyClass, legacyName);
    expect(shipped).toEqual([...LEGACY_NO_STRATEGY[factory]].sort());
  });
});

describe('LEGACY_THROWS is pinned to the shipped AdtClientLegacy', () => {
  // A stub is enough: every factory in `LEGACY_THROWS` throws before it
  // ever touches the connection, and every factory outside it constructs
  // an object without making a request.
  const stub = {
    makeAdtRequest: async () => ({ status: 200, headers: {}, data: '' }),
  };

  it('classifies every AdtClientLegacy factory override the same way the constant does', () => {
    const client = new (AdtClientLegacy as any)(stub);
    const factories = Object.getOwnPropertyNames(
      Object.getPrototypeOf(client),
    ).filter((member) => member !== 'constructor' && member.startsWith('get'));

    // The set is non-trivial either way: guards against a resolution
    // failure (an empty prototype) reading as a vacuous pass.
    expect(factories.length).toBeGreaterThan(10);

    for (const factory of factories) {
      let threw = false;
      try {
        (client as any)[factory]();
      } catch {
        threw = true;
      }
      expect({ factory, threw }).toEqual({
        factory,
        threw: LEGACY_THROWS.has(factory),
      });
    }
  });
});
