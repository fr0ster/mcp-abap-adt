/**
 * The entries a system kind serves, by tool name: the full and the compact
 * tool sets over both transports, each tool once, kept when it is listed for
 * the kind's stated environment.
 *
 * Shared by the Jest pin harness (`pinCases.ts`, which re-exports it for the
 * pin suites) and the live files (`integration/helpers/live.ts`), so it
 * imports no test runner (D27): a node:test file reaches it through the
 * node:test build, whose `types` is `node` alone.
 */
import { compactToolSet } from '../../../compact/src/launcher';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { noConnectionContext } from '../../lib/handlers/registry/expositionRegistry';
import { listedTool, statedEnvironment } from '../../lib/listedTool';
import { fullToolSet } from '../../lib/toolSet';
import type { SystemKind } from './servedTools';

/** The tools a variant serves through their entries, by name. */
const entriesByVariant = new Map<
  SystemKind,
  ReadonlyMap<string, HandlerEntry>
>();

export function servedEntries(
  variant: SystemKind,
): ReadonlyMap<string, HandlerEntry> {
  const known = entriesByVariant.get(variant);
  if (known !== undefined) return known;
  const environment = statedEnvironment(variant);
  const entries = new Map<string, HandlerEntry>();
  for (const toolSet of [fullToolSet, compactToolSet]) {
    for (const transport of ['stdio', 'http'] as const) {
      for (const group of toolSet.groups(noConnectionContext(), transport, {
        dataTools: true,
      })) {
        for (const entry of group.getHandlers()) {
          const name = entry.toolDefinition.name;
          if (entries.has(name)) continue;
          if (listedTool(entry.toolDefinition, environment).listed) {
            entries.set(name, entry);
          }
        }
      }
    }
  }
  entriesByVariant.set(variant, entries);
  return entries;
}
