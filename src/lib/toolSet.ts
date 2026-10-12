/**
 * `@mcp-abap-adt/lib/tool-set` — what a server serves, as an input of its
 * launcher (spec §3.4, §3.5, D37, D49).
 *
 * core's, http's and sse's `main({ toolSet, program, version })` take a
 * `ToolSet` and nothing else of the tools: everything a launcher does —
 * options, credentials, cancellation, failures, shutdown — is its transport's,
 * the same for any set. The full binaries pass {@link fullToolSet}; each
 * compact binary passes `compactToolSetOf` with the two halves' entry builders,
 * so full and compact cannot fork on any transport.
 */

import { CompactDebugHandlersGroup } from './compact/debug/group';
import {
  COMPACT_EXPOSITION_HELP,
  COMPACT_EXPOSITION_ROW,
  compactExpositionOf,
  compactExpositionValues,
} from './compact/exposition';
import {
  type CompactEntryBuilder,
  CompactHandlersGroup,
} from './compact/group';
import {
  EXPOSITION_ROW,
  type Parameter,
  ParameterRefusal,
  type ParameterValue,
} from './config/authParameters';
import {
  expositionHelp,
  type ServedTransport,
  toHandlerSets,
} from './config/exposition';
import { expositionProblem } from './config/validateExposition';
import type { HandlerContext, IHandlerGroup } from './handlers/interfaces';

export type { ServedTransport } from './config/exposition';

import { CompositeHandlersRegistry } from './handlers/registry/CompositeHandlersRegistry';
import {
  expositionGroups,
  noConnectionContext,
} from './handlers/registry/expositionRegistry';

/**
 * The groups a server serves, given the base context and the exposition; and
 * the exposition's words, default and help.
 */
export interface ToolSet {
  /**
   * The `--exposition` row of a binary's table: its help line, its default
   * (also the `--conf` template's value) and the config file's validation.
   */
  readonly expositionRow: Parameter;
  /** The HANDLER EXPOSITION section of the `--help` of a binary serving `transport`. */
  expositionHelp(transport: ServedTransport): string;
  /** The `--exposition` lines of the EXAMPLES section of `program`'s help. */
  expositionExamples(program: string): string;
  /**
   * The exposition a run serves. `read` is what the binary's table read for
   * the row — the CLI form (unless the row leaves it to the set), else the
   * config file's, else the row's default; `argv` the arguments as given, for
   * a set that reads its flag itself; `transport` the binary's, for words
   * that name another binary. A value the set does not serve throws a
   * `ParameterRefusal` in fixed words.
   */
  exposition(
    read: ParameterValue | undefined,
    argv: readonly string[],
    transport: ServedTransport,
  ): readonly string[];
  /** The groups for an exposition `exposition()` answered, built against `context`, in registration order. */
  groups(
    context: HandlerContext,
    exposition: readonly string[],
  ): IHandlerGroup[];
}

/** The registry a launcher serves: `toolSet`'s groups against a context with no connection yet. */
export function registryOf(
  toolSet: ToolSet,
  exposition: readonly string[],
): CompositeHandlersRegistry {
  return new CompositeHandlersRegistry(
    toolSet.groups(noConnectionContext(), exposition),
  );
}

const listOf = (value: ParameterValue | undefined): string[] | undefined =>
  Array.isArray(value) ? [...value] : undefined;

/**
 * The object-oriented tool set of `mcp-abap-adt`, `mcp-abap-adt-http` and
 * `mcp-abap-adt-sse`: readonly (with system), high, low, debug, and search —
 * `readonly,high` by default. `compact` and `high` beside `low` are refused.
 */
export const fullToolSet: ToolSet = {
  expositionRow: EXPOSITION_ROW,
  expositionHelp: (transport) => expositionHelp(transport),
  expositionExamples: (program) =>
    `  # Readonly tools only (with search and system)\n  ${program} --exposition=readonly\n\n` +
    `  # The debugger beside the default sets\n  ${program} --exposition=readonly,high,debug\n`,
  exposition(read, _argv, transport) {
    // Every word is checked before any is dropped: an unknown one is refused.
    const words = listOf(read) ?? [];
    const problem = expositionProblem(words, transport);
    if (problem !== undefined) throw new ParameterRefusal(problem);
    return toHandlerSets(words);
  },
  groups(context, exposition) {
    return expositionGroups(exposition, context);
  },
};

/** The two halves of the compact facade, as their packages build them. */
export interface CompactHalves {
  /** `compactReadOnlyEntries` of `@mcp-abap-adt/compact-readonly`. */
  readonly readOnly: CompactEntryBuilder;
  /** `compactModifyEntries` of `@mcp-abap-adt/compact-modify`. */
  readonly modify: CompactEntryBuilder;
}

/**
 * The compact tool set, composed of the two halves' entry builders: `ro` the
 * read-only half, `rw` (the default) both, `debug` beside either the four
 * debugger verbs — and no search, so the list is short by construction.
 *
 * Every group is a real `BaseHandlerGroup`, never an object literal wrapping
 * the entries: the launcher sets the per-request context on the group that
 * owns an entry, and only a group reads `this.context` when the handler runs.
 * A literal closing over the startup context is the defect review caught on
 * PR #240 — a server running every call against the connection it had before
 * it connected.
 */
export function compactToolSetOf(halves: CompactHalves): ToolSet {
  return {
    expositionRow: COMPACT_EXPOSITION_ROW,
    expositionHelp: () => COMPACT_EXPOSITION_HELP,
    expositionExamples: (program) =>
      `  # The 16 tools that change nothing\n  ${program} --exposition=ro\n\n` +
      `  # All 25, and the four debugger verbs\n  ${program} --exposition=rw,debug\n`,
    exposition(read, argv) {
      // The flag is read here alone (the row leaves its CLI form to the set),
      // the last one winning and an empty one refused; without it, the config
      // file's value (already read by the row's parser), else the default.
      const flagged = compactExpositionValues(argv);
      if (flagged !== undefined) return compactExpositionOf(flagged);
      return compactExpositionOf(listOf(read) ?? ['rw']);
    },
    groups(context, exposition) {
      const half =
        exposition[0] === 'ro'
          ? new CompactHandlersGroup(
              context,
              [halves.readOnly],
              'CompactReadOnlyHandlers',
            )
          : new CompactHandlersGroup(context, [halves.readOnly, halves.modify]);
      return exposition.includes('debug')
        ? [half, new CompactDebugHandlersGroup(context)]
        : [half];
    },
  };
}

export {
  type CompactExposition,
  parseCompactDebug,
  parseCompactExposition,
} from './compact/exposition';
export type { CompactEntryBuilder } from './compact/group';
