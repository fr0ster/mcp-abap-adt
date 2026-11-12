/**
 * What a tool is listed with on a stated variant: the one rule both
 * registration paths apply — a server instance (`BaseMcpServer`, the
 * variant its `systemType` option or `SAP_SYSTEM_TYPE` states) and a plain
 * registration of handler groups on an SDK `McpServer` (the variant the
 * groups' context states, never the environment).
 *
 * On a stated variant a tool is listed only when the variant's ADT type
 * table serves it (`servedDefinition`) and its `available_in` admits the
 * environment; it is listed with that variant's description and schema, and
 * its search `_meta` names only the members the variant offers. With no
 * variant stated nothing is filtered: the definition as it is, its search
 * `_meta` naming every member.
 */
import type { SapEnvironment, ToolDefinition } from './handlers/interfaces.js';
import { TOOL_SEARCH_META_KEY, toolSearchText } from './toolSearch/index.js';
import { servedDefinition, variantOfEnvironment } from './variantToolSet.js';

/**
 * The SAP environment a stated system type names (`onprem`, `cloud`,
 * `legacy`, any case); `undefined` for none or any other value — never a
 * default.
 */
export function statedEnvironment(
  value: string | undefined,
): SapEnvironment | undefined {
  const declared = value?.trim().toLowerCase();
  return declared === 'onprem' || declared === 'cloud' || declared === 'legacy'
    ? declared
    : undefined;
}

/**
 * The `_meta` a tool is listed with: its search texts under
 * `mcp-abap-adt/search` (`tools/tool-search.json`), for a consumer's tool
 * search — with `offered`, naming only the members its variant offers;
 * none for a tool the table does not name.
 */
export function searchMeta(
  name: string,
  offered?: readonly string[],
): { _meta?: Record<string, unknown> } {
  const text = toolSearchText(name, offered);
  if (text === undefined) return {};
  return {
    _meta: {
      [TOOL_SEARCH_META_KEY]: {
        keywords: [...text.keywords],
        semantic: text.semantic,
      },
    },
  };
}

/** How a tool is listed on a variant, or why it is not. */
export type ListedTool =
  | {
      readonly listed: true;
      readonly description: string;
      readonly inputSchema: ToolDefinition['inputSchema'];
      /** Its search `_meta`, spread into the registration's config. */
      readonly search: { _meta?: Record<string, unknown> };
    }
  | {
      readonly listed: false;
      /**
       * `not-served`: the variant's ADT type table serves no operation it
       * needs; `not-available`: its `available_in` leaves the environment
       * out.
       */
      readonly reason: 'not-served' | 'not-available';
    };

/** How `definition` is listed where `environment` is stated (or none). */
export function listedTool(
  definition: ToolDefinition,
  environment: SapEnvironment | undefined,
): ListedTool {
  if (environment === undefined) {
    return {
      listed: true,
      description: definition.description,
      inputSchema: definition.inputSchema,
      search: searchMeta(definition.name, definition.members),
    };
  }
  const variant = variantOfEnvironment(environment);
  const served = servedDefinition(definition, variant);
  if (served === undefined) return { listed: false, reason: 'not-served' };
  const availableIn = definition.available_in;
  if (
    availableIn !== undefined &&
    availableIn.length > 0 &&
    !availableIn.includes(environment)
  ) {
    return { listed: false, reason: 'not-available' };
  }
  return {
    listed: true,
    description: served.description,
    inputSchema: served.inputSchema,
    search: searchMeta(definition.name, definition.variants?.[variant].members),
  };
}
