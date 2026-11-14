/**
 * The package-tree strategy (spec §3.3): the configured lists, and a subtree
 * entry (`ZFOO/**`) matched by reading the package tree upward from SAP
 * through the call's `IPackageReader`. Exact and prefix entries are matched
 * first, with no read; a package create's `package_name` takes its parent
 * from the call's `super_package`, so the package to be created is never
 * read. A read that fails, or a package met twice on the way up, refuses
 * the call `package_tree_unreadable`.
 */

import type {
  AccessCall,
  AccessVerdict,
  IAccessChecks,
  IPackageReader,
  NamedValue,
} from './accessChecks.js';
import type { AccessLists, NameEntry, PackageEntry } from './accessLists.js';
import {
  entryNames,
  listedAccessChecks,
  requestsAndTables,
} from './listedAccessChecks.js';

type Placed = 'inside' | 'outside' | 'unreadable';

/** Where `named` sits against the subtree entries, walking up from `start`. */
async function placed(
  start: string | undefined,
  subtrees: readonly PackageEntry[],
  sap: IPackageReader,
  seen: Set<string>,
): Promise<Placed> {
  let current = start;
  while (current !== undefined) {
    if (seen.has(current)) return 'unreadable';
    seen.add(current);
    const here = current;
    if (subtrees.some((entry) => entry.name === here)) return 'inside';
    try {
      current = await sap.superPackageOf(here);
    } catch {
      return 'unreadable';
    }
  }
  return 'outside';
}

/** The verdict on one named package. */
async function packageVerdict(
  named: NamedValue,
  call: AccessCall,
  entries: readonly PackageEntry[],
  sap: IPackageReader,
): Promise<AccessVerdict | undefined> {
  if (entries.some((entry) => entryNames(entry, named.value))) return;
  const subtrees = entries.filter((entry) => entry.kind === 'subtree');
  const seen = new Set<string>();
  let start: string | undefined = named.value;
  if (call.packageCreate && named.argument === 'package_name') {
    // The package to be created is not read: its parent is the call's.
    start = call.packages.find(
      (other) => other.argument === 'super_package',
    )?.value;
  }
  const where =
    subtrees.length === 0
      ? 'outside'
      : await placed(start, subtrees, sap, seen);
  if (where === 'inside') return;
  return {
    allowed: false,
    code:
      where === 'unreadable'
        ? 'package_tree_unreadable'
        : 'package_not_allowed',
    argument: named.argument,
    value: named.value,
  };
}

/** The tree strategy over `lists`. */
export function packageTreeAccessChecks(lists: AccessLists): IAccessChecks {
  const own: AccessLists = { ...lists };
  return {
    async check(call, sap) {
      const entries = own.allowedPackages;
      if (entries !== undefined) {
        for (const named of call.packages) {
          const verdict = await packageVerdict(named, call, entries, sap);
          if (verdict !== undefined) return verdict;
        }
      }
      return requestsAndTables(call, own);
    },
  };
}

/** Whether `lists` holds any call-time list. */
function anyList(lists: AccessLists): boolean {
  return (
    lists.allowedPackages !== undefined ||
    lists.allowedRequests !== undefined ||
    lists.deniedTables !== undefined ||
    lists.allowedTables !== undefined
  );
}

/**
 * The strategy a launcher gives for `lists`: none when no call-time list is
 * configured; the tree strategy when an allowed-packages entry is a
 * subtree; else the simple one.
 */
export function accessChecksFor(lists: AccessLists): IAccessChecks | undefined {
  if (!anyList(lists)) return undefined;
  const subtree = lists.allowedPackages?.some(
    (entry) => entry.kind === 'subtree',
  );
  return subtree === true
    ? packageTreeAccessChecks(lists)
    : listedAccessChecks(lists);
}
