import * as z from 'zod';
import { isRfcConnection } from '../../../lib/connectionKind';
import {
  type AnswerTable,
  answerAt,
  type DetailLevel,
  groupedTsv,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import {
  ANSWER_LEVELS,
  type AnswerLevel,
} from '../../../lib/search-source/answerLevel';
import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import {
  type OrchestratorInput,
  type OrchestratorResult,
  runSearchSourceWithContext,
} from '../../../lib/search-source/orchestrator';
import { SCAN_OBJECT_TYPES } from '../../../lib/search-source/packageEnumerator';
import {
  skipSapAnswers,
  undecided,
} from '../../../lib/search-source/readFailure';
import { DETAIL_SHAPE, levelOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'SearchSource',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Search ABAP source text inside one or more packages: programs, program includes, function groups (function modules and includes), classes (main source and the four local includes), interfaces, CDS data definitions, behavior definitions, metadata extensions and service definitions. Each source is read at the call\'s `version` (default active). `packages` takes exact package names and masks (Z*, /NS/Z?); in a mask `*` (zero or more characters) and `?` (one character) are the wildcards, and `+`, `_`, `%` and `#` are characters of the name; a mask is resolved by the repository quick search to every package it matches. `object_types` and `object_filter` select the scan targets of the resolved packages (`PROG` selects programs and program includes, `FUGR` function groups with their modules and includes); every target is read in one run, unless `max_hits` is reached. A line matches when it contains `query` (and `query2`, when given), case-insensitively, and a line containing an `exclude` entry is dropped; `exclude_comments` skips col-1 `*` and full-line `"` comment lines. `max_hits_per_object` limits the hits of each object only when given; each module and each include of a function group is an object of its own, and a program include is one object however many function groups list it (its hits answered and counted once, from the first listing in the scan order). `max_hits` limits the hits of the whole answer, counted in the scan order after `max_hits_per_object`: reached, the scan stops reading, and `truncated.by_max_hits` is true when anything was left. `answer` sets what each hit is answered as: `lines` with the line only (the default at detail terse), `snippets` with line and snippet (the default at medium and full), `objects` one entry per object and include with its number of hits. The answer lists each hit (`results`: package, object type, object name, include, line, snippet). The `object_type` of a hit names its kind of source: `PROG` a program, `PROG/I` a program include (`object_name` the include name), `CLAS` a class with `include` the class name for its main source or `definitions`, `implementations`, `macros`, `testclasses` for its local includes, `INTF`, `DDLS`, `BDEF`, `DDLX` and `SRVD` the object source; a hit in a function module is `FUGR/FF` (`object_name` the module) and a hit in an include addressed under its function group is `FUGR/I` (`object_name` the include), each with `function_group_name`, the group, in place of `include`; an include a function group lists among the program includes is `PROG/I`; `scanned.objects` counts the objects read, `scanned.sources` the sources read (each once) and `scanned.objects_with_hits` the objects with a hit; `truncated.by_object_cap` is true when an object had more hits than `max_hits_per_object`. At a stop the counters report what was done until it; where the reads go in batches, `scanned.sources` counts the sources of the last batch read, those read past the stop included. A source, an object or a package SAP refuses is skipped, and a type node or subpackage SAP refuses is skipped with everything under it; a read that fails before SAP answers ends the call as an error. Sources are read in ADT batch envelopes where the system offers them, each source once per call.',
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
        'What each hit is answered as: lines (line, no snippet; the default at detail terse), snippets (line and snippet; the default at medium and full) or objects (one entry per object and include with its number of hits).',
      ),
    version: z
      .enum(['active', 'inactive', 'workingArea'])
      .optional()
      .describe('The version every source is read at. Default active.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type SearchSourceArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

// Over RFC the sequential version (a destination with no communication batch)
// runs one fetch at a time. An RFC connection is one ABAP session, and one
// session answers one call at a time. Fetched in parallel (the sequential
// version's default is 8 at once), sources were lost without an error: on
// premise (2026-09-26) a scan of the shared package read 4 of its 13 sources
// and found nothing, where one at a time read all 13 and found both hits, as
// HTTP does.

/**
 * What each hit is read as, selected before the scan: the `answer` given, or
 * — none given — `lines` at terse (the snippets at `answer: snippets` or at
 * medium and full) and `snippets` at the other levels, as before `detail`.
 */
export function searchSourceAnswerLevel(
  level: DetailLevel,
  answer: AnswerLevel | undefined,
): AnswerLevel {
  return answer ?? (level === 'terse' ? 'lines' : 'snippets');
}

/** The include column of a hit: the class include, or a module's or include's group. */
function includeColumn(hit: OrchestratorResult['results'][number]): string {
  return 'include' in hit ? hit.include : hit.function_group_name;
}

/**
 * The scan as TSV (terse): `# scanned` and `# truncated` counter lines, a
 * `# not loaded by SAP PACKAGE TYPE` line per node the walk could not read,
 * then the hits under `# object PACKAGE TYPE NAME` group lines — at lines
 * `include\tline`, at snippets `include\tline\tsnippet`, at objects
 * `include\thits`. Every hit is answered.
 */
export function searchSourceRows(result: OrchestratorResult): string {
  const head = [
    `# scanned objects ${result.scanned.objects} sources ${result.scanned.sources} objects_with_hits ${result.scanned.objects_with_hits}`,
    ...(result.truncated.by_object_cap ? ['# truncated by_object_cap'] : []),
    ...(result.truncated.by_max_hits === true
      ? ['# truncated by_max_hits']
      : []),
    ...(result.not_loaded ?? []).map(
      (node) => `# not loaded by SAP ${node.package} ${node.type}`,
    ),
  ];
  const first = result.results[0];
  const columns =
    first === undefined || 'line' in first
      ? first !== undefined && 'snippet' in first
        ? ['include', 'line', 'snippet']
        : ['include', 'line']
      : ['include', 'hits'];
  const groups = new Map<string, string[][]>();
  for (const hit of result.results) {
    const key = `${hit.devclass} ${hit.object_type} ${hit.object_name}`;
    const rows = groups.get(key) ?? [];
    rows.push(
      'hits' in hit
        ? [includeColumn(hit), String(hit.hits)]
        : 'snippet' in hit
          ? [includeColumn(hit), String(hit.line), hit.snippet]
          : [includeColumn(hit), String(hit.line)],
    );
    groups.set(key, rows);
  }
  return [
    ...head,
    groupedTsv(
      columns,
      [...groups].map(([value, rows]) => ({ field: 'object', value, rows })),
    ),
  ].join('\n');
}

/**
 * What SearchSource answers at each `detail`, selected before the scan
 * (`src/lib/detail`): terse {@link searchSourceRows}; medium and full the
 * answer before `detail`. A scan reads many documents and answers none whole,
 * so raw is the full answer.
 */
const SEARCH_SOURCE_ANSWERS: AnswerTable<OrchestratorResult, string> = {
  terse: searchSourceRows,
  medium: (result) => JSON.stringify(result),
  full: (result) => JSON.stringify(result),
  raw: (result) => JSON.stringify(result),
};

export async function handleSearchSource(
  context: HandlerContext,
  args: SearchSourceArgs,
) {
  const { logger } = context;
  const level = levelOf(args);
  const shown = answerAt(SEARCH_SOURCE_ANSWERS, levelOf(args));
  const asked = {
    ...args,
    answer: searchSourceAnswerLevel(level, args.answer),
  };
  try {
    const result = await runSearchSourceWithContext(
      context,
      isRfcConnection(context.connection)
        ? { ...asked, concurrency: 1 }
        : asked,
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
          text: shown(result),
        },
      ],
    };
  } catch (thrown) {
    // A decided primitive comes out of its carrier as it was thrown.
    const error = undecided(thrown);
    logger?.error(
      `SearchSource failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    // The value as it was thrown: `return_error` reads any value.
    return return_error(error);
  }
}
