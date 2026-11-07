import * as z from 'zod';
import { isRfcConnection } from '../../../lib/connectionKind';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import { ANSWER_LEVELS } from '../../../lib/search-source/answerLevel';
import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import {
  type OrchestratorInput,
  runSearchSourceWithContext,
} from '../../../lib/search-source/orchestrator';
import { SCAN_OBJECT_TYPES } from '../../../lib/search-source/packageEnumerator';
import {
  skipSapAnswers,
  undecided,
} from '../../../lib/search-source/readFailure';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'SearchSource',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Search ABAP source text inside one or more packages: programs, program includes, function groups (function modules and includes), classes (main source and the four local includes), interfaces, CDS data definitions, behavior definitions, metadata extensions and service definitions. Each source is read at the call\'s `version` (default active). `packages` takes exact package names and masks (Z*, /NS/Z?); in a mask `*` (zero or more characters) and `?` (one character) are the wildcards, and `+`, `_`, `%` and `#` are characters of the name; a mask is resolved by the repository quick search to every package it matches. `object_types` and `object_filter` select the scan targets of the resolved packages; every target is read in one run, unless `max_hits` is reached. A line matches when it contains `query` (and `query2`, when given), case-insensitively, and a line containing an `exclude` entry is dropped; `exclude_comments` skips col-1 `*` and full-line `"` comment lines. `max_hits_per_object` limits the hits of each object only when given; a function group and each of its modules are separate objects. `max_hits` limits the hits of the whole answer, counted in the scan order after `max_hits_per_object`: reached, the scan stops reading, and `truncated.by_max_hits` is true when anything was left. `answer` sets what each hit is answered as: `snippets` (the default) with line and snippet, `lines` with the line only, `objects` one entry per object and include with its number of hits. The answer lists each hit (`results`: package, object type, object name, include, line, snippet); a hit in a function module names the module: `object_type` `FUGR/FF`, its name and `function_group_name`, the group, and a hit in an include of the group stays a hit of the group; `scanned.packages` counts the packages walked, `scanned.objects` the objects read, `scanned.sources` the sources read (each once) and `scanned.objects_with_hits` the objects with a hit; `truncated.by_object_cap` is true when an object had more hits than `max_hits_per_object`. At a stop the counters report what was done until it; where the reads go in batches, `scanned.sources` counts the sources of the last batch read, those read past the stop included. A source, an object or a package SAP refuses is skipped, and a type node or subpackage SAP refuses is skipped with everything under it; a read that fails before SAP answers ends the call as an error. Sources are read in ADT batch envelopes where the system offers them, each source once per call.',
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
        'Packages to scan. Each entry is an exact package name or a mask: `*` stands for zero or more characters, `?` for one character, and a namespace prefix may lead it; `+`, `_`, `%` and `#` are characters of the name.',
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
        'The most hits answered per object, across its sources; absent, no limit. When an object has more, truncated.by_object_cap is true.',
      ),
    max_hits: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'The most hits of the whole answer, counted in the scan order after max_hits_per_object; reached, the scan stops reading and truncated.by_max_hits is true when anything was left. Absent, no limit.',
      ),
    answer: z
      .enum(ANSWER_LEVELS)
      .optional()
      .describe(
        'What each hit is answered as: snippets (the default: line and snippet), lines (line, no snippet) or objects (one entry per object and include with its number of hits).',
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
      // The server's strategies, set from its options; absent, the shipped
      // ones — the one place their default lives (DO24).
      {
        lineMatch: context.lineMatchStrategy ?? substringLineMatch,
        sapAnswers: context.sapAnswerStrategy ?? skipSapAnswers,
      },
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
  } catch (thrown) {
    // A decided primitive comes out of its carrier as it was thrown.
    const error = undecided(thrown);
    logger?.error(
      `SearchSource failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return return_error(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
