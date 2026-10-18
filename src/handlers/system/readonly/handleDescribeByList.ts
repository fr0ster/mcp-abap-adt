import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
export const TOOL_DEFINITION = {
  name: 'DescribeByList',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Batch description for a list of ABAP objects. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc.',
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      objects: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                '[read-only] Object name (required, must be valid ABAP object name or mask)',
            },
            type: {
              type: 'string',
              description:
                '[read-only] Optional type (e.g. PROG/P, CLAS/OC, etc.)',
            },
          },
        },
      },
    },
    required: ['objects'],
  },
} as const;

// DescribeByList: Batch description for a list of ABAP objects

import {
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
import { handleSearchObject } from '../../search/readonly/handleSearchObject';

/** The text of a failed answer that is not a JSON payload, as it is. */
function textOf(result: unknown): string {
  const first = (result as { content?: Array<{ text?: unknown }> })
    ?.content?.[0]?.text;
  return typeof first === 'string' ? first : '';
}

/**
 * DescribeByListArray handler.
 * @param args { objects: Array<{ name: string, type?: string }> }
 * @returns Result of handleDetectObjectTypeList with objects
 */
async function describeOneByOne(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  const objects = args?.objects;
  if (!args || !Array.isArray(objects) || objects.length === 0) {
    const err = new Error(
      'Missing or invalid parameters: objects (array) is required and must not be empty.',
    );
    // @ts-expect-error
    err.status = 400;
    // @ts-expect-error
    err.body = {
      error: {
        message:
          'Missing or invalid parameters: objects (array) is required and must not be empty.',
        code: 'INVALID_PARAMS',
      },
    };
    throw err;
  }
  logger?.info(`Describing ${objects.length} objects via search`);
  const results: any[] = [];
  try {
    for (const obj of objects) {
      const type = obj.type;
      let res = await handleSearchObject(context, {
        object_name: obj.name,
        object_type: type,
      });
      // A credential failure is every object's: the call ends with it as it
      // came, before any second search is sent.
      const typedFailure = failedPayloadOf(
        res as { isError?: boolean; content?: unknown },
        'search',
      );
      if (typedFailure !== undefined && isCredentialPayload(typedFailure))
        return res;
      let parsed: any;
      try {
        parsed = typeof res === 'string' ? JSON.parse(res) : res;

        // If the response is empty or flagged as an error, retry without explicit type
        let tryWithoutType = false;
        if (
          parsed == null ||
          parsed.isError === true ||
          (parsed.content &&
            Array.isArray(parsed.content) &&
            parsed.content.length === 0)
        ) {
          tryWithoutType = true;
        }

        if (tryWithoutType) {
          res = await handleSearchObject(context, { object_name: obj.name });
          // A refusal is the search's error as it is, with the step — this
          // object's answer beside the others', not an object skipped as if
          // nothing were found, and not the end of the call.
          if ((res as { isError?: boolean })?.isError === true) {
            const failure = failedPayloadOf(
              res as { isError?: boolean; content?: unknown },
              'search',
            ) ?? { message: textOf(res), step: 'search' };
            // A credential failure is every object's: the call ends with it
            // as it came.
            if (isCredentialPayload(failure)) return res;
            results.push({
              type: 'text',
              text: JSON.stringify({ name: obj.name, error: failure }),
            });
            continue;
          }
          parsed = typeof res === 'string' ? JSON.parse(res) : res;
          // If it comes back empty, skip this object
          if (
            parsed == null ||
            (parsed.content &&
              Array.isArray(parsed.content) &&
              parsed.content.length === 0)
          ) {
            continue;
          }
        }

        // When content is a non-empty array
        if (parsed.content && Array.isArray(parsed.content)) {
          const contentArr = parsed.content;
          if (contentArr.length === 0) {
            continue;
          }
          // Handle SearchObject-style payloads containing a results array
          let allResults: any[] = [];
          for (const item of contentArr) {
            try {
              const parsedItem =
                typeof item.text === 'string'
                  ? JSON.parse(item.text)
                  : item.text;
              if (parsedItem?.results && Array.isArray(parsedItem.results)) {
                allResults = allResults.concat(parsedItem.results);
              } else {
                allResults.push(parsedItem);
              }
            } catch {
              allResults.push(item);
            }
          }
          results.push({
            type: 'text',
            text: JSON.stringify({
              name: obj.name,
              results: allResults,
            }),
          });
          continue;
        }

        // Otherwise handle direct object payloads (e.g., DTEL)
        if (typeof parsed === 'object' && parsed !== null) {
          results.push({ type: 'text', text: JSON.stringify(parsed) });
        }
      } catch {}
    }
    // Return isError: false even when nothing matched
    return {
      isError: false,
      content: results,
    };
  } catch (e) {
    logger?.error('Failed to describe objects list', e as any);
    return return_error(e);
  }
}

/** A search answer the sequential version searches again without the type. */
function emptyOrFailed(res: unknown): boolean {
  const parsed = res as { isError?: unknown; content?: unknown } | null;
  return (
    parsed == null ||
    parsed.isError === true ||
    (Boolean(parsed.content) &&
      Array.isArray(parsed.content) &&
      parsed.content.length === 0)
  );
}

/** A search answer that is a credential failure: it ends the call. */
function endsDescribe(res: unknown): boolean {
  const failure = failedPayloadOf(
    res as { isError?: boolean; content?: unknown },
    'search',
  );
  return failure !== undefined && isCredentialPayload(failure);
}

/**
 * The descriptions in ADT batch envelopes (spec §11): (1) the quickSearch of
 * every object, with its type when given; (2) the quickSearch without the
 * type of every object whose first answer was empty or failed. The answer is
 * assembled as the sequential version assembles it. A credential failure
 * any search answers ends the call with that answer, the first in the order
 * of the objects; after one in the first phase, the second is not sent.
 */
async function describeInEnvelopes(context: HandlerContext, args: any) {
  const { logger } = context;
  const objects: any[] = args.objects;
  logger?.info(`Describing ${objects.length} objects via search`);
  const typed = await runPhase(context, objects, (obj, batch) =>
    handleSearchObject(
      { ...context, connection: batch },
      { object_name: obj.name, object_type: obj.type },
    ),
  );
  const typedAnswer = (i: number): unknown => {
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
    if (result?.ok === true && emptyOrFailed(result.value)) again.push(i);
  });
  const untypedResults = await runPhase(context, again, (i, batch) =>
    handleSearchObject(
      { ...context, connection: batch },
      { object_name: objects[i].name },
    ),
  );
  const untyped = new Map<number, PhaseResult<unknown>>();
  again.forEach((i, at) => {
    const result = untypedResults[at];
    if (result !== undefined) untyped.set(i, result);
  });
  const untypedAnswer = (i: number): unknown => {
    const result = untyped.get(i);
    if (result === undefined) return undefined;
    if (!result.ok) throw result.error;
    return result.value;
  };

  const results: any[] = [];
  try {
    for (const [i, obj] of objects.entries()) {
      // Read as the sequential version reads it: an entry that is not an
      // object fails the call here, as it does there.
      const _type = obj.type;
      let res: any = typedAnswer(i);
      const second = emptyOrFailed(res) ? untypedAnswer(i) : undefined;
      let parsed: any;
      try {
        parsed = typeof res === 'string' ? JSON.parse(res) : res;

        if (emptyOrFailed(parsed)) {
          res = second;
          if ((res as { isError?: boolean })?.isError === true) {
            const failure = failedPayloadOf(
              res as { isError?: boolean; content?: unknown },
              'search',
            ) ?? { message: textOf(res), step: 'search' };
            if (isCredentialPayload(failure)) return res;
            results.push({
              type: 'text',
              text: JSON.stringify({ name: obj.name, error: failure }),
            });
            continue;
          }
          parsed = typeof res === 'string' ? JSON.parse(res) : res;
          if (
            parsed == null ||
            (parsed.content &&
              Array.isArray(parsed.content) &&
              parsed.content.length === 0)
          ) {
            continue;
          }
        }

        if (parsed.content && Array.isArray(parsed.content)) {
          const contentArr = parsed.content;
          if (contentArr.length === 0) {
            continue;
          }
          let allResults: any[] = [];
          for (const item of contentArr) {
            try {
              const parsedItem =
                typeof item.text === 'string'
                  ? JSON.parse(item.text)
                  : item.text;
              if (parsedItem?.results && Array.isArray(parsedItem.results)) {
                allResults = allResults.concat(parsedItem.results);
              } else {
                allResults.push(parsedItem);
              }
            } catch {
              allResults.push(item);
            }
          }
          results.push({
            type: 'text',
            text: JSON.stringify({
              name: obj.name,
              results: allResults,
            }),
          });
          continue;
        }

        if (typeof parsed === 'object' && parsed !== null) {
          results.push({ type: 'text', text: JSON.stringify(parsed) });
        }
      } catch {}
    }
    return {
      isError: false,
      content: results,
    };
  } catch (e) {
    logger?.error('Failed to describe objects list', e as any);
    return return_error(e);
  }
}

/**
 * DescribeByList: a description of every object, read in ADT batch
 * envelopes; the sequential searches where the destination has no
 * communication batch.
 */
export async function handleDescribeByList(context: HandlerContext, args: any) {
  const objects = args?.objects;
  if (!args || !Array.isArray(objects) || objects.length === 0) {
    return describeOneByOne(context, args);
  }
  return withSequentialFallback<McpResult>(
    context,
    () => describeInEnvelopes(context, args) as Promise<McpResult>,
    () => describeOneByOne(context, args) as Promise<McpResult>,
  );
}
