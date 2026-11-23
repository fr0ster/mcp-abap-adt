import * as z from 'zod';
import { requiredText } from '../../../lib/handlers/argumentRules';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import { ASSEMBLED_DETAIL_SHAPE } from '../../../lib/strategies/detail';

/** The refusal of a call without objects. */
const OBJECTS_REQUIRED =
  'Missing or invalid parameters: objects (array) is required and must not be empty.';

export const TOOL_DEFINITION = {
  name: 'DescribeByList',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    "[read-only] Describes each repository object named in objects, in one call: its type, description and package. Input: objects: Array<{ name: string, type?: string }>. Each object's type is optional: a name of the system's object types list (e.g. CLAS, DTAB, STRU) or an ADT type code (e.g. PROG/P, PROG/I, FUGR/F, FUGR/FF, CLAS/OC, INTF/OI), either case, or a name standing for a code, in lower case (e.g. class, table, structure; view is a CDS view, while VIEW is the dictionary views); an object of any other type is searched by its name alone.",
  ),
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
            .describe('[read-only] Optional type (e.g. PROG/P, CLAS/OC, etc.)'),
        }),
      )
      .refine((objects) => objects.length > 0, {
        message: OBJECTS_REQUIRED,
      }),
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

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
  answerAt,
  asContentResult,
  asTextResult,
  cellsOf,
  entries,
  kinds,
  type ListAnswerTable,
  listAnswerAt,
  marks,
  wireAnswer,
  within,
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
import { handleSearchObject } from '../../search/readonly/handleSearchObject';

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
      /** The search's own answer text, its TSV rows: what terse answers. */
      hits?: string;
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
      { items },
      entries('items', (item: DescribedItem) => item.described.entry),
    ),
  );

/** The hit rows a search answered for an object, read back into their cells. */
const hitRowsOf = ({ described }: DescribedItem): HitCells[] =>
  (described.hits ?? '')
    .split('\n')
    .slice(1)
    .filter((row) => row !== '')
    .map(cellsOf)
    .map(([name = '', type = '', description = '', pkg = '', ...extra]) => ({
      name,
      type,
      description,
      package: pkg,
      extra,
    }));

/**
 * A hit row's cells, by the columns SearchObject writes; any cell past them
 * kept, written after them.
 */
interface HitCells {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly package: string;
  readonly extra: readonly string[];
}

/** An object's failure line: its name and its failure, as written. */
const failureWords = (line: DescribedFailure): string[] => [
  line.name,
  JSON.stringify(line.failure),
];

/** One line of the terse TSV: a hit row an object was described with, or a refused search. */
type DescribedLine =
  | { readonly kind: 'row'; readonly cells: HitCells }
  | DescribedFailure;

/** A refused search: the object's name and its failure, its mark line. */
interface DescribedFailure {
  readonly kind: 'error';
  readonly name: string;
  readonly failure: FailureEntry | undefined;
  readonly cells?: undefined;
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
      : hitRowsOf(item).map((cells): DescribedLine => ({ kind: 'row', cells })),
  );

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
        lists: {
          lines: kinds<DescribedLine, 'lines', 'kind'>(
            'lines',
            'kind',
            {
              row: {
                row: {
                  columns: [
                    {
                      name: 'name',
                      cell: (line) =>
                        line.kind === 'row' ? line.cells.name : '',
                    },
                    {
                      name: 'type',
                      cell: (line) =>
                        line.kind === 'row' ? line.cells.type : '',
                    },
                    {
                      name: 'description',
                      cell: (line) =>
                        line.kind === 'row' ? line.cells.description : '',
                    },
                    {
                      name: 'package',
                      cell: (line) =>
                        line.kind === 'row' ? line.cells.package : '',
                    },
                  ],
                  header: 'none',
                  // Any cell past the four, as SAP's row held it: a line each.
                  lists: {
                    cells: within<HitCells, 'cells'>('cells', {
                      extra: marks('extra', 'extra', (cell: string) => [cell]),
                    }),
                  },
                },
              },
              error: {
                mark: 'error',
                words: (line: DescribedLine) =>
                  line.kind === 'error' ? failureWords(line) : [],
              },
            },
            ['name', 'type', 'description', 'package'],
          ),
        },
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
  first: McpResult | undefined,
  second: McpResult | undefined,
): Described {
  let res = first;
  if (emptyOrFailed(res)) {
    res = second;
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
  if (res === undefined || !holdsHits(res)) {
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
      allResults.push(...listed);
    } else allResults.push(parsedItem);
  }
  return {
    entry: {
      type: 'text',
      text: JSON.stringify({ name: obj.name, results: allResults }),
    },
    hits: res.content.map((item) => item.text).join('\n'),
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
      const first = await handleSearchObject(context, {
        object_name: obj.name,
        object_type: obj.type,
        detail: searchAt,
      });
      // A credential failure is every object's: the call ends with it as it
      // came, before any second search is sent.
      if (endsDescribe(first)) return first;
      // If the response is empty or flagged as an error, retry without
      // explicit type; a second search that throws is the call's error — no
      // object is skipped in silence.
      let second: McpResult | undefined;
      if (emptyOrFailed(first)) {
        second = await handleSearchObject(context, {
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
    handleSearchObject(
      { ...context, connection: batch },
      { object_name: obj.name, object_type: obj.type, detail: searchAt },
    ),
  );
  const typedAnswer = (i: number): McpResult | undefined => {
    const result = typed[i];
    if (result === undefined) return undefined;
    if (!result.ok) throw result.error;
    return result.value;
  };
  for (const result of typed) {
    if (result.ok && endsDescribe(result.value)) return result.value;
  }
  const again: number[] = [];
  objects.forEach((_obj, i) => {
    const result = typed[i];
    if (
      result?.ok === true &&
      emptyOrFailed(result.value) &&
      notAcceptable(result.value) === undefined
    )
      again.push(i);
  });
  const untypedResults = await runPhase(context, again, (i, batch) =>
    handleSearchObject(
      { ...context, connection: batch },
      { object_name: objects[i]?.name ?? '', detail: searchAt },
    ),
  );
  const untyped = new Map<number, PhaseResult<McpResult>>();
  again.forEach((i, at) => {
    const result = untypedResults[at];
    if (result !== undefined) untyped.set(i, result);
  });
  const untypedAnswer = (i: number): McpResult | undefined => {
    const result = untyped.get(i);
    if (result === undefined) return undefined;
    if (!result.ok) throw result.error;
    return result.value;
  };

  const items: DescribedItem[] = [];
  try {
    for (const [i, obj] of objects.entries()) {
      const res = typedAnswer(i);
      const refused = notAcceptable(res);
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
      const second = emptyOrFailed(res) ? untypedAnswer(i) : undefined;
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
