/**
 * WhereUsed handler using AdtClient utilities
 * Endpoint: /sap/bc/adt/repository/informationsystem/usageReferences
 *
 * Uses AdtClient.getUtils(ourUtils).{getWhereUsedScope,modifyWhereUsedScope,
 * getWhereUsed} from @mcp-abap-adt/adt-clients 19 — `getWhereUsedList`'s
 * replacement, composed in `src/lib/strategies/whereUsedList.ts` per the
 * guide's own "Sequences are yours" table entry. See that file for why the
 * scope round trip is skipped unless a filter needs it, why a refused scope
 * fetch is surfaced rather than silently retried unscoped, and why neither
 * member takes an `analyse`.
 *
 * `client.getUtils(ourUtils)`, never `client.getUtils()`: `ourUtils` is this
 * repository's own `node` reading (keeps the descriptions the shipped one
 * drops) — irrelevant to where-used itself, but every consumer of the
 * information-system utilities shares the one injected result set, the same
 * way `handleGetObjectsByType.ts` does for its own unrelated member.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import {
  answer,
  answerFailure,
  answerThrown,
  failedPayloadOf,
  failureEntry,
  isCredentialPayload,
  type McpResult,
} from '../../../lib/answer';
import { failureOf } from '../../../lib/auth/failures';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import {
  fetchWhereUsedReferences,
  type WhereUsedListResult,
  type WhereUsedSource,
} from '../../../lib/strategies/whereUsedList';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetWhereUsed',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Where-used list of an ABAP object: every object that uses, calls or references it, with its type and package. Takes object_name and object_type (one object: its list) or objects (several objects: one entry per object, in the order given, each its list or { object_name, object_type, error }).',
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      object_name: {
        type: 'string',
        description:
          "Name of the ABAP object (with object_type; or give objects). For function modules the name MUST be in the form 'GROUP|FM_NAME' (function group name, pipe, function module name).",
      },
      object_type: {
        type: 'string',
        description:
          "Type of the ABAP object. Case-insensitive. Accepts either a human alias or an ADT type code. Supported values: 'class' / 'clas/oc', 'interface' / 'intf/if', 'program' / 'prog/p', 'include', 'function' / 'functiongroup' / 'fugr' (function group), 'functionmodule' / 'function_module' / 'fugr/ff' (function module — see object_name format), 'package' / 'devc/k', 'table' / 'tabl/dt', 'structure' / 'stru/dt', 'domain' / 'doma/dd', 'dataelement' / 'dtel', 'view' / 'ddls/df' (CDS DDL source).",
      },
      objects: {
        type: 'array',
        description:
          'Several objects, read together (give this or object_name and object_type). The type filters apply to every object.',
        items: {
          type: 'object',
          properties: {
            object_name: {
              type: 'string',
              description:
                "Name of the ABAP object; a function module as 'GROUP|FM_NAME'",
            },
            object_type: {
              type: 'string',
              description: 'Type of the ABAP object, as object_type takes it',
            },
          },
          required: ['object_name', 'object_type'],
        },
      },
      enable_all_types: {
        type: 'boolean',
        description:
          "If true, expands the scope to all available object types (Eclipse 'select all' behavior) by flipping every isSelected flag in the scope XML. Default: false (SAP default scope). Note: on large systems this can make the search significantly slower.",
        default: false,
      },
      enable_only_types: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Restrict the search to ONLY these ADT object types (e.g. ['TABL/DS','TABL/DT'] for structures, ['DDLS/DF'] for CDS sources). SAP applies the selection server-side, so unwanted types (e.g. hundreds of CLAS/OC) are never searched nor returned — use this instead of enable_all_types to avoid huge result sets. Values must be object-type codes from THIS object's where-used scope (the searchable categories, e.g. 'CLAS/OC','INTF/OI','FUGR/FF','DDLS/DF', not result-row codes like 'FUGR/F'). If any value is not searchable for the object the call returns an error listing the supported types — it never falls back to the unfiltered default set. Takes precedence over enable_all_types.",
      },
      disable_types: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Remove these ADT object types from the default scope, keeping the rest (e.g. ['CLAS/OC'] to drop class usages). Applied on top of the default scope or of enable_only_types/enable_all_types.",
      },
    },
    required: [],
  },
} as const;

interface WhereUsedArgs {
  object_name: string;
  object_type: string;
  objects?: Array<{ object_name: string; object_type: string }>;
  enable_all_types?: boolean;
  enable_only_types?: string[];
  disable_types?: string[];
}

/**
 * Returns where-used references for ABAP objects using AdtClient utilities.
 */
async function whereUsedOf(context: HandlerContext, args: WhereUsedArgs) {
  const { connection, logger } = context;

  if (!args?.object_name) {
    return return_error('Object name is required');
  }
  if (!args?.object_type) {
    return return_error('Object type is required');
  }

  const typedArgs = args as WhereUsedArgs;
  logger?.info(
    `Resolving where-used list for ${typedArgs.object_type}/${typedArgs.object_name}`,
  );

  const utils = createAdtClient(connection, logger).getUtils(ourUtils);

  // Validate enable_only_types against the object's where-used scope. The
  // scope lists exactly which object types are searchable for THIS object;
  // selecting a type that is absent would otherwise leave an all-deselected
  // scope, which SAP silently treats as "default" and returns the full,
  // unfiltered result set. We refuse that: only valid scope types are
  // searched, anything else is an explicit error — so we return only what
  // was asked for, never extra.
  if (typedArgs.enable_only_types && typedArgs.enable_only_types.length > 0) {
    const scopeResponse = await utils.getWhereUsedScope(
      {
        object_name: typedArgs.object_name,
        object_type: typedArgs.object_type,
      },
      { analyse: analyseException },
    );
    if (!scopeResponse.ok) {
      return answerFailure(
        withStep(scopeResponse.getError(), 'read where-used scope'),
        { tool: 'GetWhereUsed', detail: 'terse' },
      );
    }
    const scopeXml = scopeResponse.getResult().value?.raw ?? '';
    const available = new Set<string>(
      [
        ...scopeXml.matchAll(/<usagereferences:type\b[^>]*\bname="([^"]+)"/g),
      ].map((m) => m[1]),
    );
    const unknown = typedArgs.enable_only_types.filter(
      (t) => !available.has(t),
    );
    if (unknown.length > 0) {
      return return_error(
        `enable_only_types contains object type(s) not searchable in the where-used scope of ${typedArgs.object_type}/${typedArgs.object_name}: ${unknown.join(', ')}. ` +
          `Supported types for this object: ${[...available].sort().join(', ')}.`,
      );
    }
  }

  return answer(
    { tool: 'GetWhereUsed', detail: 'terse' },
    () =>
      fetchWhereUsedReferences(utils, {
        object_name: typedArgs.object_name,
        object_type: typedArgs.object_type,
        enableAllTypes: typedArgs.enable_all_types,
        enableOnlyTypes: typedArgs.enable_only_types,
        disableTypes: typedArgs.disable_types,
      }),
    (result: WhereUsedListResult) => {
      const formattedResponse = {
        object_name: typedArgs.object_name,
        object_type: typedArgs.object_type,
        enable_all_types: typedArgs.enable_all_types || false,
        enable_only_types: typedArgs.enable_only_types,
        disable_types: typedArgs.disable_types,
        total_references: result.totalReferences,
        result_description: result.resultDescription,
        references: result.references,
      };
      objectsListCache.setCache({
        isError: false,
        content: [{ type: 'json', json: formattedResponse }],
      });
      return formattedResponse;
    },
  );
}

/** Whether a filter reads the scope first, as `fetchWhereUsedReferences` decides it. */
function readsScope(args: WhereUsedArgs): boolean {
  return Boolean(
    args.enable_all_types ||
      (args.enable_only_types && args.enable_only_types.length > 0) ||
      (args.disable_types && args.disable_types.length > 0),
  );
}

/** Whether the scope is validated against `enable_only_types` first. */
function validatesScope(args: WhereUsedArgs): boolean {
  return Boolean(args.enable_only_types && args.enable_only_types.length > 0);
}

/** An answer of a phase, as the call it stands for answers: a throw for a rejection. */
async function answered<T>(result: PhaseResult<T> | undefined): Promise<T> {
  if (result === undefined) {
    throw new Error('GetWhereUsed: a read of the phases has no answer');
  }
  if (!result.ok) throw result.error;
  return result.value;
}

/** Whether a phase's answer is SAP's refusal of the credential: it ends the call. */
function refusesCredential(
  result: PhaseResult<IAdtResponse<unknown, IAdtError>> | undefined,
  step: string,
): boolean {
  return (
    result?.ok === true &&
    !result.value.ok &&
    isCredentialPayload(failureEntry(result.value.getError(), step))
  );
}

/**
 * One object's answer from the phases' answers — the sequential version's
 * steps over the answers instead of requests: the same validation of
 * `enable_only_types`, the same failures, the same projection. The scope is
 * the one answer the phase read; where the sequential version reads it
 * again, that answer is read again.
 */
async function whereUsedFromAnswers(
  context: HandlerContext,
  typedArgs: WhereUsedArgs,
  scope: PhaseResult<IAdtResponse<AdtReading<unknown>, IAdtError>> | undefined,
  references:
    | PhaseResult<IAdtResponse<AdtReading<unknown>, IAdtError>>
    | undefined,
) {
  const { connection, logger } = context;
  if (!typedArgs?.object_name) {
    return return_error('Object name is required');
  }
  if (!typedArgs?.object_type) {
    return return_error('Object type is required');
  }
  logger?.info(
    `Resolving where-used list for ${typedArgs.object_type}/${typedArgs.object_name}`,
  );
  // `modifyWhereUsedScope` is local: no request.
  const utils = createAdtClient(connection, logger).getUtils(ourUtils);
  if (validatesScope(typedArgs)) {
    const scopeResponse = await answered(scope);
    if (!scopeResponse.ok) {
      return answerFailure(
        withStep(scopeResponse.getError(), 'read where-used scope'),
        { tool: 'GetWhereUsed', detail: 'terse' },
      );
    }
    const unknown = unsearchable(typedArgs, scopeResponse);
    if (unknown !== undefined) return return_error(unknown);
  }
  return answer(
    { tool: 'GetWhereUsed', detail: 'terse' },
    () =>
      fetchWhereUsedReferences(
        {
          getWhereUsedScope: () => answered(scope),
          modifyWhereUsedScope: (scopeXml, options) =>
            utils.modifyWhereUsedScope(scopeXml, options),
          getWhereUsed: () => answered(references),
        },
        {
          object_name: typedArgs.object_name,
          object_type: typedArgs.object_type,
          enableAllTypes: typedArgs.enable_all_types,
          enableOnlyTypes: typedArgs.enable_only_types,
          disableTypes: typedArgs.disable_types,
        },
      ),
    (result: WhereUsedListResult) => {
      const formattedResponse = {
        object_name: typedArgs.object_name,
        object_type: typedArgs.object_type,
        enable_all_types: typedArgs.enable_all_types || false,
        enable_only_types: typedArgs.enable_only_types,
        disable_types: typedArgs.disable_types,
        total_references: result.totalReferences,
        result_description: result.resultDescription,
        references: result.references,
      };
      objectsListCache.setCache({
        isError: false,
        content: [{ type: 'json', json: formattedResponse }],
      });
      return formattedResponse;
    },
  );
}

/**
 * The words of `enable_only_types` naming a type the scope does not offer,
 * as the sequential version words them; `undefined` when every one is
 * offered.
 */
function unsearchable(
  typedArgs: WhereUsedArgs,
  scopeResponse: IAdtResponse<AdtReading<unknown>, IAdtError> & { ok: true },
): string | undefined {
  const scopeXml = scopeResponse.getResult().value?.raw ?? '';
  const available = new Set<string>(
    [...scopeXml.matchAll(/<usagereferences:type\b[^>]*\bname="([^"]+)"/g)].map(
      (m) => m[1],
    ),
  );
  const unknown = (typedArgs.enable_only_types ?? []).filter(
    (t) => !available.has(t),
  );
  if (unknown.length === 0) return undefined;
  return (
    `enable_only_types contains object type(s) not searchable in the where-used scope of ${typedArgs.object_type}/${typedArgs.object_name}: ${unknown.join(', ')}. ` +
    `Supported types for this object: ${[...available].sort().join(', ')}.`
  );
}

/** What the batched version answers: every object's answer, or the one that ends the call. */
type WhereUsedOutcome = { answers: McpResult[] } | { ended: McpResult };

/**
 * Every object's where-used list in ADT batch envelopes (spec §11). With a
 * type filter: (1) the where-used scope of every object; (2) the scoped
 * where-used request of every object whose scope answered (and, with
 * `enable_only_types`, offers every type asked) — two envelopes for any
 * number of objects. Each scope is read once. Without a filter: (1) the
 * where-used request of every object, in one envelope. An object without a
 * name or a type is answered as the sequential version answers it, with
 * nothing read. A credential refusal ends the call: SAP's `401` to any
 * read, the first in the order of the objects, is the call's answer, and
 * nothing is read after it; a refusal the connection throws ends it as the
 * sequential version ends it — thrown from the validating scope read,
 * answered from any other.
 */
async function whereUsedInEnvelopes(
  context: HandlerContext,
  targets: readonly WhereUsedArgs[],
  filter: WhereUsedArgs,
): Promise<WhereUsedOutcome> {
  const { logger } = context;
  const utilsOn = (connection: HandlerContext['connection']) =>
    createAdtClient(connection, logger).getUtils(ourUtils);
  const readable = targets
    .map((target, i) => ({ target, i }))
    .filter(({ target }) => target.object_name && target.object_type);
  const params = (target: WhereUsedArgs) => ({
    object_name: target.object_name,
    object_type: target.object_type,
  });
  type Answered = PhaseResult<IAdtResponse<AdtReading<unknown>, IAdtError>>;
  const scopes = new Map<number, Answered>();
  const references = new Map<number, Answered>();
  const ended = (
    answers: Map<number, Answered>,
    step: string,
  ): number | undefined =>
    readable.find(({ i }) => refusesCredential(answers.get(i), step))?.i;
  const endWith = async (i: number): Promise<WhereUsedOutcome> => ({
    ended: (await whereUsedFromAnswers(
      context,
      targets[i] as WhereUsedArgs,
      scopes.get(i),
      references.get(i),
    )) as McpResult,
  });

  let searched = readable;
  if (readsScope(filter)) {
    let read: Answered[];
    try {
      read = (await runPhase(context, readable, ({ target }, batch) => {
        if (validatesScope(filter)) {
          return utilsOn(batch).getWhereUsedScope(params(target), {
            analyse: analyseException,
          });
        }
        // Sent as `fetchWhereUsedReferences` sends it, through the members
        // it names (`WhereUsedSource`).
        const source: WhereUsedSource = utilsOn(batch);
        return source.getWhereUsedScope(params(target));
      })) as Answered[];
    } catch (error) {
      // The sequential version throws a refusal of the validating read and
      // answers one of the scope read `fetchWhereUsedReferences` makes.
      if (failureOf(error) === undefined || validatesScope(filter)) throw error;
      return { ended: answerThrown(error, WHERE_USED_CONTEXT) };
    }
    readable.forEach(({ i }, at) => {
      const result = read[at];
      if (result !== undefined) scopes.set(i, result);
    });
    const refused = ended(scopes, 'read where-used scope');
    if (refused !== undefined) return endWith(refused);
    searched = readable.filter(({ target, i }) => {
      const scope = scopes.get(i);
      if (scope?.ok !== true || !scope.value.ok) return false;
      return (
        !validatesScope(filter) ||
        unsearchable(target, scope.value) === undefined
      );
    });
  }
  if (searched.length > 0) {
    let read: Answered[];
    try {
      read = (await runPhase(context, searched, ({ target, i }, batch) => {
        // Sent as `fetchWhereUsedReferences` sends it, through the members
        // it names (`WhereUsedSource`).
        const utils: WhereUsedSource = utilsOn(batch);
        const scope = scopes.get(i);
        const scoped = scope?.ok === true ? scope.value : undefined;
        if (scoped === undefined || !scoped.ok) {
          return utils.getWhereUsed(params(target));
        }
        return utils.getWhereUsed({
          ...params(target),
          scopeXml: utils.modifyWhereUsedScope(
            scoped.getResult().value?.raw ?? '',
            {
              enableAll: filter.enable_all_types,
              enableOnly: filter.enable_only_types,
              disable: filter.disable_types,
            },
          ),
        });
      })) as Answered[];
    } catch (error) {
      if (failureOf(error) === undefined) throw error;
      return { ended: answerThrown(error, WHERE_USED_CONTEXT) };
    }
    searched.forEach(({ i }, at) => {
      const result = read[at];
      if (result !== undefined) references.set(i, result);
    });
    const refused = ended(references, 'read where-used');
    if (refused !== undefined) return endWith(refused);
  }

  const answers: McpResult[] = [];
  for (const [i, target] of targets.entries()) {
    answers.push(
      (await whereUsedFromAnswers(
        context,
        target,
        scopes.get(i),
        references.get(i),
      )) as McpResult,
    );
  }
  return { answers };
}

const WHERE_USED_CONTEXT = { tool: 'GetWhereUsed', detail: 'terse' } as const;

/** An answer's payload: its JSON, else its text. */
function payloadOfAnswer(result: McpResult): unknown {
  const text = result.content[0]?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Whether an answer is a credential failure: it ends a call for several objects. */
function endsList(result: McpResult): boolean {
  const failed = failedPayloadOf(result, 'read where-used');
  return failed !== undefined && isCredentialPayload(failed);
}

/** A list call's answer: one entry per object, in the order asked. */
function listAnswer(
  objects: ReadonlyArray<{ object_name: unknown; object_type: unknown }>,
  results: readonly McpResult[],
): McpResult {
  const entries = results.map((result, i) => {
    const asked = objects[i] as (typeof objects)[number];
    return result.isError
      ? {
          object_name: asked.object_name,
          object_type: asked.object_type,
          error: payloadOfAnswer(result),
        }
      : payloadOfAnswer(result);
  });
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }],
  };
}

/** One answer of the batched version: an object's, or the one that ended the call. */
const onlyAnswer = (outcome: WhereUsedOutcome): McpResult =>
  'ended' in outcome ? outcome.ended : (outcome.answers[0] as McpResult);

/**
 * Where-used lists of one object or several, read in ADT batch envelopes
 * where a call sends more than one request; the sequential reads where the
 * destination has no communication batch. One object without a type filter
 * is one request, sent as itself.
 */
export async function handleGetWhereUsed(
  context: HandlerContext,
  given: Omit<WhereUsedArgs, 'object_name' | 'object_type'> & {
    object_name?: string;
    object_type?: string;
  },
) {
  // The single object's arguments as the sequential version reads them.
  const args = given as WhereUsedArgs;
  const listed = args?.objects;
  if (listed === undefined) {
    if (!args?.object_name || !args?.object_type || !readsScope(args)) {
      return whereUsedOf(context, args);
    }
    return withSequentialFallback<McpResult>(
      context,
      async () => onlyAnswer(await whereUsedInEnvelopes(context, [args], args)),
      () => whereUsedOf(context, args) as Promise<McpResult>,
    );
  }
  if (
    args.object_name !== undefined ||
    args.object_type !== undefined ||
    !Array.isArray(listed) ||
    listed.length === 0
  ) {
    return return_error(
      'Give exactly one of object_name and object_type, or objects (a non-empty list of { object_name, object_type })',
    );
  }
  const objects = listed.map((o) => ({
    object_name: o?.object_name,
    object_type: o?.object_type,
  }));
  const { objects: _list, ...rest } = args;
  const targets: WhereUsedArgs[] = objects.map((o) => ({ ...rest, ...o }));
  return withSequentialFallback<McpResult>(
    context,
    async () => {
      const outcome = await whereUsedInEnvelopes(context, targets, args);
      return 'ended' in outcome
        ? outcome.ended
        : listAnswer(objects, outcome.answers);
    },
    async () => {
      // One object after another, each as the single call reads it; a
      // credential failure ends the call, and nothing after it is read.
      const results: McpResult[] = [];
      for (const target of targets) {
        const result = (await whereUsedOf(context, target)) as McpResult;
        if (endsList(result)) return result;
        results.push(result);
      }
      return listAnswer(objects, results);
    },
  );
}
