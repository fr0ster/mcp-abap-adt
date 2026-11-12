/**
 * The simple strategy (spec §3.3): the configured lists matched by name and
 * prefix; it reads nothing from SAP. A subtree entry needs the package tree
 * and is refused at construction.
 */

import { accessRefusalWords, ServerRefusal } from '../auth/serverRefusal.js';
import { ParameterRefusal } from '../config/authParameters.js';
import {
  type AccessCall,
  type AccessVerdict,
  ALLOWED,
  type IAccessChecks,
  type NamedValue,
} from './accessChecks.js';
import type { AccessLists, NameEntry, PackageEntry } from './accessLists.js';

/** Whether a name or prefix entry names `value`. */
export function entryNames(
  entry: NameEntry | PackageEntry,
  value: string,
): boolean {
  if (entry.kind === 'prefix') return value.startsWith(entry.name);
  return value === entry.name;
}

/** The first of `values` no entry names, if any. */
export function firstOutside(
  values: readonly NamedValue[],
  entries: readonly (NameEntry | PackageEntry)[],
): NamedValue | undefined {
  return values.find(
    (named) => !entries.some((entry) => entryNames(entry, named.value)),
  );
}

/** The verdict on the call's requests and tables, the packages left aside. */
export function requestsAndTables(
  call: AccessCall,
  lists: AccessLists,
): AccessVerdict {
  if (lists.allowedRequests !== undefined) {
    const outside = firstOutside(call.requests, lists.allowedRequests);
    if (outside !== undefined) {
      return { allowed: false, code: 'request_not_allowed', ...outside };
    }
  }
  if (lists.deniedTables !== undefined) {
    const denied = call.tables.find((named) =>
      (lists.deniedTables ?? []).some((entry) =>
        entryNames(entry, named.value),
      ),
    );
    if (denied !== undefined) {
      return { allowed: false, code: 'table_not_allowed', ...denied };
    }
  }
  if (lists.allowedTables !== undefined) {
    const outside = firstOutside(call.tables, lists.allowedTables);
    if (outside !== undefined) {
      return { allowed: false, code: 'table_not_allowed', ...outside };
    }
  }
  return ALLOWED;
}

/** The simple strategy over `lists`; refuses a subtree entry. */
export function listedAccessChecks(lists: AccessLists): IAccessChecks {
  const own: AccessLists = { ...lists };
  const subtree = own.allowedPackages?.find(
    (entry) => entry.kind === 'subtree',
  );
  if (subtree !== undefined) {
    throw new ParameterRefusal(
      `allowed-packages: a subtree entry needs the package tree strategy: ${subtree.name}/**`,
    );
  }
  return {
    async check(call) {
      if (own.allowedPackages !== undefined) {
        const outside = firstOutside(call.packages, own.allowedPackages);
        if (outside !== undefined) {
          return { allowed: false, code: 'package_not_allowed', ...outside };
        }
      }
      return requestsAndTables(call, own);
    },
  };
}

/** The server's refusal for a refused verdict, in its fixed words. */
export function refusalOf(
  verdict: Extract<AccessVerdict, { allowed: false }>,
): ServerRefusal {
  return new ServerRefusal(
    verdict.code,
    accessRefusalWords(verdict.code, verdict.argument, verdict.value),
  );
}
