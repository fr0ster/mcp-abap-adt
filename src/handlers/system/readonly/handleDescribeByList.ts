import type { ISearchResult } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { appendAll } from '../../../lib/appendAll';
import {
  longRunning,
  purpose,
  toolDescription,
} from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
import { ASSEMBLED_DETAIL_SHAPE } from '../../../lib/strategies/detail';

// DescribeByList: Batch description for a list of ABAP objects

import {
  type FailureEntry,
  failedPayloadOf,
  isCredentialPayload,
  type McpResult,
} from '../../../lib/answer';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import {
  type AnswerTable,
  about,
  answerAt,
  asContentResult,
  asTextResult,
  type Column,
  entries,
  kinds,
  type ListAnswerTable,
  listAnswerAt,
  type RowSchemas,
  wireAnswer,
  writeJsonList,
  writeListing,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AnswerValue,
  isAnswerList,
  isAnswerObject,
  type JsonValue,
  parseJson,
} from '../../../lib/json';
import { levelOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import {
  SEARCH_HIT_COLUMNS,
  type SearchedObjects,
  searchObjects,
} from '../../search/readonly/handleSearchObject';

/** DescribeByList's arguments, as its schema parses them. */
type DescribeArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** One object of the list. */
type DescribedObject = DescribeArgs['objects'][number];

/** One entry of the answer's content. */
type ContentEntry = McpResult['content'][number];

/** The text of a failed answer that is not a JSON payload, as it is. */
function textOf(result: McpResult): string {
  const first = result.content[0]?.text;
  return typeof first === 'string' ? first : '';
}

/** A search answer the sequential version searches again without the type. */
/** What a child search is asked at, per level: terse its hit rows, else the whole parse. */
type ChildSearchLevel = 'terse' | 'full';

const CHILD_SEARCH_LEVELS: AnswerTable<undefined, ChildSearchLevel> = {
  terse: () => 'terse',
  medium: () => 'full',
  full: () => 'full',
  raw: () => 'full',
};

/** Whether a JSON value holds an `adtcore:objectReference` (a search's parse with a hit). */
function holdsReference(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(holdsReference);
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, member]) =>
      key === 'adtcore:objectReference' || holdsReference(member),
  );
}

/**
 * Whether a search answered a hit: at terse a hit row under its header, at
 * full a parse holding an object reference.
 */
function holdsHits(res: McpResult): boolean {
  return res.content.some((item) => {
    const json = parseJson(item.text);
    return json !== undefined && typeof json === 'object' && json !== null
      ? holdsReference(json)
      : item.text
          .split('\n')
          .slice(1)
          .some((row) => row !== '');
  });
}

function emptyOrFailed(res: McpResult | undefined): boolean {
  return res === undefined || res.isError === true || res.content.length === 0;
}

/**
 * A search answer SAP refused `406`: that search's error, never an empty
 * answer.
 */
function notAcceptable(res: McpResult | undefined): FailureEntry | undefined {
  const failure = failedPayloadOf(res, 'search');
  return failure?.status === 406 ? failure : undefined;
}

/** A search answer that is a credential failure: it ends the call. */
function endsDescribe(res: McpResult): boolean {
  const failure = failedPayloadOf(res, 'search');
  return failure !== undefined && isCredentialPayload(failure);
}

/**
 * What one object's answers come to: the call's end (a credential failure
 * is every object's), or the object's entry — its search results or its
 * failure — or nothing when it found nothing.
 */
type Described =
  | { ends: McpResult }
  | {
      ends?: undefined;
      entry: ContentEntry;
      /** The hits the search's typed reading read: what terse answers. */
      hits?: readonly ISearchResult[];
      /** The object's failure, when its search was refused. */
      failure?: FailureEntry;
    };

/** One object asked, and what its searches came to. */
interface DescribedItem {
  obj: DescribedObject;
  described: Described & { ends?: undefined };
}

/**
 * One content entry per object asked, in order — its results, its failure,
 * or `found: false` for one no search found — written by the listing
 * writer from the items, one entry each.
 */
const fullDescribed = (items: readonly DescribedItem[]) =>
  asContentResult(
    writeJsonList(
      { items: items.map((item) => item.described.entry) },
      entries('items', (entry: ContentEntry) => entry),
    ),
  );

/** An object's failure line: its name and its failure, as written. */
const failureWords = (line: DescribedFailure): string[] => [
  line.name,
  JSON.stringify(line.failure),
];

/** One line of the terse TSV: a hit row an object was described with, or a refused search. */
type DescribedLine =
  | { readonly kind: 'row'; readonly hit: ISearchResult }
  | DescribedFailure;

/** A refused search: the object's name and its failure, its mark line. */
interface DescribedFailure {
  readonly kind: 'error';
  readonly name: string;
  readonly failure: FailureEntry | undefined;
  readonly hit?: undefined;
}

/**
 * The lines of every object SAP answered: each hit row it described an
 * object with, and each refused search. A name SAP did not describe has no
 * line: terse does not say what is absent (the owner's rule) — medium and
 * full do.
 */
const describedLines = (items: readonly DescribedItem[]): DescribedLine[] =>
  items.flatMap((item): DescribedLine[] =>
    item.described.failure !== undefined
      ? [
          {
            kind: 'error',
            name: item.obj.name,
            failure: item.described.failure,
          },
        ]
      : (item.described.hits ?? []).map(
          (hit): DescribedLine => ({ kind: 'row', hit }),
        ),
  );

/**
 * The lists a description's listing writes: what its description states —
 * each hit row by the columns SearchObject writes of it.
 */
export const DESCRIBED_LISTS: RowSchemas<{ lines: DescribedLine[] }> = {
  lines: about(
    'for each object found',
    kinds<DescribedLine, 'lines', 'kind'>(
      'lines',
      'kind',
      {
        row: {
          row: {
            columns: SEARCH_HIT_COLUMNS.map(
              (column): Column<DescribedLine> => ({
                name: column.name,
                means: column.means,
                cell: (line) =>
                  line.kind === 'row' ? column.cell(line.hit) : '',
              }),
            ),
            header: 'none',
          },
        },
        error: {
          mark: 'error',
          words: (line: DescribedLine) =>
            line.kind === 'error' ? failureWords(line) : [],
        },
      },
      SEARCH_HIT_COLUMNS.map((column) => column.name),
    ),
  ),
};

/** The refusal of a call without objects. */
const OBJECTS_REQUIRED =
  'Missing or invalid parameters: objects (array) is required and must not be empty.';

export const TOOL_DEFINITION = {
  name: 'DescribeByList',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Describes several ABAP repository objects named in one call, each by its name and, when known, its type.',
    ),
    notes: [longRunning],
  }),
  inputSchema: z.object({
    background: LONG_BACKGROUND_FIELD,
    objects: z
      .array(
        z.object({
          name: requiredText('object_name is required').describe(
            '[read-only] Object name (required, must be valid ABAP object name or mask)',
          ),
          type: z
            .string()
            .optional()
            .describe(
              "[read-only] Optional type: a name of the system's object types list (e.g. CLAS, DTAB, STRU) or an ADT type code (e.g. PROG/P, PROG/I, FUGR/F, FUGR/FF, CLAS/OC, INTF/OI), either case, or a name standing for a code, in lower case (e.g. class, table, structure; view is a CDS view, while VIEW is the dictionary views); an object of any other type is searched by its name alone.",
            ),
        }),
      )
      .refine((objects) => objects.length > 0, {
        message: OBJECTS_REQUIRED,
      }),
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

/**
 * What DescribeByList answers at each `detail`, selected before the
 * searches (`src/lib/detail`): terse one TSV — one header, the rows of
 * each object SAP described (name, type, description, package), `# error
 * NAME` and its failure for a refused one, and nothing for a name SAP did
 * not describe (terse lists what SAP returned); medium and full one content
 * entry per object asked ({@link fullDescribed}). Every item written by the
 * listing writers. Raw never reaches this table: the handler answers it
 * as the responses (`wireAnswer`).
 */
const DESCRIBE_ANSWERS: ListAnswerTable<readonly DescribedItem[], McpResult> = {
  terse: (items) =>
    asTextResult(
      writeListing({
        heads: [],
        reading: { lines: describedLines(items) },
        lists: DESCRIBED_LISTS,
      }),
    ),

  medium: fullDescribed,
  full: (items) => fullDescribed(items).answer,
  raw: (items) => fullDescribed(items).answer,
};

/**
 * One object's entry from its first search's answer and, when that was
 * empty or failed, its second's (without the type).
 */
function describedBy(
  obj: DescribedObject,
  first: SearchedObjects | undefined,
  second: SearchedObjects | undefined,
): Described {
  let searched = first;
  if (emptyOrFailed(searched?.result)) {
    searched = second;
    const res = searched?.result;
    // A refusal is the search's error as it is, with the step — this
    // object's answer beside the others', not an object skipped as if
    // nothing were found, and not the end of the call.
    if (res?.isError === true) {
      const failure = failedPayloadOf(res, 'search') ?? {
        message: textOf(res),
        step: 'search',
      };
      // A credential failure is every object's: the call ends with it as
      // it came.
      if (isCredentialPayload(failure)) return { ends: res };
      return {
        entry: {
          type: 'text',
          text: JSON.stringify({ name: obj.name, error: failure }),
        },
        failure,
      };
    }
  }
  // No search found it: the object is answered as not found, at every
  // level — never left out.
  const res = searched?.result;
  if (searched === undefined || res === undefined || !holdsHits(res)) {
    return {
      entry: {
        type: 'text',
        text: JSON.stringify({
          name: obj.name,
          ...(obj.type !== undefined ? { type: obj.type } : {}),
          found: false,
        }),
      },
    };
  }
  // Handle SearchObject-style payloads containing a results array
  const allResults: AnswerValue[] = [];
  for (const item of res.content) {
    const parsedItem = parseJson(item.text);
    if (parsedItem === undefined) {
      allResults.push({ type: item.type, text: item.text });
      continue;
    }
    const listed = isAnswerObject(parsedItem) ? parsedItem.results : undefined;
    if (listed !== undefined && isAnswerList(listed)) {
      appendAll(allResults, listed);
    } else allResults.push(parsedItem);
  }
  return {
    entry: {
      type: 'text',
      text: JSON.stringify({ name: obj.name, results: allResults }),
    },
    hits: searched.hits,
  };
}

/**
 * DescribeByListArray handler.
 * @param args { objects: Array<{ name: string, type?: string }> }
 * @returns Result of handleDetectObjectTypeList with objects
 */
async function describeOneByOne(
  context: HandlerContext,
  args: DescribeArgs | undefined,
  shown: (items: readonly DescribedItem[]) => McpResult,
  searchAt: ChildSearchLevel,
): Promise<McpResult> {
  const { logger } = context;
  // The schema holds the rule: a non-empty `objects`.
  const objects = args?.objects ?? [];
  logger?.info(`Describing ${objects.length} objects via search`);
  const items: DescribedItem[] = [];
  try {
    for (const obj of objects) {
      const first = await searchObjects(context, {
        object_name: obj.name,
        object_type: obj.type,
        detail: searchAt,
      });
      // A credential failure is every object's: the call ends with it as it
      // came, before any second search is sent.
      if (endsDescribe(first.result)) return first.result;
      // If the response is empty or flagged as an error, retry without
      // explicit type; a second search that throws is the call's error — no
      // object is skipped in silence.
      let second: SearchedObjects | undefined;
      if (emptyOrFailed(first.result)) {
        second = await searchObjects(context, {
          object_name: obj.name,
          detail: searchAt,
        });
      }
      const described = describedBy(obj, first, second);
      if (described.ends !== undefined) return described.ends;
      items.push({ obj, described });
    }
    // Return isError: false even when nothing matched
    return shown(items);
  } catch (e) {
    logger?.error('Failed to describe objects list', e);
    return return_error(e);
  }
}

/**
 * The descriptions in ADT batch envelopes (spec §11): (1) the quickSearch of
 * every object, with its type when given; (2) the quickSearch without the
 * type of every object whose first answer was empty or failed. The answer is
 * assembled as the sequential version assembles it. A credential failure
 * any search answers ends the call with that answer, the first in the order
 * of the objects; after one in the first phase, the second is not sent.
 */
async function describeInEnvelopes(
  context: HandlerContext,
  args: DescribeArgs,
  shown: (items: readonly DescribedItem[]) => McpResult,
  searchAt: ChildSearchLevel,
): Promise<McpResult> {
  const { logger } = context;
  const objects = args.objects;
  logger?.info(`Describing ${objects.length} objects via search`);
  const typed = await runPhase(context, objects, (obj, batch) =>
    searchObjects(
      { ...context, connection: batch },
      { object_name: obj.name, object_type: obj.type, detail: searchAt },
    ),
  );
  const typedAnswer = (i: number): SearchedObjects | undefined => {
    const result = typed[i];
    if (result === undefined) return undefined;
    if (!result.ok) throw result.error;
    return result.value;
  };
  for (const result of typed) {
    if (result.ok && endsDescribe(result.value.result)) {
      return result.value.result;
    }
  }
  const again: number[] = [];
  objects.forEach((_obj, i) => {
    const result = typed[i];
    if (
      result?.ok === true &&
      emptyOrFailed(result.value.result) &&
      notAcceptable(result.value.result) === undefined
    )
      again.push(i);
  });
  const untypedResults = await runPhase(context, again, (i, batch) =>
    searchObjects(
      { ...context, connection: batch },
      { object_name: objects[i]?.name ?? '', detail: searchAt },
    ),
  );
  const untyped = new Map<number, PhaseResult<SearchedObjects>>();
  again.forEach((i, at) => {
    const result = untypedResults[at];
    if (result !== undefined) untyped.set(i, result);
  });
  const untypedAnswer = (i: number): SearchedObjects | undefined => {
    const result = untyped.get(i);
    if (result === undefined) return undefined;
    if (!result.ok) throw result.error;
    return result.value;
  };

  const items: DescribedItem[] = [];
  try {
    for (const [i, obj] of objects.entries()) {
      const res = typedAnswer(i);
      const refused = notAcceptable(res?.result);
      if (refused !== undefined) {
        items.push({
          obj,
          described: {
            entry: {
              type: 'text',
              text: JSON.stringify({ name: obj.name, error: refused }),
            },
            failure: refused,
          },
        });
        continue;
      }
      const second = emptyOrFailed(res?.result) ? untypedAnswer(i) : undefined;
      const described = describedBy(obj, res, second);
      if (described.ends !== undefined) return described.ends;
      items.push({ obj, described });
    }
    return shown(items);
  } catch (e) {
    logger?.error('Failed to describe objects list', e);
    return return_error(e);
  }
}

/**
 * DescribeByList: a description of every object, read in ADT batch
 * envelopes; the sequential searches where the destination has no
 * communication batch.
 *
 * At `raw` what ADT sent: the documents the call's reads answered, read
 * with the tool at full (`wireAnswer`, `src/lib/detail/wire.ts`).
 */
export async function handleDescribeByList(
  context: HandlerContext,
  args: DescribeArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'DescribeByList',
        shape: 'assembled',
      },
      () => answeredDescribeByList(context, { ...args, detail: 'full' }),
    );
  }
  return answeredDescribeByList(context, args);
}

async function answeredDescribeByList(
  context: HandlerContext,
  args: DescribeArgs,
) {
  // The schema holds the rule: a non-empty `objects`.
  const shown = listAnswerAt(DESCRIBE_ANSWERS, levelOf(args));
  // The child searches read at the level's reading: terse its hit rows,
  // medium and full the whole parse (each hit's URI kept, no TSV wrapped).
  const searchAt = answerAt(CHILD_SEARCH_LEVELS, levelOf(args))(undefined);
  return withSequentialFallback<McpResult>(
    context,
    () => describeInEnvelopes(context, args, shown, searchAt),
    () => describeOneByOne(context, args, shown, searchAt),
  );
}
