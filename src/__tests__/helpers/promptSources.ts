/**
 * A prompt source built as `BaseMcpServer` lists a set's tools: the set's
 * groups with the denied actions applied (`withoutDenied`), each long tool
 * listed in the call where no background-run strategy serves it
 * (`longToolInTheCall`), each tool as the kind lists it (`listedTool`), and
 * `state_handle` declared on Streamable HTTP (`withStateHandle`).
 */

import { parseDeniedEntry } from '../../lib/access/deniedActions';
import { withoutDenied } from '../../lib/access/withoutDenied';
import {
  isBackgroundRunTool,
  longToolInTheCall,
} from '../../lib/backgroundRuns/tools';
import type { ServedTransport } from '../../lib/config/binaries';
import { noConnectionContext } from '../../lib/handlers/registry/expositionRegistry';
import { isLongTool } from '../../lib/longTools';
import { listedPromptTool, promptSourceOf } from '../../lib/prompts/source';
import type { ListedPromptTool, PromptSource } from '../../lib/prompts/types';
import type { AbapSystemKind } from '../../lib/systemKind';
import type { ToolSet } from '../../lib/toolSet';

/** How the source's server is started. */
export interface PromptSourceOptions {
  readonly transport: ServedTransport;
  /** Deny entries, as `--deny-actions` takes them. */
  readonly denied?: readonly string[];
  /** Whether the server holds a background-run strategy. */
  readonly backgroundRuns: boolean;
}

/** The prompt source of `set` served on `kind` under `options`. */
export function promptSourceFor(
  set: ToolSet,
  kind: AbapSystemKind | undefined,
  options: PromptSourceOptions,
): PromptSource {
  const groups = withoutDenied(
    set.groups(noConnectionContext(), options.transport, { dataTools: false }),
    (options.denied ?? []).map((entry) => parseDeniedEntry(entry, 'test')),
  );
  const stateHandle = options.transport === 'http';
  const tools: ListedPromptTool[] = [];
  for (const group of groups) {
    for (const entry of group.getHandlers()) {
      const definition = entry.toolDefinition;
      if (!options.backgroundRuns && isBackgroundRunTool(definition.name)) {
        continue;
      }
      // With a strategy the server serves the tool that reads each long
      // tool's runs (`withBackgroundRunTools`), so a long tool is listed in
      // the call exactly when there is none.
      const listed = listedPromptTool(
        isLongTool(definition.name) && !options.backgroundRuns
          ? longToolInTheCall(definition)
          : definition,
        kind,
        stateHandle,
      );
      if (listed !== undefined) tools.push(listed);
    }
  }
  return promptSourceOf(kind, stateHandle, tools);
}
