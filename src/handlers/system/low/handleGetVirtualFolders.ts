import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * GetVirtualFolders Handler - Low-level handler for virtual folders
 *
 * Uses AdtClient.getUtils().getVirtualFoldersContents from
 * @mcp-abap-adt/adt-clients 19. `getVirtualFoldersContents(params, options?)`
 * takes `analyseException` since adt-clients 23.
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

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { ourUtils } from '../../../lib/strategies/resultSets';

export const TOOL_DEFINITION = {
  name: 'GetVirtualFoldersLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Retrieve hierarchical virtual folder contents from ADT information system. Used for browsing ABAP objects by package, group, type, etc.',
  inputSchema: z.object({
    object_search_pattern: z
      .string()
      .default('*')
      .optional()
      .describe(
        'Object search pattern: "*" matches any name, and a trailing "*" matches a prefix. Default: "*"',
      ),
    preselection: z
      .array(
        z.object({
          facet: z
            .string()
            .describe('Facet name (e.g., "package", "group", "type")'),
          values: z
            .array(z.string())
            .describe('Array of facet values to filter by'),
        }),
      )
      .optional()
      .describe(
        'Optional preselection filters (facet-value pairs for filtering)',
      ),
    facet_order: z
      .array(z.string())
      .default(['package', 'group', 'type'])
      .optional()
      .describe(
        'Order of facets in response (e.g., ["package", "group", "type"]). Default: ["package", "group", "type"]',
      ),
    with_versions: z
      .boolean()
      .default(false)
      .optional()
      .describe('Include version information in response'),
    ignore_short_descriptions: z
      .boolean()
      .default(false)
      .optional()
      .describe('Ignore short descriptions in response'),
    ...DETAIL_SHAPE,
  }),
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
      withAdtHeaders(context, 'utils.getVirtualFoldersContents', (headers) =>
        createAdtClient(connection, logger)
          .getUtils(ourUtils)
          .getVirtualFoldersContents(
            {
              objectSearchPattern: args.object_search_pattern || '*',
              preselection: args.preselection,
              facetOrder: args.facet_order || ['package', 'group', 'type'],
              withVersions: args.with_versions,
              ignoreShortDescriptions: args.ignore_short_descriptions,
            },
            { headers, analyse: analyseException },
          ),
      ),
    project(detail, (value) => value),
  );
}
