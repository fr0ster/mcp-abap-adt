import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';

export interface SearchObjectsArgs {
  query: string;
  objectType: 'DEVC';
  maxResults: number;
}

export type SearchObjectsFn = (args: SearchObjectsArgs) => Promise<string[]>;

export interface PackageResolverDeps {
  searchObjects: SearchObjectsFn;
}

const WILDCARD_RE = /[*+]/;

function isPattern(entry: string): boolean {
  return WILDCARD_RE.test(entry);
}

export async function resolvePackagePatterns(
  deps: PackageResolverDeps,
  entries: string[],
): Promise<string[]> {
  const exact: string[] = [];
  const resolved: string[] = [];
  for (const entry of entries) {
    if (isPattern(entry)) {
      const names = await deps.searchObjects({
        query: entry,
        objectType: 'DEVC',
        maxResults: 1000,
      });
      resolved.push(...names);
    } else {
      exact.push(entry);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...exact, ...resolved]) {
    const key = name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function createPackagePatternResolver(
  ctx: HandlerContext,
): SearchObjectsFn {
  const client = createAdtClient(ctx.connection, ctx.logger);
  const utils = client.getUtils();
  return async ({ query, objectType, maxResults }) => {
    const response = await utils.searchObjects({
      query,
      objectType,
      maxResults,
    });
    const status = response?.status ?? response?.response?.status;
    if (status && status !== 200) {
      throw new Error(`ADT request failed (status ${status})`);
    }
    const xml: string =
      typeof response?.data === 'string'
        ? response.data
        : String(response?.data ?? '');
    const names: string[] = [];
    for (const m of xml.matchAll(
      /<adtcore:objectReference\s+([^>]*)\/>/g,
    )) {
      const attrs = m[1];
      const name = attrs.match(/adtcore:name="([^"]*)"/)?.[1];
      if (name) names.push(name);
    }
    return names;
  };
}
