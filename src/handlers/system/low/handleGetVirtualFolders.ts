/**
 * GetVirtualFolders Handler - Low-level handler for virtual folders
 *
 * Uses AdtClient.getUtils().getVirtualFoldersContents from
 * @mcp-abap-adt/adt-clients 19. `getVirtualFoldersContents(params)` takes no
 * `options` at all — no `analyse` — so there is nothing to inject beyond the
 * result set.
 *
 * `folders` is one of the 300-odd slots `resultSets.ts` maps to `structured`
 * (unlike `node`, which `ourUtils` overrides with the tree-flattening
 * `nodeLevel` reading), so this answers an `AdtReading` the same shape every
 * write handler in this cluster does — `detail: 'raw'` and `'full'` both
 * work. No corpus fixture for this endpoint exists yet (the README's
 * endpoint table has no `/virtualfolders/contents` row at all), so `terse`
 * here answers the same whole parse `full` does rather than picking fields
 * nobody has measured — inventing a compact shape without a captured
 * document would be exactly the mistake the corpus exists to prevent.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { ourUtils } from '../../../lib/strategies/resultSets';

export const TOOL_DEFINITION = {
  name: 'GetVirtualFoldersLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Retrieve hierarchical virtual folder contents from ADT information system. Used for browsing ABAP objects by package, group, type, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      object_search_pattern: {
        type: 'string',
        description:
          'Object search pattern (e.g., "*", "Z*", "ZCL_*"). Default: "*"',
        default: '*',
      },
      preselection: {
        type: 'array',
        description:
          'Optional preselection filters (facet-value pairs for filtering)',
        items: {
          type: 'object',
          properties: {
            facet: {
              type: 'string',
              description: 'Facet name (e.g., "package", "group", "type")',
            },
            values: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of facet values to filter by',
            },
          },
          required: ['facet', 'values'],
        },
      },
      facet_order: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Order of facets in response (e.g., ["package", "group", "type"]). Default: ["package", "group", "type"]',
        default: ['package', 'group', 'type'],
      },
      with_versions: {
        type: 'boolean',
        description: 'Include version information in response',
        default: false,
      },
      ignore_short_descriptions: {
        type: 'boolean',
        description: 'Ignore short descriptions in response',
        default: false,
      },
      ...DETAIL_PROPERTY,
    },
    required: [],
  },
} as const;

interface GetVirtualFoldersArgs {
  object_search_pattern?: string;
  preselection?: Array<{ facet: string; values: string[] }>;
  facet_order?: string[];
  with_versions?: boolean;
  ignore_short_descriptions?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetVirtualFolders(
  context: HandlerContext,
  args: GetVirtualFoldersArgs,
) {
  const { connection, logger } = context;
  const detail = detailOf(args);

  return answer(
    { tool: 'GetVirtualFoldersLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .getVirtualFoldersContents({
          objectSearchPattern: args.object_search_pattern || '*',
          preselection: args.preselection,
          facetOrder: args.facet_order || ['package', 'group', 'type'],
          withVersions: args.with_versions,
          ignoreShortDescriptions: args.ignore_short_descriptions,
        }),
    project(detail, (value) => value),
  );
}
