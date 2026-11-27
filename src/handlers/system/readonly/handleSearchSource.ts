import * as z from 'zod';
import type { McpResult } from '../../../lib/answer';
import { readsInFlight } from '../../../lib/connectionKind';
import {
  longRunning,
  purpose,
  toolDescription,
} from '../../../lib/description';
import {
  type AnswerTable,
  about,
  answerAt,
  type Column,
  type DetailLevel,
  headShape,
  jsonText,
  type ListAnswerTable,
  listAnswerAt,
  marks,
  type RowSchemas,
  rows,
  type Written,
  wireAnswer,
  writeListing,
  writeWhole,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
import {
  ANSWER_LEVELS,
  type AnswerLevel,
} from '../../../lib/search-source/answerLevel';
import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import {
  type OrchestratorResult,
  runSearchSourceWithContext,
} from '../../../lib/search-source/orchestrator';
import {
  type IncompleteTarget,
  type NotLoadedNode,
  SCAN_OBJECT_TYPES,
} from '../../../lib/search-source/packageEnumerator';
import {
  skipSapAnswers,
  undecided,
} from '../../../lib/search-source/readFailure';
import {
  ASSEMBLED_DETAIL_SHAPE,
  levelOf,
} from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';

/** One hit of a scan. */
type Hit = OrchestratorResult['results'][number];

/** The answer level a scan was read at, by its first hit's shape (`lines` when none). */
function answerLevelOf(first: Hit | undefined): AnswerLevel {
  if (first === undefined) return 'lines';
  if ('snippet' in first) return 'snippets';
  return 'line' in first ? 'lines' : 'objects';
}

const includeCell: Column<Hit> = {
  name: 'include',
  means: 'its include',
  cell: includeColumn,
};
const lineCell: Column<Hit> = {
  name: 'line',
  means: 'its position in the source',
  cell: (hit) => ('line' in hit ? String(hit.line) : ''),
};

/** The lists of one scan, by its answer level: what its description states. */
function searchSourceLists(
  noun: string,
  columns: Column<Hit>[],
): RowSchemas<OrchestratorResult> {
  return {
    not_loaded: about(
      'the package parts SAP left unloaded are named, each by its package and type',
      marks('not_loaded', 'not loaded by SAP', (node: NotLoadedNode) => [
        node.package,
        node.type,
      ]),
    ),
    // A target SAP listed without a name: never scanned, named by what
    // tells it apart.
    incomplete: about(
      'the nameless objects SAP lists, left unsearched, are named by what tells them apart',
      marks('incomplete', 'incomplete', incompleteWords),
    ),
    results: about(
      noun,
      rows('results', {
        columns,
        header: 'always',
        groups: [
          {
            label: 'object',
            of: (hit: Hit) =>
              `${hit.devclass} ${hit.object_type} ${hit.object_name}`,
            mode: 'gathered',
          },
        ],
      }),
    ),
  };
}

/** Each match's object, as the group above its matches names it. */
const MATCH_NOUN =
  'for each match, under its object named by package, type and name';

/**
 * The lists of a scan at each answer level: `include\tline`,
 * `include\tline\tsnippet`, or `include\thits`.
 */
export const SEARCH_SOURCE_LISTS: Readonly<
  Record<AnswerLevel, RowSchemas<OrchestratorResult>>
> = {
  lines: searchSourceLists(MATCH_NOUN, [includeCell, lineCell]),
  snippets: searchSourceLists(MATCH_NOUN, [
    includeCell,
    lineCell,
    {
      name: 'snippet',
      means: 'the source code that matched, when snippets are asked',
      cell: (hit) => ('snippet' in hit ? hit.snippet : ''),
    },
  ]),
  objects: searchSourceLists(
    'with objects asked, for each object it matched in, named by package, type and name',
    [
      includeCell,
      {
        name: 'hits',
        means: 'how many matches it has',
        cell: (hit) => ('hits' in hit ? String(hit.hits) : ''),
      },
    ],
  ),
};

/** The heads every scan's listing opens with. */
export const SEARCH_SOURCE_HEADS = [
  headShape(
    'scanned',
    'how many objects and sources were searched, and how many objects matched',
  ),
  headShape('truncated', 'which limit stopped the search, when one did'),
];

export const TOOL_DEFINITION = {
  name: 'SearchSource',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Searches the ABAP source code of one or more packages for a text: programs, includes, function groups, classes, interfaces and CDS sources.',
    ),
    notes: [longRunning],
  }),
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
      .optional()
      .describe(
        'Substrings; a line containing any of them is dropped. Absent, no line is dropped.',
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
        'The most hits of the whole answer, counted in the scan order after max_hits_per_object; reached, the scan stops reading the next objects and truncated.by_max_hits is true when anything was left. Absent, no limit: every object is read and every hit answered.',
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
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type SearchSourceArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

// Over RFC the sequential version (a destination with no communication batch)
// runs one fetch at a time (`readsInFlight`, where the measurement is told);
// over HTTP its default, 8 at once.

/** `args` with `concurrency` set only where the connection bounds it. */
function withReadsInFlight<A extends object>(
  args: A,
  inFlight: number | undefined,
): A & { concurrency?: number } {
  return inFlight === undefined ? args : { ...args, concurrency: inFlight };
}

/**
 * What each hit is read as, selected before the scan: the `answer` given, or
 * — none given — `lines` at terse (the snippets at `answer: snippets` or at
 * medium and full) and `snippets` at the other levels, as before `detail`.
 */
export function searchSourceAnswerLevel(
  level: DetailLevel,
  answer: AnswerLevel | undefined,
): AnswerLevel {
  return answerAt(HIT_READINGS, level)(answer);
}

/** Each level's default for what a hit is read as, the `answer` given kept. */
const HIT_READINGS: AnswerTable<AnswerLevel | undefined, AnswerLevel> = {
  terse: (answer) => answer ?? 'lines',
  medium: (answer) => answer ?? 'snippets',
  full: (answer) => answer ?? 'snippets',
  raw: (answer) => answer ?? 'snippets',
};

/** The include column of a hit: the class include, or a module's or include's group. */
function includeColumn(hit: OrchestratorResult['results'][number]): string {
  return 'include' in hit ? hit.include : hit.function_group_name;
}

/**
 * The scan as TSV (terse): `# scanned` and `# truncated` counter lines, a
 * `# not loaded by SAP<TAB>PACKAGE<TAB>TYPE` line per node the walk could not read,
 * then the hits under `# object PACKAGE TYPE NAME` group lines — at lines
 * `include\tline`, at snippets `include\tline\tsnippet`, at objects
 * `include\thits`. Every hit is answered.
 */
export function searchSourceRows(result: OrchestratorResult): Written<string> {
  return writeListing({
    heads: [
      {
        head: 'scanned',
        value: `objects ${result.scanned.objects} sources ${result.scanned.sources} objects_with_hits ${result.scanned.objects_with_hits}`,
      },
      ...(result.truncated.by_object_cap
        ? [{ head: 'truncated', value: 'by_object_cap' }]
        : []),
      ...(result.truncated.by_max_hits === true
        ? [{ head: 'truncated', value: 'by_max_hits' }]
        : []),
    ],
    reading: result,
    lists: SEARCH_SOURCE_LISTS[answerLevelOf(result.results[0])],
  });
}

/** A target SAP listed without a name: the words of its line. */
function incompleteWords(target: IncompleteTarget): string[] {
  return [
    target.package,
    target.type,
    ...(target.tech_name !== undefined
      ? [`tech_name=${target.tech_name}`]
      : []),
    ...(target.uri !== undefined ? [`uri=${target.uri}`] : []),
  ];
}

/**
 * What SearchSource answers at each `detail`, selected before the scan
 * (`src/lib/detail`): terse {@link searchSourceRows}; medium and full the
 * answer before `detail`. A scan reads many documents, so
 * raw never reaches this table: the handler answers it as the wire documents (`wireAnswer`).
 */
const SEARCH_SOURCE_ANSWERS: ListAnswerTable<OrchestratorResult, string> = {
  terse: searchSourceRows,
  // The scan whole, as it is — typed as the reading itself, so no
  // projection of it passes for it.
  medium: (result) => jsonText(writeWhole<OrchestratorResult>(result)),
  full: (result) => JSON.stringify(result),
  raw: (result) => JSON.stringify(result),
};

/**
 * The tool's answer; at `raw` what ADT sent — the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleSearchSource(
  context: HandlerContext,
  args: SearchSourceArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'SearchSource',
        shape: 'assembled',
      },
      () => answeredSearchSource(context, { ...args, detail: 'full' }),
    );
  }
  return answeredSearchSource(context, args);
}

async function answeredSearchSource(
  context: HandlerContext,
  args: SearchSourceArgs,
): Promise<McpResult> {
  const { logger } = context;
  const level = levelOf(args);
  const shown = listAnswerAt(SEARCH_SOURCE_ANSWERS, levelOf(args));
  const asked = {
    ...args,
    answer: searchSourceAnswerLevel(level, args.answer),
  };
  try {
    const result = await runSearchSourceWithContext(
      context,
      withReadsInFlight(asked, readsInFlight(context.connection, undefined)),
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
