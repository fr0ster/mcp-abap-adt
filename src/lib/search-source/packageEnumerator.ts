import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import {
  assembleList,
  type PackageItem,
  walkPackage,
} from '../strategies/packageWalk';
import { ourUtils } from '../strategies/resultSets';

export type ScanObjectType = 'PROG' | 'FUGR' | 'CLAS';

/**
 * The contents item as the walk hands it over.
 *
 * `IPackageContentItem` — the type this alias used to point at — no longer
 * exists in `@mcp-abap-adt/interfaces` at all (`getPackageContentsList`'s own
 * type went with the member). `PackageItem` from `packageWalk.ts` carries the
 * same fields this module reads (`isPackage`, `type`, `name`, `packageName`)
 * — the flat-list assembly `handleGetPackageContents.ts` already produces
 * from the same walk.
 */
export type PackageContentItem = PackageItem;

export interface EnumeratedObject {
  devclass: string;
  object_type: ScanObjectType;
  object_name: string;
}

export interface EnumerateInput {
  packages: string[];
  include_subpackages: boolean;
  object_filter?: string;
  object_types: readonly ScanObjectType[];
}

export type PackageContentsFetcher = (
  packageName: string,
  options: { includeSubpackages: boolean },
) => Promise<PackageContentItem[]>;

const ADT_TYPE_TO_FAMILY: Record<string, ScanObjectType> = {
  'PROG/P': 'PROG',
  'FUGR/F': 'FUGR',
  'CLAS/OC': 'CLAS',
};

function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (const ch of glob) {
    if (ch === '*') pattern += '.*';
    else if (ch === '?') pattern += '.';
    else pattern += ch.replace(/[\\.+^$()|[\]{}]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`, 'i');
}

export async function enumerateScanTargets(
  fetch: PackageContentsFetcher,
  input: EnumerateInput,
): Promise<EnumeratedObject[]> {
  const wantedFamilies = new Set<ScanObjectType>(input.object_types);
  const filter = input.object_filter
    ? globToRegExp(input.object_filter)
    : undefined;
  const seen = new Set<string>();
  const out: EnumeratedObject[] = [];

  for (const pkg of input.packages) {
    const items = await fetch(pkg.toUpperCase(), {
      includeSubpackages: input.include_subpackages,
    });
    for (const item of items) {
      if (item.isPackage) continue;
      const family = ADT_TYPE_TO_FAMILY[item.type];
      if (!family || !wantedFamilies.has(family)) continue;
      if (filter && !filter.test(item.name)) continue;
      const key = `${item.packageName} ${family} ${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        devclass: item.packageName,
        object_type: family,
        object_name: item.name,
      });
    }
  }

  out.sort((a, b) => {
    if (a.devclass !== b.devclass) return a.devclass < b.devclass ? -1 : 1;
    if (a.object_type !== b.object_type)
      return a.object_type < b.object_type ? -1 : 1;
    return a.object_name < b.object_name ? -1 : 1;
  });

  return out;
}

/**
 * `getPackageContentsList`'s replacement: the same walk
 * `handleGetPackageContents.ts` already assembles into a flat list, per the
 * guide's "Walks are yours" table and mcp-abap-adt-clients#141 (`walkPackage`
 * itself is filed against that issue — see its own doc comment).
 */
export function createPackageContentsFetcher(
  ctx: HandlerContext,
): PackageContentsFetcher {
  const client = createAdtClient(ctx.connection, ctx.logger);
  const utils = client.getUtils(ourUtils);
  return async (packageName, options) =>
    assembleList(
      packageName,
      await walkPackage(utils, packageName, {
        includeSubpackages: options.includeSubpackages,
      }),
    );
}
