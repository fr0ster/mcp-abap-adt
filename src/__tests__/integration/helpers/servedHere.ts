/**
 * Where a suite of the older testers runs, decided in code by what the
 * configured system serves: a tool is tested on a system that lists it
 * (`listedTool` — its `available_in` and the system's ADT type table), and
 * skipped with the reason where it is not. The test config's `available_in`
 * and `enabled` decide nothing here.
 *
 * - `servedSuite(tools)`: the `describe` of a suite that runs when the
 *   configured system lists every tool it calls; otherwise it skips naming
 *   the first tool not served (the same `[liveSuite] … skipped —` line
 *   `liveSuite` writes).
 * - `skipUnlessServed(tool)`: inside a running case, skips it when the
 *   configured system does not list `tool`.
 */
import { describe } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { listedTool } from '../../../lib/listedTool';
import { fullToolSet } from '../../../lib/toolSet';
import { configuredSystemKind } from './configHelpers';
import { NO_KIND_STATED } from './configuredSystemKind';
import { hasTestConfig } from './live';
import { skipRunningTest } from './runningTest';

/** Every tool of both sets over both transports, data tools on, by name. */
let everyEntry: ReadonlyMap<string, HandlerEntry> | undefined;

function entryOf(tool: string): HandlerEntry {
  if (everyEntry === undefined) {
    const entries = new Map<string, HandlerEntry>();
    for (const toolSet of [fullToolSet, compactToolSet]) {
      for (const transport of ['stdio', 'http'] as const) {
        for (const group of toolSet.groups(noConnectionContext(), transport, {
          dataTools: true,
        })) {
          for (const entry of group.getHandlers()) {
            const name = entry.toolDefinition.name;
            if (!entries.has(name)) entries.set(name, entry);
          }
        }
      }
    }
    everyEntry = entries;
  }
  const entry = everyEntry.get(tool);
  if (entry === undefined) throw new Error(`no tool ${tool} in either set`);
  return entry;
}

/** Why `tool` is not tested on the configured system, or `undefined` when it is served there. */
export function notServedReason(tool: string): string | undefined {
  const kind = configuredSystemKind();
  if (kind === undefined) return NO_KIND_STATED;
  const definition = entryOf(tool).toolDefinition;
  const listed = listedTool(definition, kind);
  if (listed.listed) return undefined;
  return listed.reason === 'not-available'
    ? `${tool} is not served on ${kind} (available_in: ${(definition.available_in ?? []).join(', ')})`
    : `${tool} is not served on ${kind} (its ADT type table serves no operation it needs)`;
}

/**
 * The `describe` of a suite of the older testers that calls `tools`: the
 * suite runs where the configured system lists every one of them, and skips
 * with the reason elsewhere. Used as `const suite = servedSuite([...]);`
 * then `suite('title', () => { … })`, so the suite's body keeps its place.
 */
export function servedSuite(
  tools: readonly string[],
): (title: string, body: () => void) => void {
  return (title, body) => {
    const skipped = !hasTestConfig()
      ? 'no test config (tests/test-config.yaml or MCP_TEST_CONFIG)'
      : tools.map(notServedReason).find((reason) => reason !== undefined);
    if (skipped !== undefined) {
      console.log(`[liveSuite] ${title}: skipped — ${skipped}`);
      describe(title, { skip: skipped }, body);
      return;
    }
    describe(title, body);
  };
}

/** Inside a running case: skips it, with the reason, when the configured system does not serve `tool`. */
export function skipUnlessServed(tool: string): boolean {
  const reason = notServedReason(tool);
  if (reason === undefined) return false;
  skipRunningTest(reason);
  return true;
}
