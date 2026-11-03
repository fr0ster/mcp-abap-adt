import * as z from 'zod';
import { TIMEOUT_FIELD, withLongToolAdvice } from '../../../lib/longTools';
export const TOOL_DEFINITION = {
  name: 'DescribeByList',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    "[read-only] Describes each repository object named in objects, in one call: its type, description and package. Input: objects: Array<{ name: string, type?: string }>. Each object's type is optional: a name of the system's object types list (e.g. CLAS, DTAB, STRU) or an ADT type code (e.g. PROG/P, PROG/I, FUGR/F, FUGR/FF, CLAS/OC, INTF/OI), either case, or a name standing for a code, in lower case (e.g. class, table, structure; view is a CDS view, while VIEW is the dictionary views); an object of any other type is searched by its name alone.",
  ),
  inputSchema: z.object({
    timeout: TIMEOUT_FIELD,
    objects: z.array(
      z.object({
        name: z
          .string()
          .optional()
          .describe(
            '[read-only] Object name (required, must be valid ABAP object name or mask)',
          ),
        type: z
          .string()
          .optional()
          .describe('[read-only] Optional type (e.g. PROG/P, CLAS/OC, etc.)'),
      }),
    ),
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
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';
import { child, isList } from '../../../lib/xml/tree';
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
  | { ends?: undefined; entry: ContentEntry | undefined };

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
      };
    }
  }
  // Empty: skip this object
  if (res === undefined || res.content.length === 0) {
    return { entry: undefined };
  }
  // Handle SearchObject-style payloads containing a results array
  const allResults: unknown[] = [];
  for (const item of res.content) {
    try {
      const parsedItem: unknown = JSON.parse(item.text);
      const listed = child(parsedItem, 'results');
      if (listed && isList(listed)) allResults.push(...listed);
      else allResults.push(parsedItem);
    } catch {
      allResults.push(item);
    }
  }
  return {
    entry: {
      type: 'text',
      text: JSON.stringify({ name: obj.name, results: allResults }),
    },
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
): Promise<McpResult> {
  const { logger } = context;
  const objects = args?.objects;
  if (!args || !Array.isArray(objects) || objects.length === 0) {
    throw Object.assign(
      new Error(
        'Missing or invalid parameters: objects (array) is required and must not be empty.',
      ),
      {
        status: 400,
        body: {
          error: {
            message:
              'Missing or invalid parameters: objects (array) is required and must not be empty.',
            code: 'INVALID_PARAMS',
          },
        },
      },
    );
  }
  logger?.info(`Describing ${objects.length} objects via search`);
  const results: ContentEntry[] = [];
  try {
    for (const obj of objects) {
      const first = await handleSearchObject(context, {
        object_name: obj.name ?? '',
        object_type: obj.type,
      });
      // A credential failure is every object's: the call ends with it as it
      // came, before any second search is sent.
      if (endsDescribe(first)) return first;
      // If the response is empty or flagged as an error, retry without
      // explicit type; a second search that throws skips the object.
      let second: McpResult | undefined;
      if (emptyOrFailed(first)) {
        try {
          second = await handleSearchObject(context, {
            object_name: obj.name ?? '',
          });
        } catch {
          continue;
        }
      }
      const described = describedBy(obj, first, second);
      if (described.ends !== undefined) return described.ends;
      if (described.entry !== undefined) results.push(described.entry);
    }
    // Return isError: false even when nothing matched
    return { isError: false, content: results };
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
): Promise<McpResult> {
  const { logger } = context;
  const objects = args.objects;
  logger?.info(`Describing ${objects.length} objects via search`);
  const typed = await runPhase(context, objects, (obj, batch) =>
    handleSearchObject(
      { ...context, connection: batch },
      { object_name: obj.name ?? '', object_type: obj.type },
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
      { object_name: objects[i]?.name ?? '' },
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

  const results: ContentEntry[] = [];
  try {
    for (const [i, obj] of objects.entries()) {
      const res = typedAnswer(i);
      const refused = notAcceptable(res);
      if (refused !== undefined) {
        results.push({
          type: 'text',
          text: JSON.stringify({ name: obj.name, error: refused }),
        });
        continue;
      }
      const second = emptyOrFailed(res) ? untypedAnswer(i) : undefined;
      const described = describedBy(obj, res, second);
      if (described.ends !== undefined) return described.ends;
      if (described.entry !== undefined) results.push(described.entry);
    }
    return { isError: false, content: results };
  } catch (e) {
    logger?.error('Failed to describe objects list', e);
    return return_error(e);
  }
}

/**
 * DescribeByList: a description of every object, read in ADT batch
 * envelopes; the sequential searches where the destination has no
 * communication batch.
 */
export async function handleDescribeByList(
  context: HandlerContext,
  args: DescribeArgs,
) {
  const objects = args?.objects;
  if (!args || !Array.isArray(objects) || objects.length === 0) {
    return describeOneByOne(context, args);
  }
  return withSequentialFallback<McpResult>(
    context,
    () => describeInEnvelopes(context, args),
    () => describeOneByOne(context, args),
  );
}
