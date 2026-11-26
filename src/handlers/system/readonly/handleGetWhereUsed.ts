import * as z from 'zod';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
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
import type {
  AdtTypeCode,
  IAdtError,
  IAdtResponse,
  IAdtWhereUsedScopeParamsOf,
} from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  type ProjectionVariant,
  WHERE_USED_CODES,
  WHERE_USED_NAMES,
  type WhereUsedCode,
  whereUsedTypeDescription,
} from '../../../lib/adtProjections';
import { acceptedCodeOf, notAccepted } from '../../../lib/adtTypeCode';
import {
  answer,
  answerFailure,
  answerPayload,
  answerThrown,
  failedPayloadOf,
  failureEntry,
  isCredentialPayload,
  type ListedAnswer,
  listedAnswer,
  type McpResult,
} from '../../../lib/answer';
import { failureOf } from '../../../lib/auth/failures';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient, variantOf } from '../../../lib/clients';
import {
  longRunning,
  purpose,
  toolDescription,
} from '../../../lib/description';
import {
  about,
  asJsonResult,
  asTextResult,
  byListing,
  type DetailLevel,
  entries,
  type Head,
  headShape,
  type ListAnswerTable,
  type Listing,
  listAnswerAt,
  omitting,
  partsOf,
  type RowSchemas,
  rows,
  type TextResult,
  values,
  type Written,
  wireAnswer,
  writeJson,
  writeJsonList,
  writeListing,
} from '../../../lib/detail';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import {
  type RuleVariant,
  stated,
  withInCallSchema,
} from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { type JsonValue, jsonFields } from '../../../lib/json';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { checkModuleReferences } from '../../../lib/strategies/functionModuleGroup';
import { whereUsedScopeTypesOf } from '../../../lib/strategies/metadataFields';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import { usageSnippetsOn } from '../../../lib/strategies/usageSnippets';
import {
  fetchWhereUsedReferences,
  presentScopeOptions,
  type WhereUsedListRead,
  type WhereUsedListResult,
  type WhereUsedRow,
  type WhereUsedRows,
  type WhereUsedSource,
  whereUsedOn,
  whereUsedRows,
  withUsageSnippets,
} from '../../../lib/strategies/whereUsedList';
import { return_error } from '../../../lib/utils';
import { byVariant } from '../../../lib/variantDefinition';
import type { XmlRead } from '../../../lib/xml/tree';

/** Whose text elements `PROG/PX` names, as the tool takes it. */
export type TextElementsContainer = 'program' | 'function_group';

/**
 * `container`: whose text elements `PROG/PX` names. Where-used of a
 * program's and of a function group's text elements answered
 * `globalType="PROG/PX"` on premise and on the cloud (measured,
 * `texts-translation.md` §11, §12.6, §13.6); the address decides which.
 */
export const CONTAINER_FIELD = z
  .enum(['program', 'function_group'])
  .optional()
  .describe(
    'With object_type PROG/PX, required: whose text elements they are, program or function_group. Taken by PROG/PX alone.',
  );

/** The text elements' where-used code. */
const TEXT_ELEMENTS_CODE = 'PROG/PX' satisfies AdtTypeCode;

/** Whether `type` names the text elements' code, in either case. */
function isTextElementsType(type: string): boolean {
  return type.trim().toUpperCase() === TEXT_ELEMENTS_CODE;
}

/**
 * The refusal of a `container` that does not fit `type`: required with
 * `PROG/PX`, refused with any other type (the library's rule,
 * `IGetWhereUsedParams`); `undefined` when it fits.
 */
export function containerRefusal(
  type: string,
  container: TextElementsContainer | undefined,
): string | undefined {
  if (isTextElementsType(type)) {
    return container === undefined
      ? 'container is required with PROG/PX: program or function_group; nothing was sent'
      : undefined;
  }
  return container === undefined
    ? undefined
    : `container is taken by PROG/PX alone, not by ${type}; nothing was sent`;
}

/** One `objects` entry's `container` against its `object_type`. */
function containerRule(
  entry: { object_type: string; container?: TextElementsContainer | undefined },
  ctx: z.RefinementCtx,
): void {
  const wrong = containerRefusal(entry.object_type, entry.container);
  if (wrong !== undefined)
    ctx.addIssue({ code: 'custom', message: wrong, path: ['container'] });
}

/**
 * The where-used target of `name`, `code` and `container`, as the library
 * takes it: `PROG/PX` with its container, any other code alone. A
 * container that does not fit the code is refused in fixed words.
 */
export function whereUsedTargetOf(
  name: string,
  code: WhereUsedCode<ProjectionVariant>,
  container: TextElementsContainer | undefined,
): IAdtWhereUsedScopeParamsOf | string {
  const wrong = containerRefusal(code, container);
  if (wrong !== undefined) return wrong;
  if (code === 'PROG/PX') {
    return {
      object_name: name,
      object_type: code,
      container: container === 'function_group' ? 'functionGroup' : 'program',
    };
  }
  return { object_name: name, object_type: code };
}

/**
 * The URI of a row whose name and type do not tell where it is — one SAP
 * listed without a name, or without a type and with no node of the list at
 * its `parentUri` — as SAP sent it; `''` for any other.
 */
function untoldUri(row: WhereUsedRow) {
  return row.name === '' || row.type === '' ? (row.uri ?? '') : '';
}

/**
 * The object a usage in a method or section belongs to, as its `# in`
 * line names it — `TYPE NAME` —; `''` for a row that names no element.
 */
function ownerOf(row: WhereUsedRow): string {
  return row.element === undefined ? '' : `${row.type} ${row.name}`;
}

/** The lists a WhereUsedRows listing writes: what its description states. */
export const WHERE_USED_LISTS: RowSchemas<WhereUsedRows> = {
  references: about(
    'for each object that uses it, under its package',
    rows('references', {
      columns: [
        {
          name: 'type',
          means: 'its type (a usage in a method or section: on its # in line)',
          cell: (row: WhereUsedRow) => (ownerOf(row) === '' ? row.type : ''),
        },
        {
          name: 'name',
          means: 'its name (a usage in a method or section: on its # in line)',
          cell: (row: WhereUsedRow) => (ownerOf(row) === '' ? row.name : ''),
        },
        {
          name: 'element',
          means:
            'the method or section the use is in, under the # in line of the object it belongs to',
          cell: (row: WhereUsedRow) => row.element ?? '',
        },
        {
          name: 'uri',
          means: 'its URI when SAP lists it without a name or a type',
          cell: untoldUri,
        },
        {
          name: 'usage',
          means: 'how it uses the object, where SAP tells it',
          cell: (row: WhereUsedRow) =>
            row.usage_information === COMMON_USAGE
              ? ''
              : (row.usage_information ?? ''),
        },
        {
          name: 'code',
          means: 'the source line the use is on, where it is in code',
          cell: (row: WhereUsedRow) => row.code ?? '',
        },
      ],
      header: 'always',
      groups: [
        {
          label: 'package',
          of: (row: WhereUsedRow) => row.package_name ?? '',
          mode: 'gathered',
        },
        // A usage in a method or section under one line naming the object
        // it belongs to by its type and name, written once; every other
        // usage a plain row, before those lines.
        {
          label: 'in',
          of: ownerOf,
          mode: 'gathered',
          unless: '',
        },
      ],
      // The terse shape (approved): usages only — the package and
      // container nodes of SAP's tree carry no usage, and leave.
      omit: omitting(
        (row: WhereUsedRow) =>
          row.usage_information === undefined ? 'node' : 'usage',
        {
          node: 'the packages and containers SAP groups the usages under are left out',
        },
      ),
    }),
  ),
};

/** The head every where-used listing opens with. */
export const WHERE_USED_HEADS = [
  headShape('total', 'how many references SAP counts'),
];

export const TOOL_DEFINITION = {
  name: 'GetWhereUsed',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: toolDescription({
      tag: 'read-only',
      purpose: purpose(
        'Reads where an ABAP class, function module, table or other repository object is used: every object that uses, calls or references it.',
      ),
      notes: [longRunning],
    }),
    inputSchema: whereUsedSchema(variant, variant),
  })),
  // No variant stated: its type list unread (the call reads it).
  inputSchema: whereUsedSchema('onprem', undefined),
} as const;

/**
 * GetWhereUsed's input, described on `variant`, its type list read on
 * `rules` (none: unread), its in-the-call twin beside it.
 */
function whereUsedSchema(variant: ProjectionVariant, rules: RuleVariant) {
  const fields = whereUsedFields(variant);
  const rule = oneWhereUsedForm(rules);
  return withInCallSchema(
    z
      .object({ background: LONG_BACKGROUND_FIELD, ...fields })
      .superRefine(rule),
    z.object(fields).superRefine(rule),
  );
}

/**
 * One object — `object_name` and `object_type`, not blank, the type one
 * `variant` takes — or a non-empty `objects` alone.
 */
function oneWhereUsedForm(variant: RuleVariant) {
  return (
    args: {
      object_name?: string | undefined;
      object_type?: string | undefined;
      container?: TextElementsContainer | undefined;
      objects?: readonly object[] | undefined;
    },
    ctx: z.RefinementCtx,
  ): void => {
    const refuse = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (args.objects === undefined) {
      if (!stated(args.object_name)) {
        refuse('Object name is required', 'object_name');
      } else if (!stated(args.object_type)) {
        refuse('Object type is required', 'object_type');
      } else if (
        variant !== undefined &&
        whereUsedCodeOn(variant, args.object_type) === undefined
      ) {
        refuse(notWhereUsedOn(variant, args.object_type), 'object_type');
      } else {
        const wrong = containerRefusal(args.object_type, args.container);
        if (wrong !== undefined) refuse(wrong, 'container');
      }
      return;
    }
    if (args.container !== undefined) {
      refuse(
        'container goes in each objects entry beside its object_type',
        'container',
      );
    }
    if (
      args.object_name !== undefined ||
      args.object_type !== undefined ||
      args.objects.length === 0
    ) {
      refuse(
        'Give exactly one of object_name and object_type, or objects (a non-empty list of { object_name, object_type })',
        'objects',
      );
    }
  };
}

/** GetWhereUsed's arguments on `variant` but `background`. */
function whereUsedFields(variant: ProjectionVariant) {
  return {
    object_name: z
      .string()
      .optional()
      .describe(
        "Name of the ABAP object (with object_type; or give objects). For function modules the name MUST be in the form 'GROUP|FM_NAME' (function group name, pipe, function module name).",
      ),
    object_type: z
      .string()
      .optional()
      .describe(whereUsedTypeDescription(variant)),
    container: CONTAINER_FIELD,
    objects: z
      .array(
        z
          .object({
            object_name: z
              .string()
              .describe(
                "Name of the ABAP object; a function module as 'GROUP|FM_NAME'",
              ),
            object_type: z
              .string()
              .describe('Type of the ABAP object, as object_type takes it'),
            container: CONTAINER_FIELD,
          })
          .superRefine(containerRule),
      )
      .optional()
      .describe(
        'Several objects, read together (give this or object_name and object_type). The type filters apply to every object.',
      ),
    enable_all_types: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        "If true, expands the scope to all available object types (Eclipse 'select all' behavior) by flipping every isSelected flag in the scope XML. Default: false (SAP default scope). Note: on large systems this can make the search significantly slower.",
      ),
    enable_only_types: z
      .array(z.string())
      .optional()
      .describe(
        "Restrict the search to ONLY these ADT object types (e.g. ['TABL/DS','TABL/DT'] for structures, ['DDLS/DF'] for CDS sources). SAP applies the selection server-side, so unwanted types (e.g. hundreds of CLAS/OC) are never searched nor returned — use this instead of enable_all_types to avoid huge result sets. Values must be object-type codes from THIS object's where-used scope (the searchable categories, e.g. 'CLAS/OC','INTF/OI','FUGR/FF','DDLS/DF', not result-row codes like 'FUGR/F'). If any value is not searchable for the object the call returns an error listing the supported types — it never falls back to the unfiltered default set. Takes precedence over enable_all_types.",
      ),
    disable_types: z
      .array(z.string())
      .optional()
      .describe(
        "Remove these ADT object types from the default scope, keeping the rest (e.g. ['CLAS/OC'] to drop class usages). Applied on top of the default scope or of enable_only_types/enable_all_types.",
      ),
    ...ASSEMBLED_DETAIL_SHAPE,
  };
}

type WhereUsedArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The boundary of `object_type` on the variant declared for `connection`: a
 * where-used code (`WHERE_USED_CODES`), a name standing for one
 * (`WHERE_USED_NAMES`) or a main type or search name one where-used code
 * has, by the case rule of {@link acceptedCodeOf};
 * `undefined` for any other text.
 */
function whereUsedCodeOf(connection: object, text: string) {
  return whereUsedCodeOn(variantOf(connection), text);
}

/** {@link whereUsedCodeOf} on `variant`. */
function whereUsedCodeOn(variant: ProjectionVariant, text: string) {
  return acceptedCodeOf(
    text,
    WHERE_USED_CODES[variant],
    WHERE_USED_NAMES[variant],
  );
}

/** The refusal of an `object_type` outside its projection: what it takes. */
function notWhereUsed(connection: object, text: string): string {
  return notWhereUsedOn(variantOf(connection), text);
}

/** {@link notWhereUsed} on `variant`. */
function notWhereUsedOn(variant: ProjectionVariant, text: string): string {
  return notAccepted(
    'object_type',
    text,
    [...WHERE_USED_CODES[variant], ...WHERE_USED_NAMES[variant]],
    WHERE_USED_CODES[variant],
  );
}

/** The usage most usages carry: its cell is left empty at terse. */
const COMMON_USAGE = 'gradeDirect,includeProductive';

/** What a level formats: the list read, and the arguments it was read for. */
interface WhereUsedRead {
  result: WhereUsedListRead;
  args: WhereUsedArgs;
}

/** {@link fullWhereUsed} as the JSON value the cache keeps. */
function fullWhereUsedJson(
  result: WhereUsedListResult,
  args: WhereUsedArgs,
): JsonValue {
  const full = fullWhereUsed(result, args);
  return jsonFields({ ...full, references: full.references.map(jsonFields) });
}

/** The answer GetWhereUsed gave before `detail`: `full`. */
function fullWhereUsed(result: WhereUsedListResult, args: WhereUsedArgs) {
  return {
    object_name: args.object_name,
    object_type: args.object_type,
    container: args.container,
    enable_all_types: args.enable_all_types || false,
    enable_only_types: args.enable_only_types,
    disable_types: args.disable_types,
    total_references: result.totalReferences,
    result_description: result.resultDescription,
    references: result.references,
  };
}

/**
 * The usages as TSV, grouped by package (terse). A reference is a usage when
 * SAP gave it `usageInformation`; the package and container nodes of its
 * tree carry none, and leave — each usage names its package on the group
 * line. Every usage is answered: nothing is cut.
 */
function whereUsedListing(result: WhereUsedRows): Listing<WhereUsedRows> {
  return {
    heads: [{ head: 'total', value: String(result.totalReferences) }],
    reading: result,
    lists: WHERE_USED_LISTS,
  };
}

/**
 * What GetWhereUsed answers at each `detail`, selected before the requests
 * (`src/lib/detail`): terse the usages ({@link whereUsedListing}, its nodes an `omit` kind); medium every
 * reference with every field read, without its uri; full the answer before
 * `detail`; raw SAP's document. The list is adt-strategies'
 * `utilWhereUsedReferences` (the util set's where-used slot), package nodes
 * kept.
 */
const WHERE_USED_ANSWERS: ListAnswerTable<WhereUsedRead, string | object> = {
  // Every usage (terse) or reference (medium, full), written from the
  // list's own references by the listing writers.
  terse: ({ result }) => writeListing(whereUsedListing(whereUsedRows(result))),
  medium: ({ result }) =>
    writeJson(
      {
        total_references: result.totalReferences,
        result_description: result.resultDescription,
      },
      whereUsedRows(result),
      {
        // Every row (`usageRows`: one per code line) with every field but
        // the URIs — the URI kept for a row SAP listed without a name or a
        // type, what tells it apart.
        references: entries('references', (row: WhereUsedRow) => {
          const { uri, parent_uri, ...fields } = row;
          return untoldUri(row) === '' || uri === undefined
            ? fields
            : { ...fields, uri };
        }),
      },
    ),
  // The answer before `detail`, as it is.
  full: ({ result, args }) => fullWhereUsed(result, args),
  raw: ({ result }) => result.document,
};

/**
 * Returns where-used references for ABAP objects using AdtClient utilities.
 */
async function whereUsedOf(
  context: HandlerContext,
  args: WhereUsedArgs,
): Promise<McpResult> {
  const { connection, logger } = context;

  if (!args?.object_name) {
    return return_error('Object name is required');
  }
  if (!args?.object_type) {
    return return_error('Object type is required');
  }
  const objectType = whereUsedCodeOf(connection, args.object_type);
  if (objectType === undefined) {
    return return_error(notWhereUsed(connection, args.object_type));
  }
  const target = whereUsedTargetOf(
    args.object_name,
    objectType,
    args.container,
  );
  if (typeof target === 'string') return return_error(target);

  const typedArgs = {
    ...args,
    object_name: args.object_name,
    object_type: args.object_type,
  };
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
    const scopeResponse = await withAdtHeaders(
      context,
      'utils.getWhereUsedScope',
      (headers) =>
        utils.getWhereUsedScope(target, {
          headers,
          analyse: analyseException,
        }),
    );
    if (!scopeResponse.ok) {
      return answerFailure(
        withStep(scopeResponse.getError(), 'read where-used scope'),
        { tool: 'GetWhereUsed', detail: detailOf(args) },
      );
    }
    const scopeXml = scopeResponse.getResult().value?.raw ?? '';
    const available = new Set<string>(whereUsedScopeTypesOf(scopeXml));
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

  const shown = listAnswerAt(WHERE_USED_ANSWERS, levelOf(args));
  return answer(
    { tool: 'GetWhereUsed', detail: detailOf(args) },
    // The usages, then ONE read of their code lines (`withUsageSnippets`).
    async () =>
      withUsageSnippets(
        await fetchWhereUsedReferences(whereUsedOn(context, utils), {
          ...target,
          enableAllTypes: typedArgs.enable_all_types,
          enableOnlyTypes: typedArgs.enable_only_types,
          disableTypes: typedArgs.disable_types,
        }),
        usageSnippetsOn(context, connection),
      ),
    (result: WhereUsedListRead) => {
      // The cache keeps the full answer, whatever the level answered.
      objectsListCache.setCache({
        isError: false,
        content: [{ type: 'json', json: fullWhereUsedJson(result, typedArgs) }],
      });
      readsOf.set(args, { result, args: typedArgs });
      return shown({ result, args: typedArgs });
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
function refusesCredential<T>(
  result: PhaseResult<IAdtResponse<T, IAdtError>> | undefined,
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
  given: WhereUsedArgs,
  scope: PhaseResult<IAdtResponse<AdtReading<XmlRead>, IAdtError>> | undefined,
  references:
    | PhaseResult<IAdtResponse<WhereUsedListRead, IAdtError>>
    | undefined,
) {
  const { connection, logger } = context;
  if (!given?.object_name) {
    return return_error('Object name is required');
  }
  if (!given?.object_type) {
    return return_error('Object type is required');
  }
  const typedArgs = {
    ...given,
    object_name: given.object_name,
    object_type: given.object_type,
  };
  const objectType = whereUsedCodeOf(connection, typedArgs.object_type);
  if (objectType === undefined) {
    return return_error(notWhereUsed(connection, typedArgs.object_type));
  }
  const target = whereUsedTargetOf(
    typedArgs.object_name,
    objectType,
    typedArgs.container,
  );
  if (typeof target === 'string') return return_error(target);
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
        { tool: 'GetWhereUsed', detail: detailOf(given) },
      );
    }
    const unknown = unsearchable(typedArgs, scopeResponse);
    if (unknown !== undefined) return return_error(unknown);
  }
  const shown = listAnswerAt(WHERE_USED_ANSWERS, levelOf(given));
  return answer(
    { tool: 'GetWhereUsed', detail: detailOf(given) },
    // The usages, then ONE read of their code lines (`withUsageSnippets`).
    async () =>
      withUsageSnippets(
        await fetchWhereUsedReferences(
          {
            getWhereUsedScope: () => answered(scope),
            modifyWhereUsedScope: (scopeXml, options) =>
              utils.modifyWhereUsedScope(
                scopeXml,
                presentScopeOptions(options),
              ),
            getWhereUsed: () => answered(references),
          },
          {
            ...target,
            enableAllTypes: typedArgs.enable_all_types,
            enableOnlyTypes: typedArgs.enable_only_types,
            disableTypes: typedArgs.disable_types,
          },
        ),
        usageSnippetsOn(context, connection),
      ),
    (result: WhereUsedListRead) => {
      // The cache keeps the full answer, whatever the level answered.
      objectsListCache.setCache({
        isError: false,
        content: [{ type: 'json', json: fullWhereUsedJson(result, typedArgs) }],
      });
      readsOf.set(given, { result, args: typedArgs });
      return shown({ result, args: typedArgs });
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
  scopeResponse: IAdtResponse<AdtReading<XmlRead>, IAdtError> & { ok: true },
): string | undefined {
  const scopeXml = scopeResponse.getResult().value?.raw ?? '';
  const available = new Set<string>(whereUsedScopeTypesOf(scopeXml));
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
  // A target without a name, or whose type is no code of the tables, is
  // sent nothing; `whereUsedFromAnswers` answers it with its refusal.
  const readable = targets.flatMap((target, i) => {
    const name = target.object_name;
    const code = name
      ? whereUsedCodeOf(context.connection, target.object_type ?? '')
      : undefined;
    const asked =
      !name || code === undefined
        ? undefined
        : whereUsedTargetOf(name, code, target.container);
    return asked === undefined || typeof asked === 'string'
      ? []
      : [{ target, i, asked }];
  });
  const params = (entry: { asked: IAdtWhereUsedScopeParamsOf }) => entry.asked;
  type Answered = PhaseResult<IAdtResponse<AdtReading<XmlRead>, IAdtError>>;
  type Listed = PhaseResult<IAdtResponse<WhereUsedListRead, IAdtError>>;
  const scopes = new Map<number, Answered>();
  const references = new Map<number, Listed>();
  const ended = <T>(
    answers: Map<number, PhaseResult<IAdtResponse<T, IAdtError>>>,
    step: string,
  ): number | undefined =>
    readable.find(({ i }) => refusesCredential(answers.get(i), step))?.i;
  // With every read in (the last phase), the objects before the one that
  // ends the call are answered first, as the sequential version answers them
  // before it meets the refusal: the cache holds what its cache holds.
  const endWith = async (
    i: number,
    answeredBefore: boolean,
  ): Promise<WhereUsedOutcome> => {
    for (const { target, i: j } of answeredBefore ? readable : []) {
      if (j >= i) break;
      await whereUsedFromAnswers(
        context,
        target,
        scopes.get(j),
        references.get(j),
      );
    }
    return {
      ended: await whereUsedFromAnswers(
        context,
        targets[i],
        scopes.get(i),
        references.get(i),
      ),
    };
  };

  let searched = readable;
  if (readsScope(filter)) {
    let read: Answered[];
    try {
      read = await runPhase(context, readable, (entry, batch) => {
        if (validatesScope(filter)) {
          return withAdtHeaders(context, 'utils.getWhereUsedScope', (headers) =>
            utilsOn(batch).getWhereUsedScope(params(entry), {
              headers,
              analyse: analyseException,
            }),
          );
        }
        // Sent as `fetchWhereUsedReferences` sends it, through the members
        // it names (`WhereUsedSource`).
        const source: WhereUsedSource = whereUsedOn(context, utilsOn(batch));
        return source.getWhereUsedScope(params(entry));
      });
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
    if (refused !== undefined) return endWith(refused, false);
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
    let read: Listed[];
    try {
      read = await runPhase(context, searched, (entry, batch) => {
        const { i } = entry;
        // Sent as `fetchWhereUsedReferences` sends it, through the members
        // it names (`WhereUsedSource`).
        const utils: WhereUsedSource = whereUsedOn(context, utilsOn(batch));
        const scope = scopes.get(i);
        const scoped = scope?.ok === true ? scope.value : undefined;
        if (scoped === undefined || !scoped.ok) {
          return utils.getWhereUsed(params(entry));
        }
        return utils.getWhereUsed({
          ...params(entry),
          scopeXml: utils.modifyWhereUsedScope(
            scoped.getResult().value?.raw ?? '',
            {
              enableAll: filter.enable_all_types,
              enableOnly: filter.enable_only_types,
              disable: filter.disable_types,
            },
          ),
        });
      });
    } catch (error) {
      if (failureOf(error) === undefined) throw error;
      return { ended: answerThrown(error, WHERE_USED_CONTEXT) };
    }
    searched.forEach(({ i }, at) => {
      const result = read[at];
      if (result !== undefined) references.set(i, result);
    });
    const refused = ended(references, 'read where-used');
    if (refused !== undefined) return endWith(refused, true);
  }

  const answers: McpResult[] = [];
  for (const [i, target] of targets.entries()) {
    answers.push(
      await whereUsedFromAnswers(
        context,
        target,
        scopes.get(i),
        references.get(i),
      ),
    );
  }
  return { answers };
}

const WHERE_USED_CONTEXT = { tool: 'GetWhereUsed', detail: 'terse' } as const;

/**
 * Each object's list as its single answer read it, by the target it was
 * asked as: a list call writes every object's usages from these through
 * `Written`, never by splicing the single answers' texts.
 */
const readsOf = new WeakMap<WhereUsedArgs, WhereUsedRead>();

/** Whether an answer is a credential failure: it ends a call for several objects. */
function endsList(result: McpResult): boolean {
  const failed = failedPayloadOf(result, 'read where-used');
  return failed !== undefined && isCredentialPayload(failed);
}

/** What a list call answers from: the entries asked, and each one's answer. */
interface ListOf {
  readonly objects: ReadonlyArray<{
    readonly object_name: string;
    readonly object_type: string;
  }>;
  readonly targets: readonly WhereUsedArgs[];
  readonly results: readonly McpResult[];
}

/**
 * A list call's answer at each `detail`, selected through the table like
 * every other answer: terse one text written by the listing writer, the other
 * levels a JSON array of the entries.
 */
const LIST_ANSWERS: ListAnswerTable<ListOf, McpResult> = {
  terse: terseList,
  medium: jsonList,
  full: (list) => jsonList(list).answer,
  raw: (list) => jsonList(list).answer,
};

/** A list call's answer: one entry per asked, in the order asked, at the level asked. */
function listAnswer(
  objects: ReadonlyArray<{
    readonly object_name: string;
    readonly object_type: string;
  }>,
  targets: readonly WhereUsedArgs[],
  results: readonly McpResult[],
  level: DetailLevel,
): McpResult {
  return listAnswerAt(LIST_ANSWERS, level)({ objects, targets, results });
}

/** The rows of a list read, when there is one. */
function rowsOf(
  read: WhereUsedListResult | undefined,
): WhereUsedRows | undefined {
  return read === undefined ? undefined : whereUsedRows(read);
}

/** A list call's terse text. */
function terseList({ objects, targets, results }: ListOf): Written<TextResult> {
  // Every object's text written by the listing writer: its name escaped in
  // its `# object` line, its usages as its own terse listing, a failure as
  // one escaped `# error` line — a name cannot add a row.
  const text = writeListing({
    heads: [],
    reading: {
      answered: results.map((result, i) => ({
        asked: objects[i],
        answer: answerPayload(result),
        read: rowsOf(
          result.isError ? undefined : readsOf.get(targets[i] ?? {})?.result,
        ),
      })),
    },
    lists: {
      answered: partsOf(
        'answered',
        ({ asked, answer, read }: AnsweredObject): Head[] => [
          {
            head: 'object',
            value: `${asked?.object_type ?? ''} ${asked?.object_name ?? ''}`,
          },
          ...(read === undefined
            ? [
                {
                  head: 'error',
                  value: JSON.stringify(answer),
                },
              ]
            : []),
        ],
        'read',
        byListing(WHERE_USED_LISTS, whereUsedListing),
      ),
    },
  });
  return asTextResult(text);
}

/** One object of a list call: what was asked, its answer, and its read when answered. */
interface AnsweredObject {
  readonly asked: ListOf['objects'][number] | undefined;
  readonly answer: JsonValue;
  readonly read: WhereUsedRows | undefined;
}

/** A list call's entries as a JSON array. */
function jsonList({ objects, targets, results }: ListOf): Written<TextResult> {
  // Every answer one entry, written by the listing writer.
  return asJsonResult(
    writeJsonList(
      { answered: results.map(listedAnswer) },
      values('answered', ({ isError, answer, i }: ListedAnswer) =>
        ((isError, answer, i) => {
          const asked = objects[i];
          return isError
            ? {
                object_name: asked.object_name,
                object_type: asked.object_type,
                error: answer,
              }
            : answer;
        })(isError, answer, i),
      ),
    ),
  );
}

/**
 * SAP ignores the group of a function module's address (#2): every
 * `GROUP|FM_NAME` target's group is checked against the module's metadata,
 * one read each, before any scope, reference or batch request. The first
 * refusal is the call's answer; `undefined` when every group holds its
 * module (or no target names a module).
 */
async function refusedModule(
  context: HandlerContext,
  targets: readonly WhereUsedArgs[],
): Promise<McpResult | undefined> {
  const references = targets.flatMap((target) => {
    const name = target?.object_name;
    const type = target?.object_type;
    if (!name || !type) return [];
    const code = whereUsedCodeOf(context.connection, type);
    const [group, module, ...more] = name.split('|');
    if (code === undefined || more.length > 0 || !group || !module) return [];
    return [{ type: code, name: module, parentName: group }];
  });
  const refused = await checkModuleReferences(context, references);
  return refused === undefined
    ? undefined
    : answerFailure(refused.getError(), WHERE_USED_CONTEXT);
}

/** One answer of the batched version: an object's, or the one that ended the call. */
const onlyAnswer = (outcome: WhereUsedOutcome): McpResult =>
  'ended' in outcome ? outcome.ended : outcome.answers[0];

/**
 * Where-used lists of one object or several, read in ADT batch envelopes
 * where a call sends more than one request; the sequential reads where the
 * destination has no communication batch. One object without a type filter
 * is one request, sent as itself.
 *
 * At `raw` what ADT sent: the documents the call's reads answered, read
 * with the tool at full (`wireAnswer`, `src/lib/detail/wire.ts`).
 */
export async function handleGetWhereUsed(
  context: HandlerContext,
  args: WhereUsedArgs,
) {
  // Every call assembles reads — the scope with the usages, or several
  // objects: at `raw` the array of the documents, whatever the call.
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetWhereUsed',
        shape: 'assembled',
      },
      () => answeredGetWhereUsed(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetWhereUsed(context, args);
}

async function answeredGetWhereUsed(
  context: HandlerContext,
  args: WhereUsedArgs,
) {
  // The schema holds the rule: one object, or a non-empty `objects`.
  const listed = args?.objects;
  if (listed === undefined) {
    const refused = await refusedModule(context, [args]);
    if (refused !== undefined) return refused;
    if (!args?.object_name || !args?.object_type || !readsScope(args)) {
      return whereUsedOf(context, args);
    }
    return withSequentialFallback<McpResult>(
      context,
      async () => onlyAnswer(await whereUsedInEnvelopes(context, [args], args)),
      () => whereUsedOf(context, args),
    );
  }
  const objects = listed.map((o) => ({
    object_name: o?.object_name,
    object_type: o?.object_type,
    container: o?.container,
  }));
  const { objects: _list, ...rest } = args;
  const targets: WhereUsedArgs[] = objects.map((o) => ({ ...rest, ...o }));
  const refused = await refusedModule(context, targets);
  if (refused !== undefined) return refused;
  return withSequentialFallback<McpResult>(
    context,
    async () => {
      const outcome = await whereUsedInEnvelopes(context, targets, args);
      return 'ended' in outcome
        ? outcome.ended
        : listAnswer(objects, targets, outcome.answers, levelOf(args));
    },
    async () => {
      // One object after another, each as the single call reads it; a
      // credential failure ends the call, and nothing after it is read.
      const results: McpResult[] = [];
      for (const target of targets) {
        const result = await whereUsedOf(context, target);
        if (endsList(result)) return result;
        results.push(result);
      }
      return listAnswer(objects, targets, results, levelOf(args));
    },
  );
}
