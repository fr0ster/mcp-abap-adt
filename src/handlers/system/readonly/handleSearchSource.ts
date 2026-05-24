import * as z from 'zod';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type OrchestratorInput,
  runSearchSourceWithContext,
} from '../../../lib/search-source/orchestrator';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'SearchSource',
  available_in: ['onprem', 'legacy'] as const,
  description:
    '[read-only] Search ABAP source text inside one or more packages (programs, function groups, classes). Onprem-only (cloud lacks an indexed source-search endpoint). `packages` accepts `*` masks (Z*, ZFI_*, /NS/Z*) alongside exact names; mask resolution is best-effort and scoped to the ADT repository-search result window — there is no guarantee that every matching package is scanned. If you need certainty, pass concrete package names. When using masks, narrow the mask itself and use `object_types`, `object_filter`, and `max_objects` as scan-target controls that apply after package resolution. Comments are searched by default; set exclude_comments=true to drop col-1 `*` and full-line `"` comments. The `version` parameter affects PROG and CLAS main include reads only — FUGR subinclude reads always go against the active version (the include endpoint exposes no version selector). `truncated.by_object_cap` means at least one object had MORE hits than `max_hits_per_object`, so that object\'s hits were capped — it is NOT a limit on the number of objects scanned. The object-count limit is `max_objects` (which sets `truncated.by_max_objects`). To avoid `by_object_cap`, raise `max_hits_per_object`. `concurrency` is capped at 16 per call. Run only ONE SearchSource per destination at a time — multiple parallel SearchSource calls against the same SAP system saturate the scan backend and can make all of them time out. Prefer combining terms into a single call over parallel calls.',
  inputSchema: {
    query: z
      .string()
      .min(1)
      .describe('Primary substring to match (case-insensitive, ABAP CS).'),
    query2: z
      .string()
      .optional()
      .describe(
        'Optional second substring. When set, both query and query2 must appear on the same line.',
      ),
    exclude: z
      .array(z.string())
      .max(3)
      .optional()
      .describe(
        'Up to 3 substrings; a line containing any of them is dropped.',
      ),
    packages: z
      .array(z.string().min(1))
      .min(1)
      .describe(
        'Packages to scan. Each entry is either an exact dev-class name or a `*` mask (* = any chars). Examples: "ZFI_OBSOLETE", "Z*", "ZFI_*", "/NS/Z*".',
      ),
    include_subpackages: z
      .boolean()
      .optional()
      .describe('Recurse into subpackages (default true).'),
    object_filter: z
      .string()
      .optional()
      .describe(
        'Glob applied to object names within each package (e.g. "Z*").',
      ),
    object_types: z
      .array(z.enum(['PROG', 'FUGR', 'CLAS']))
      .optional()
      .describe('Subset of object families to scan (default: all three).'),
    exclude_comments: z
      .boolean()
      .optional()
      .describe(
        "Skip col-1 '*' and full-line '\"' comment lines. Default false (comments are scanned).",
      ),
    max_hits_per_object: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Cap hits per root object across its source units (default 100). When exceeded, truncated.by_object_cap=true is set. Raise this value if you need more hits per object.',
      ),
    emit_no_hits: z
      .boolean()
      .optional()
      .describe(
        'When true, list zero-hit targets in a separate no_hits array. Default false.',
      ),
    max_objects: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Cap the total objects scanned across all packages (default 500). Setting truncated.by_max_objects=true when exceeded.',
      ),
    concurrency: z
      .number()
      .int()
      .min(1)
      .max(16)
      .optional()
      .describe('Parallel source fetches (default 8, max 16).'),
    version: z
      .enum(['active', 'inactive'])
      .optional()
      .describe(
        'Source version for PROG and CLAS main include reads. Default active. FUGR subincludes always read the active version.',
      ),
    time_budget_ms: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Internal scan deadline in ms. When exceeded, returns hits gathered so far with truncated.by_timeout=true. Set this BELOW your client/transport timeout (e.g. 540000 for a 600s client) so you get a partial result instead of a hard cutoff.',
      ),
  },
} as const;

type SearchSourceArgs = OrchestratorInput;

export async function handleSearchSource(
  context: HandlerContext,
  args: SearchSourceArgs,
) {
  const { logger } = context;
  try {
    const result = await runSearchSourceWithContext(context, args);
    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger?.error(
      `SearchSource failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return return_error(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
