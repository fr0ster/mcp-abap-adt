import type { AdtTypeCode } from '@mcp-abap-adt/interfaces-adt';
import type { AdtCodes, TableMainOf } from '../adtProjections';
import { tableCodeOf } from '../adtTypeCode';
import { isCredentialFailure } from '../answer';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import { globMatches } from '../plainText';
import {
  assembleList,
  nodeStructureOn,
  type PackageItem,
  walkPackage,
} from '../strategies/packageWalk';
import { ourUtils } from '../strategies/resultSets';

/**
 * The codes a scan reads: every source-bearing object a package lists —
 * programs and program includes, function groups, classes, interfaces, CDS
 * data definitions, behavior definitions, metadata extensions and service
 * definitions.
 */
export type ScanCode = AdtCodes<
  | 'PROG/P'
  | 'PROG/I'
  | 'FUGR/F'
  | 'CLAS/OC'
  | 'INTF/OI'
  | 'DDLS/DF'
  | 'BDEF/BDO'
  | 'DDLX/EX'
  | 'SRVD/SRV'
>;

/**
 * What a scan names an object by: the main type the tables state for its
 * code (`PROG/I`'s main type is `PROG`, as `PROG/P`'s).
 */
export type ScanObjectType = TableMainOf<ScanCode>;

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
  /** The code SAP listed the object under: which reader reads it. */
  code: ScanCode;
}

export interface EnumerateInput {
  packages: string[];
  include_subpackages: boolean;
  object_filter?: string;
  object_types: readonly ScanObjectType[];
}

/** One asked package's walk: its items, and every package whose own level was read. */
export interface PackageContents {
  items: PackageContentItem[];
  walked: ReadonlySet<string>;
}

/**
 * The walk of one asked package. It throws when the package's own root was
 * refused or is not there; a refused level below it excludes only its
 * branch (DO19).
 */
export type PackageContentsFetcher = (
  packageName: string,
  options: { includeSubpackages: boolean },
) => Promise<PackageContents>;

/** The family of each code a scan reads, by the tables' main type. */
const FAMILY_OF: Readonly<Record<ScanCode, ScanObjectType>> = {
  'PROG/P': 'PROG',
  'PROG/I': 'PROG',
  'FUGR/F': 'FUGR',
  'CLAS/OC': 'CLAS',
  'INTF/OI': 'INTF',
  'DDLS/DF': 'DDLS',
  'BDEF/BDO': 'BDEF',
  'DDLX/EX': 'DDLX',
  'SRVD/SRV': 'SRVD',
};

/** Whether a table code is one a scan reads. */
function isScanCode(code: AdtTypeCode): code is ScanCode {
  return code in FAMILY_OF;
}

/** The code of a type SAP answered in a package listing, if it is scanned. */
function scanCodeOf(type: string): ScanCode | undefined {
  const code = tableCodeOf(type);
  return code !== undefined && isScanCode(code) ? code : undefined;
}

/** Every family a scan reads: the default of `object_types`. */
export const SCAN_OBJECT_TYPES = [
  'PROG',
  'FUGR',
  'CLAS',
  'INTF',
  'DDLS',
  'BDEF',
  'DDLX',
  'SRVD',
] as const satisfies readonly ScanObjectType[];

/** The scan targets of a walk, and how many packages were walked. */
export interface EnumeratedTargets {
  targets: EnumeratedObject[];
  /** The packages whose own level was read, each once. */
  packages: number;
}

export async function enumerateScanTargets(
  fetch: PackageContentsFetcher,
  input: EnumerateInput,
): Promise<EnumeratedTargets> {
  const wantedFamilies = new Set<ScanObjectType>(input.object_types);
  const filter = input.object_filter;
  const seen = new Set<string>();
  const walked = new Set<string>();
  const out: EnumeratedObject[] = [];

  for (const pkg of input.packages) {
    let items: PackageContentItem[];
    try {
      const contents = await fetch(pkg.toUpperCase(), {
        includeSubpackages: input.include_subpackages,
      });
      items = contents.items;
      for (const name of contents.walked) walked.add(name.toUpperCase());
    } catch (error) {
      // A package whose root SAP refused, or that is not there, is skipped;
      // the other packages are walked on. A credential failure ends the call.
      if (isCredentialFailure(error)) throw error;
      continue;
    }
    for (const item of items) {
      if (item.isPackage) continue;
      const code = scanCodeOf(item.type);
      if (code === undefined) continue;
      const family = FAMILY_OF[code];
      if (!wantedFamilies.has(family)) continue;
      if (filter && !globMatches(filter, item.name)) continue;
      const key = `${item.packageName} ${family} ${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        devclass: item.packageName,
        object_type: family,
        object_name: item.name,
        code,
      });
    }
  }

  out.sort((a, b) => {
    if (a.devclass !== b.devclass) return a.devclass < b.devclass ? -1 : 1;
    if (a.object_type !== b.object_type)
      return a.object_type < b.object_type ? -1 : 1;
    return a.object_name < b.object_name ? -1 : 1;
  });

  return { targets: out, packages: walked.size };
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
  const utils = nodeStructureOn(ctx, client.getUtils(ourUtils));
  return async (packageName, options) => {
    const walked = new Set<string>();
    const items = assembleList(
      packageName,
      await walkPackage(utils, packageName, {
        includeSubpackages: options.includeSubpackages,
        // A level SAP answers 404 is scope the scan did not read: the root's
        // refusal, never an empty level; below the root, only that branch
        // is excluded.
        missingLevel: 'refused',
        branchRule: { walked },
      }),
    );
    return { items, walked };
  };
}
