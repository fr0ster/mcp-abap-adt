import * as z from 'zod';
import { isRfcConnection } from '../../../lib/connectionKind';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import {
  type OrchestratorInput,
  runSearchSourceWithContext,
} from '../../../lib/search-source/orchestrator';
import { SCAN_OBJECT_TYPES } from '../../../lib/search-source/packageEnumerator';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'SearchSource',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    "[read-only] Search ABAP source text inside one or more packages: programs, program includes, function groups (function modules and includes), classes (main source and the four local includes), interfaces, CDS data definitions, behavior definitions, metadata extensions and service definitions. Each source is read at the call's `version` (default active). `packages` takes exact package names and `*` masks (Z*, /NS/Z*); a mask is resolved by one repository quick search of up to 1000 packages. `object_types`, `object_filter`, `start_at` and `max_objects` select the scan targets of the resolved packages, in order of package, type and name. A line matches when it contains `query` (and `query2`, when given), case-insensitively, and a line containing an `exclude` entry is dropped; `exclude_comments` skips col-1 `*` and full-line `\"` comment lines. The answer lists each hit (`results`: package, object type, object name, include, line, snippet), `scanned` (packages, objects, sources), `total_targets`, `truncated.by_object_cap` (an object had more hits than `max_hits_per_object`), `truncated.by_max_objects` and `next_start_at` (the `start_at` of the next page, present while targets remain), and `failures` when anything was left unread: `kind` `source` names the object, the source (name and URI), the read and SAP's T100 key; `kind` `operation` names the step (a package mask's resolution, a package's walk), the mask or the package, and SAP's T100 key. Sources are read in ADT batch envelopes where the system offers them, each source once per call.",
  ),
  inputSchema: z.object({
    background: LONG_BACKGROUND_FIELD,
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
        'Packages to scan. Each entry is either an exact dev-class name or a `*` mask, where `*` stands for any characters and a namespace prefix may lead it.',
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
      .array(z.enum(SCAN_OBJECT_TYPES))
      .optional()
      .describe(
        'Object types to scan, by main type: PROG (programs and program includes), FUGR, CLAS, INTF, DDLS, BDEF, DDLX, SRVD. Default: all of them.',
      ),
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
    start_at: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Index of the first scan target to read, from `next_start_at` of the previous answer; 0 by default.',
      ),
    version: z
      .enum(['active', 'inactive', 'workingArea'])
      .optional()
      .describe('The version every source is read at. Default active.'),
  }),
} as const;

type SearchSourceArgs = Omit<OrchestratorInput, 'concurrency'>;

// Over RFC the sequential version (a destination with no communication batch)
// runs one fetch at a time. An RFC connection is one ABAP session, and one
// session answers one call at a time. Fetched in parallel (the sequential
// version's default is 8 at once), sources were lost without an error: on
// premise (2026-09-26) a scan of the shared package read 4 of its 13 sources
// and found nothing, where one at a time read all 13 and found both hits, as
// HTTP does.

export async function handleSearchSource(
  context: HandlerContext,
  args: SearchSourceArgs,
) {
  const { logger } = context;
  try {
    const result = await runSearchSourceWithContext(
      context,
      isRfcConnection(context.connection) ? { ...args, concurrency: 1 } : args,
      substringLineMatch,
    );
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
