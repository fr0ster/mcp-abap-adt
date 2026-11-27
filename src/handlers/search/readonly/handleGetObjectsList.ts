import { readExceptionRefusal } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { notATableType, tableTypeOf } from '../../../lib/adtTypeCode';
import {
  longRunning,
  purpose,
  toolDescription,
} from '../../../lib/description';
import {
  about,
  byListing,
  entries,
  type Head,
  headShape,
  type ListAnswerTable,
  type Listing,
  listAnswerAt,
  listWrittenAt,
  marks,
  partsOf,
  type RowSchemas,
  rows,
  type Written,
  wireAnswer,
  writeJson,
  writeJsonList,
  writeListing,
  writeWhole,
  writtenValues,
} from '../../../lib/detail';
import {
  onEveryVariant,
  type RuleVariant,
  stated,
  withInCallSchema,
} from '../../../lib/handlers/argumentRules';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { succeeded } from '../../../lib/strategies/stepResponse';

/** GetObjectsList's arguments but `background`. */
const FIELDS = {
  parent_name: z
    .string()
    .optional()
    .describe(
      '[read-only] Parent object name (with parent_tech_name and parent_type; or give objects)',
    ),
  parent_tech_name: z
    .string()
    .optional()
    .describe('[read-only] Parent technical name'),
  parent_type: z
    .string()
    .optional()
    .describe('[read-only] Parent object type (e.g. PROG/P, FUGR)'),
  objects: z
    .array(
      z.object({
        parent_type: z
          .string()
          .describe('Parent object type (e.g. PROG/P, FUGR)'),
        parent_name: z.string().describe('Parent object name'),
      }),
    )
    .optional()
    .describe(
      '[read-only] Several parents, read together (give this or parent_name)',
    ),
  with_short_descriptions: z
    .boolean()
    .optional()
    .describe(
      "[read-only] With detail medium or full: read each object's description from its metadata (default: true)",
    ),
  ...ASSEMBLED_DETAIL_SHAPE,
};

type ObjectsListFields = z.output<z.ZodObject<typeof FIELDS>>;

/**
 * The rules of a call: a non-empty `objects` alone, each entry with its
 * type and name; else `parent_name`, `parent_tech_name` and `parent_type`,
 * none blank; on a stated variant every parent type one of its table's.
 */
function objectsListRules(variant: RuleVariant) {
  return (args: ObjectsListFields, ctx: z.RefinementCtx): void => {
    const refuse = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    const typeOf = (argument: string, text: string) => {
      if (variant !== undefined && tableTypeOf(text, variant) === undefined) {
        refuse(notATableType(argument, text, variant), argument);
      }
    };
    const { parent_name, parent_tech_name, parent_type, objects } = args;
    if (objects !== undefined && objects.length > 0) {
      if (
        parent_name !== undefined ||
        parent_tech_name !== undefined ||
        parent_type !== undefined
      ) {
        refuse(
          'Give exactly one of parent_name, parent_tech_name and parent_type, or objects',
          'objects',
        );
        return;
      }
      for (const entry of objects) {
        if (!stated(entry.parent_type) || !stated(entry.parent_name)) {
          refuse(
            'Each entry of objects needs parent_type and parent_name (non-empty strings).',
            'objects',
          );
          return;
        }
      }
      for (const entry of objects) {
        typeOf('objects[].parent_type', entry.parent_type);
      }
      return;
    }
    if (!stated(parent_name)) {
      refuse(
        'Parameter "parent_name" (string) is required and cannot be empty.',
        'parent_name',
      );
    } else if (!stated(parent_tech_name)) {
      refuse(
        'Parameter "parent_tech_name" (string) is required and cannot be empty.',
        'parent_tech_name',
      );
    } else if (!stated(parent_type)) {
      refuse(
        'Parameter "parent_type" (string) is required and cannot be empty.',
        'parent_type',
      );
    } else {
      typeOf('parent_type', parent_type);
    }
  };
}

/** The schema on `variant`, `background` listed; its in-the-call twin beside it. */
function schemaOn(variant: RuleVariant) {
  const rules = objectsListRules(variant);
  return withInCallSchema(
    z
      .object({ background: LONG_BACKGROUND_FIELD, ...FIELDS })
      .superRefine(rules),
    z.object(FIELDS).superRefine(rules),
  );
}

/** The lists one parent's listing writes: what its description states. */
export const OBJECTS_LIST_LISTS: RowSchemas<ParentList> = {
  objects: about(
    'for each object inside it',
    rows('objects', {
      columns: [
        {
          name: 'type',
          means: 'its type',
          cell: (o: FlatObject) => o.OBJECT_TYPE,
        },
        {
          name: 'name',
          means: 'its name',
          cell: (o: FlatObject) => o.OBJECT_NAME,
        },
        {
          name: 'tech_name',
          means: 'its technical name where it differs',
          cell: (o: FlatObject) =>
            o.TECH_NAME !== undefined && o.TECH_NAME !== o.OBJECT_NAME
              ? o.TECH_NAME
              : '',
        },
        {
          name: 'uri',
          means: 'its URI when SAP lists it nameless',
          cell: (o: FlatObject) =>
            o.OBJECT_NAME === '' ? (o.OBJECT_URI ?? '') : '',
        },
      ],
      header: 'always',
    }),
  ),
  // An object whose metadata read SAP refused, its row above: SAP's error on
  // a line of its own, so a row left without its type never hides why.
  refused: about(
    'for each object whose metadata read SAP refused, its error: SAP\'s status and message',
    marks('refused', 'metadata_error', (o: FlatObject) => [
      o.OBJECT_TYPE,
      o.OBJECT_NAME,
      o.OBJECT_URI ?? '',
      JSON.stringify(o.METADATA_ERROR ?? {}),
    ]),
  ),
};

/** The heads every parent's listing opens with: the parent's own facts. */
export const OBJECTS_LIST_HEADS = [
  headShape('parent', 'type and name'),
  headShape('total', 'number of objects'),
  headShape('refused', 'number of objects whose metadata read SAP refused'),
];

/** Whose facts the heads tell. */
export const OBJECTS_LIST_OF = "the parent's";

export const TOOL_DEFINITION = {
  name: 'GetObjectsList',
  available_in: ['onprem', 'cloud'] as const,
  ...onEveryVariant(
    toolDescription({
      tag: 'read-only',
      purpose: purpose(
        'Reads every object inside an ABAP program, function group, class, package or other composite object, down to its nested includes and subcomponents.',
      ),
      notes: [longRunning],
    }),
    schemaOn,
  ),
} as const;

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  AdtTypeCode,
  IAdtError,
  IAdtFailure,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../../../lib/adtHeaders/withAdtHeaders';
import {
  answer,
  type FailureEntry,
  failureEntry,
  isCredentialPayload,
  thrownEntry,
} from '../../../lib/answer';
import {
  runPhase,
  runPhaseOutcome,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient, variantOf } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { sapAnswerOf } from '../../../lib/leftoverSessions/port';
import {
  type MetadataRead,
  metadataReadOf,
} from '../../../lib/strategies/metadataReads';
import {
  batchReader,
  childNodesOf,
  endsTheCall,
  METADATA_STEP,
  metadataDescriptionOf,
  metadataTypeOf,
  NOT_LOADED_BY_SAP,
  type NodeLevel,
  nodeItemsOf,
  nodeStructureOn,
} from '../../../lib/strategies/packageWalk';
import { rawOf } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { child } from '../../../lib/thrownValue';
import { return_error } from '../../../lib/utils';

function utilsOf(context: HandlerContext) {
  return createAdtClient(context.connection, context.logger).getUtils(ourUtils);
}

type NodeSource = ReturnType<typeof utilsOf>;

/**
 * The cache row shape `handleGetObjectNodeFromCache.ts` (out of this task's
 * scope, untouched) matches on — `OBJECT_TYPE`/`OBJECT_NAME`/`TECH_NAME`,
 * uppercase, the same spelling `handleGetObjectsByType.ts` already writes,
 * `OBJECT_URI` included so that handler's own follow-up-request feature
 * keeps working. `ourUtils.node` (adt-strategies' `utilNodeContents`)
 * carries both `techName` and `uri` where the node does.
 */
interface FlatObject {
  OBJECT_TYPE: string;
  OBJECT_NAME: string;
  TECH_NAME?: string;
  OBJECT_URI?: string;
  /** The short description, where SAP gave one (asked for by default). */
  DESCRIPTION?: string;
  /** A node SAP could not load (`utilNodeContents`' `notLoaded`): its row, named {@link NOT_LOADED_BY_SAP}. */
  NOT_LOADED?: true;
  /**
   * SAP's refusal of the object's metadata read — any status but `401`: a
   * `404` for an object SAP lists and serves no metadata for (a message
   * class left without its T100A row, measured on premise), a `403` on an
   * enhancement's node URI (measured on ABAP cloud, #398) —, SAP's status
   * and message with the step. One object's refusal ends no list.
   */
  METADATA_ERROR?: FailureEntry;
}

function ok(objects: FlatObject[]): IAdtResponse<FlatObject[], IAdtError> {
  return succeeded(objects);
}

/**
 * A level's objects, its nameless ones included; a level SAP could not
 * load is its row, of the node's type — never an empty success.
 */
function flatObjects(level: NodeLevel, nodeType: string): FlatObject[] {
  const objects: FlatObject[] = nodeItemsOf(level).map((o) => ({
    OBJECT_TYPE: o.type,
    OBJECT_NAME: o.name,
    ...(o.techName ? { TECH_NAME: o.techName } : {}),
    ...(o.uri ? { OBJECT_URI: o.uri } : {}),
    // Pass 1 takes identities only, never descriptions: in a batch SAP's
    // node structure assigns texts by row index from a static table every
    // part of the envelope grows (`CL_SEU_ADT_RES_REPO_STRUCTURE`,
    // `get_the_shorttexts`, `INDEX start_tabix + sy-tabix`), so a batched
    // part's descriptions belong to other parts (the owner's decision).
  }));
  // Each node SAP could not load is its own row: two stay two.
  for (const _notLoaded of level.notLoaded ?? []) {
    objects.push({
      OBJECT_TYPE: nodeType,
      OBJECT_NAME: NOT_LOADED_BY_SAP,
      NOT_LOADED: true,
    });
  }
  return objects;
}

/**
 * Walk the node structure recursively, one `fetchNodeStructure` call per
 * node — the same recursion this tool ran before the migration, over
 * `ourUtils.node` (`utilNodeContents`) instead of a hand-rolled XML regex. Every
 * step keeps IAdtResponse's `ok`/`getResult`/`getError` shape rather than
 * throwing, so the FIRST refusal anywhere in the tree — not just at the
 * root — reaches `answer()` and is formatted the same way every other
 * handler in this migration formats one.
 */
async function collectValidObjects(
  context: AdtHeadersContext,
  utils: NodeSource,
  parentType: AdtTypeCode,
  parentName: string,
  nodeId: string,
  withShortDescriptions: boolean,
  visited: Set<string>,
  nodeType: string = parentType,
): Promise<IAdtResponse<FlatObject[], IAdtError>> {
  if (visited.has(nodeId)) return ok([]);
  visited.add(nodeId);

  const response = await withAdtHeaders(
    context,
    'utils.fetchNodeStructure',
    (headers) =>
      utils.fetchNodeStructure(parentType, parentName, {
        headers,
        analyse: analyseException,
        nodeId,
        withShortDescriptions,
      }),
  );
  if (!response.ok) return response;

  const level = response.getResult().value;
  let objects: FlatObject[] = flatObjects(level, nodeType);

  for (const child of childNodesOf(level)) {
    const childResult = await collectValidObjects(
      context,
      utils,
      parentType,
      parentName,
      child.nodeId,
      withShortDescriptions,
      visited,
      child.type,
    );
    if (!childResult.ok) return childResult;
    objects = objects.concat(childResult.getResult().value);
  }

  return ok(objects);
}

/** A parent whose node tree is walked. */
interface Parent {
  type: AdtTypeCode;
  name: string;
}

/** A node of a parent's tree: what its read found, and the child nodes read under it. */
interface ListNode {
  root: number;
  nodeId: string;
  /** The node's type: the parent's at the root, the child node's below. */
  type: string;
  objects: FlatObject[];
  children: ListNode[];
}

/** A parent's read that threw: its throw, as it came. */
interface Thrown {
  ok: false;
  thrown: unknown;
}

/**
 * A parent's walk: its objects, its first refused read as the method
 * answered it, or its throw.
 */
type ParentWalk = IAdtResponse<FlatObject[], IAdtError> | Thrown;

/**
 * Every parent's walk, and the refusal that ended the call when one did: a
 * credential failure SAP answered (a `401`) ends it as it came.
 */
interface ParentWalks {
  walks: ParentWalk[];
  ended?: IAdtFailure;
}

/** A refused read SAP answered with a credential failure. */
function credentialRefused(response: IAdtFailure): boolean {
  return isCredentialPayload(
    failureEntry(response.getError(), 'read node structure'),
  );
}

function flatten(node: ListNode): FlatObject[] {
  return [...node.objects, ...node.children.flatMap(flatten)];
}

/**
 * Every parent's node tree in ADT batch envelopes, level by level (spec
 * §11): per level, the node structure of every node of the level, read
 * together; every child node a level lists is read in the next. Each
 * parent's objects in the order the recursion gives them (a node's own, then
 * each child node's subtree); a parent's first refused read is its answer,
 * and nothing more of it is read. A failure that ends the call is thrown as
 * it came; a credential failure SAP answered ends the reads.
 */
async function walkParentsBatched(
  context: HandlerContext,
  parents: readonly Parent[],
  withShortDescriptions: boolean,
): Promise<ParentWalks> {
  // Each node's structure, as `readNode` reads an analysed request.
  const read = batchReader(context, (node: ListNode, c) => {
    const parent = parents[node.root];
    return nodeStructureOn(
      context,
      createAdtClient(c, context.logger).getUtils(ourUtils),
    ).fetchNodeStructure(parent.type, parent.name, {
      analyse: analyseException,
      nodeId: node.nodeId,
      withShortDescriptions,
    });
  });
  const failures = new Map<number, IAdtFailure | Thrown>();
  const visited = parents.map(() => new Set<string>(['000000']));
  const roots: ListNode[] = parents.map((parent, root) => ({
    root,
    nodeId: '000000',
    type: parent.type,
    objects: [],
    children: [],
  }));

  let level = roots;
  while (level.length > 0) {
    const answers = await read(level);
    const next: ListNode[] = [];
    for (const [i, node] of level.entries()) {
      if (failures.has(node.root)) continue;
      const result = answers[i];
      // A read that threw is its parent's failure; one that ends the call
      // (a credential failure) is thrown as it came.
      if (!result.ok) {
        if (endsTheCall(result.error)) throw result.error;
        failures.set(node.root, { ok: false, thrown: result.error });
        continue;
      }
      const response = result.value;
      if (!response.ok) {
        if (credentialRefused(response)) {
          return { walks: [], ended: response };
        }
        failures.set(node.root, response);
        continue;
      }
      const found = response.getResult().value;
      node.objects = flatObjects(found, node.type);
      const seen = visited[node.root];
      for (const child of childNodesOf(found)) {
        if (seen.has(child.nodeId)) continue;
        seen.add(child.nodeId);
        const sub: ListNode = {
          root: node.root,
          nodeId: child.nodeId,
          type: child.type,
          objects: [],
          children: [],
        };
        node.children.push(sub);
        next.push(sub);
      }
    }
    level = next.filter((node) => !failures.has(node.root));
  }

  return {
    walks: roots.map(
      (root): ParentWalk => failures.get(root.root) ?? ok(flatten(root)),
    ),
  };
}

/**
 * The sequential version — the code path this tool has always had — one
 * parent after another (`collectValidObjects`); a credential failure SAP
 * answered ends the reads, and nothing after it is read.
 */
async function walkParentsSequential(
  context: HandlerContext,
  parents: readonly Parent[],
  withShortDescriptions: boolean,
): Promise<ParentWalks> {
  const utils = utilsOf(context);
  const walks: ParentWalk[] = [];
  for (const parent of parents) {
    let walk: ParentWalk;
    try {
      walk = await collectValidObjects(
        context,
        utils,
        parent.type,
        parent.name,
        '000000',
        withShortDescriptions,
        new Set(),
      );
    } catch (thrown) {
      if (endsTheCall(thrown)) throw thrown;
      walk = { ok: false, thrown };
    }
    if (!walk.ok && !('thrown' in walk) && credentialRefused(walk)) {
      return { walks, ended: walk };
    }
    walks.push(walk);
  }
  return { walks };
}

/** A failed parent walk as an entry: the method's error as it is, with its step. */
function failureOfWalk(walk: IAdtFailure | Thrown): FailureEntry {
  return 'thrown' in walk
    ? thrownEntry(walk.thrown, 'read node structure')
    : failureEntry(walk.getError(), 'read node structure');
}

/** One parent's list as read: the parent asked, and its objects. */
interface ParentList {
  parent_name: string | undefined;
  parent_tech_name?: string | undefined;
  parent_type: string | undefined;
  objects: FlatObject[];
  /** The objects whose metadata read SAP refused (`METADATA_ERROR`), each also among `objects`. */
  refused: FlatObject[];
}

/** A parent's list of `objects`: the ones whose metadata read SAP refused named beside them. */
function parentListOf(
  parent: Pick<ParentList, 'parent_name' | 'parent_tech_name' | 'parent_type'>,
  objects: FlatObject[],
): ParentList {
  return {
    ...parent,
    objects,
    refused: objects.filter((o) => o.METADATA_ERROR !== undefined),
  };
}

/**
 * One parent's objects as TSV, written from its list by `writeListing`:
 * type, name, the technical name where it differs, a nameless one's URI.
 */
function parentListing(list: ParentList): Listing<ParentList> {
  return {
    heads: [
      {
        head: 'parent',
        value: `${list.parent_type ?? ''} ${list.parent_name ?? ''}`,
      },
      { head: 'total', value: String(list.objects.length) },
      { head: 'refused', value: String(list.refused.length) },
    ],
    reading: list,
    lists: OBJECTS_LIST_LISTS,
  };
}

/** An object at medium: every field read, a nameless one's URI. */
const mediumObject = (o: FlatObject) => ({
  type: o.OBJECT_TYPE,
  name: o.OBJECT_NAME,
  ...(o.TECH_NAME !== undefined ? { tech_name: o.TECH_NAME } : {}),
  ...(o.OBJECT_URI !== undefined && o.OBJECT_NAME === ''
    ? { uri: o.OBJECT_URI }
    : {}),
  ...(o.DESCRIPTION !== undefined ? { description: o.DESCRIPTION } : {}),
  ...(o.NOT_LOADED === true ? { not_loaded: true } : {}),
  ...(o.METADATA_ERROR !== undefined
    ? { metadata_error: o.METADATA_ERROR }
    : {}),
});

/**
 * What GetObjectsList answers of one parent at each `detail`, selected
 * before the walk (`src/lib/detail`): terse its objects as TSV (type, name,
 * the technical name only where it differs, a nameless one's URI); medium
 * every field read, a nameless one's URI; full the answer before `detail`.
 * Terse and medium are written from the parent's list by the listing
 * writers, one row or entry per object. Raw never reaches this table: the
 * handler answers it as the responses (`wireAnswer`).
 */
function objectsListAnswers(): ListAnswerTable<ParentList, string | object> {
  const full = (list: ParentList) => ({
    parent_name: list.parent_name,
    ...('parent_tech_name' in list
      ? { parent_tech_name: list.parent_tech_name }
      : {}),
    parent_type: list.parent_type,
    total_objects: list.objects.length,
    refused_objects: list.refused.length,
    objects: list.objects,
  });
  return {
    // Identifier rows: no description at terse (pass 2 reads none there).
    terse: (list) => writeListing(parentListing(list)),
    medium: (list) =>
      writeJson(
        {
          parent_name: list.parent_name,
          parent_type: list.parent_type,
          total_objects: list.objects.length,
          refused_objects: list.refused.length,
        },
        list,
        {
          objects: entries('objects', mediumObject),
          // The objects SAP refused, also among the objects with
          // their metadata_error: named apart, as at terse; none, no member.
          refused: entries('refused', mediumObject, { omitEmpty: true }),
        },
      ),
    // The whole parse, as it is.
    full,
    raw: full,
  };
}

/** A metadata read's answer, or SAP's refusal its read threw (an envelope part's), as the object's error. */
type MetadataAnswer =
  | IAdtResponse<string, IAdtError>
  | { readonly refused: FailureEntry };

/**
 * SAP's message in a refusal's body, as it came: what adt-strategies reads
 * of SAP's exception document (`readExceptionRefusal`); `undefined` when the
 * body is no such document.
 */
function sapMessageIn(body: unknown): string | undefined {
  return readExceptionRefusal(body)?.message;
}

/**
 * Whether SAP's `status` is an object's own refusal: an answer SAP gave that
 * is not a success and not a `401` — a `401` is the credentials', the same
 * for every object, and ends the call.
 */
function objectsOwn(status: number | undefined): status is number {
  return (
    status !== undefined && (status < 200 || status > 299) && status !== 401
  );
}

/**
 * An object whose metadata read SAP refused, as its error: SAP's status and
 * SAP's message as it came, with the step — the same on every path, whether
 * the refusal came as a direct request's answer, its throw, or an envelope
 * part's.
 */
function refusalEntry(status: number, body: unknown): FailureEntry {
  const message = sapMessageIn(body);
  return {
    status,
    ...(message === undefined ? {} : { message }),
    step: METADATA_STEP,
  };
}

/**
 * SAP's refusal in what a metadata read threw — its response's status, read
 * structurally, on the throw or on what it wraps — as the object's error;
 * `undefined` for a throw that ends the call (`endsTheCall`: a credential
 * failure, a `401` SAP answered included) and for one SAP did not answer.
 */
function refusalIn(thrown: unknown): FailureEntry | undefined {
  if (endsTheCall(thrown)) return undefined;
  for (const each of [thrown, child(thrown, 'cause')]) {
    const status = sapAnswerOf(each)?.status;
    if (status === 401) return undefined;
    if (objectsOwn(status)) {
      return refusalEntry(status, child(child(each, 'response'), 'data'));
    }
  }
  return undefined;
}

/** What pass 2 reads: every object's description (medium, full), or only the types SAP left out (terse). */
type SecondPass = 'descriptions' | 'types';

/** One object pass 2 reads, by its list and its place in it, and the read that answers it. */
interface SecondRead {
  readonly list: number;
  readonly index: number;
  readonly read: (
    connection: IAbapConnection,
  ) => Promise<IAdtResponse<string, IAdtError>>;
}

/** What a read by an object's own URI accepts: any document, its type unknown. */
const OWN_URI_ACCEPT = '*/*';

/** An object's metadata read by its own URI: for an object SAP listed without a type. */
function uriRead(uri: string): SecondRead['read'] {
  return atStep(METADATA_STEP, async (connection: IAbapConnection) => {
    const answered = await connection.makeAdtRequest({
      url: uri,
      method: 'GET',
      timeout: 0,
      // Stated, so every path sends the same read: SAP answers a GET
      // without an Accept 400 (measured on premise), and an envelope part
      // carries only the headers given here, where a direct request had the
      // HTTP client's default.
      headers: { Accept: OWN_URI_ACCEPT },
    });
    return succeeded(rawOf(answered));
  });
}

/** An object's metadata read by its type (`metadataReadOf`), its document as text. */
function typedRead(
  context: HandlerContext,
  read: MetadataRead,
): SecondRead['read'] {
  return async (connection) => {
    const answered = await atStep(
      METADATA_STEP,
      read,
    )(createAdtClient(connection, context.logger));
    if (!answered.ok) return answered;
    const value = answered.getResult().value;
    return succeeded(typeof value === 'string' ? value : value.raw);
  };
}

/**
 * The reads pass 2 makes of `lists`: at `types`, each object SAP listed
 * without a type, by its URI; at `descriptions`, every object too, by the
 * metadata read of its type. An object whose type has no metadata read
 * (`metadataReadOf` answers none) and that SAP gave no URI keeps no
 * description: no endpoint answers it here.
 */
function secondReads(
  context: HandlerContext,
  lists: readonly {
    parentType: AdtTypeCode;
    parentName: string;
    objects: readonly FlatObject[];
  }[],
  pass: SecondPass,
): SecondRead[] {
  return lists.flatMap((list, l) =>
    list.objects.flatMap((o, index): SecondRead[] => {
      if (o.NOT_LOADED === true) return [];
      // An object SAP listed without a type or a name is read by its own
      // URI — never an address built from an empty name.
      if (o.OBJECT_TYPE === '' || o.OBJECT_NAME === '') {
        if (pass === 'types' && o.OBJECT_TYPE !== '') return [];
        return o.OBJECT_URI === undefined
          ? []
          : [{ list: l, index, read: uriRead(o.OBJECT_URI) }];
      }
      if (pass === 'types') return [];
      const read = metadataReadOf({
        type: o.OBJECT_TYPE,
        name: o.OBJECT_NAME,
        ...(list.parentType === 'FUGR/F'
          ? { functionGroup: list.parentName }
          : {}),
      });
      if (read !== undefined)
        return [{ list: l, index, read: typedRead(context, read) }];
      return o.OBJECT_URI === undefined
        ? []
        : [{ list: l, index, read: uriRead(o.OBJECT_URI) }];
    }),
  );
}

/**
 * Pass 2: each object's own metadata, read in one batch envelope (the reads
 * are independent GETs), else one by one — the description from there,
 * never from the node structure, and the type for an object SAP listed
 * without one. Every object pass 1 found stays. A read SAP refused — any
 * status but `401` — is that object's: it is answered with SAP's status and
 * message (`METADATA_ERROR`), and the others are read and answered (#398,
 * the owner's decision). A `401`, a credential failure, a failure SAP did
 * not answer and a failed envelope are the call's failure, never an object
 * answered without what it lacks.
 */
async function secondPass(
  context: HandlerContext,
  lists: readonly {
    parentType: AdtTypeCode;
    parentName: string;
    objects: readonly FlatObject[];
  }[],
  pass: SecondPass,
): Promise<IAdtResponse<FlatObject[][], IAdtError>> {
  const reads = secondReads(context, lists, pass);
  const out = lists.map((list) => list.objects.map((o) => ({ ...o })));
  if (reads.length === 0) return succeeded(out);
  const answers = await withSequentialFallback(
    context,
    async () => {
      const { results, envelope } = await runPhaseOutcome(
        context,
        reads,
        (each, batch) => each.read(batch),
      );
      // A failed envelope reaches every part with its own rejection: no
      // part is SAP's answer, so it fails as before — the first part's
      // error, the endpoint's absence included (then the reads go one by
      // one).
      if (envelope.failed) {
        const first = results.find((result) => !result.ok);
        throw first !== undefined && !first.ok ? first.error : envelope.error;
      }
      return results.map((result): MetadataAnswer => {
        if (result.ok) return result.value;
        // A part SAP refused rejects its read: the object's answer. The
        // phase already ends at a 401 part (`runPhaseOutcome`); here it ends
        // the call too.
        const refused = refusalIn(result.error);
        if (refused === undefined) throw result.error;
        return { refused };
      });
    },
    async () => {
      const results: MetadataAnswer[] = [];
      for (const each of reads) {
        try {
          results.push(await each.read(context.connection));
        } catch (thrown) {
          // A read the connection rejects on SAP's refusal: the object's
          // answer, as on the batched path.
          const refused = refusalIn(thrown);
          if (refused === undefined) throw thrown;
          results.push({ refused });
        }
      }
      return results;
    },
  );
  for (const [i, each] of reads.entries()) {
    const answered = answers[i];
    if (answered === undefined) continue;
    const object = out[each.list]?.[each.index];
    if ('refused' in answered) {
      if (object === undefined) continue;
      object.METADATA_ERROR = answered.refused;
      continue;
    }
    if (!answered.ok) {
      const error = answered.getError();
      const status = error.response?.status;
      if (
        object === undefined ||
        !objectsOwn(status) ||
        isCredentialPayload(failureEntry(error, METADATA_STEP))
      ) {
        return answered;
      }
      object.METADATA_ERROR = refusalEntry(status, error.response?.data);
      continue;
    }
    if (object === undefined) continue;
    const document = answered.getResult().value;
    if (object.OBJECT_TYPE === '') {
      const type = metadataTypeOf(document);
      if (type !== undefined) object.OBJECT_TYPE = type;
    }
    if (pass === 'descriptions') {
      const description = metadataDescriptionOf(document);
      if (description !== undefined) object.DESCRIPTION = description;
    }
  }
  return succeeded(out);
}

/** One parent's list, or its walk's failure. */
type ParentOutcome =
  | { readonly list: ParentList }
  | {
      readonly parent_name: string | undefined;
      readonly parent_type: string | undefined;
      readonly error: FailureEntry;
      readonly list?: undefined;
    };

/** What a list call answers from: each parent's outcome, and its level's answer. */
interface ParentLists {
  readonly outcomes: readonly ParentOutcome[];
  readonly shown: (list: ParentList) => Written<string | object>;
}

/** A list call's entries. */
const jsonParents = ({ outcomes, shown }: ParentLists) =>
  writeJsonList(
    { outcomes },
    writtenValues('outcomes', (outcome: ParentOutcome) =>
      outcome.list === undefined ? writeWhole(outcome) : shown(outcome.list),
    ),
  );

/**
 * A list call's answer at each `detail`, selected through the table like
 * every other answer: terse one text written by the listing writer, a failed
 * walk under its escaped `# parent` line and one `# error` line; the other
 * levels the entries.
 */
const PARENT_LISTS: ListAnswerTable<ParentLists, string | object> = {
  terse: ({ outcomes }) =>
    writeListing({
      heads: [],
      reading: { outcomes },
      lists: {
        outcomes: partsOf(
          'outcomes',
          (outcome: ParentOutcome): Head[] =>
            outcome.list !== undefined
              ? []
              : [
                  {
                    head: 'parent',
                    value: `${outcome.parent_type ?? ''} ${outcome.parent_name ?? ''}`,
                  },
                  { head: 'error', value: JSON.stringify(outcome.error) },
                ],
          'list',
          byListing(OBJECTS_LIST_LISTS, parentListing),
        ),
      },
    }),
  medium: jsonParents,
  full: (lists) => jsonParents(lists).answer,
  raw: (lists) => jsonParents(lists).answer,
};

/**
 * The tool's answer; at `raw` what ADT sent — the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleGetObjectsList(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetObjectsList',
        shape: 'assembled',
      },
      () => answeredGetObjectsList(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetObjectsList(context, args);
}

async function answeredGetObjectsList(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  // The schema holds the rules: the forms, the names, the parent types.
  const {
    parent_name,
    parent_tech_name,
    parent_type,
    objects: listed,
    with_short_descriptions,
  } = args;

  const withDescriptions =
    with_short_descriptions !== undefined
      ? Boolean(with_short_descriptions)
      : true;
  const level = levelOf(args);
  // Every object the parent's walk held, written by the listing writers.
  const shown = listAnswerAt(objectsListAnswers(), levelOf(args));
  // Pass 2 at medium and full: every object's description from its own
  // metadata; at terse — or with descriptions declined — only the types
  // SAP left out.
  const pass: SecondPass =
    level !== 'terse' && withDescriptions ? 'descriptions' : 'types';

  if (listed !== undefined && listed.length > 0) {
    const parents: Parent[] = [];
    for (const entry of listed) {
      // The schema accepted the type on this variant: its code. A call that
      // bypassed the schema gets the schema's words.
      const variant = variantOf(context.connection);
      const type = tableTypeOf(entry.parent_type, variant);
      if (type === undefined) {
        return return_error(
          notATableType('objects[].parent_type', entry.parent_type, variant),
        );
      }
      parents.push({ type, name: entry.parent_name.toUpperCase() });
    }
    let read: ParentWalks = { walks: [] };
    return answer(
      { tool: 'GetObjectsList', detail: detailOf(args) },
      async () => {
        read = await withSequentialFallback(
          context,
          () => walkParentsBatched(context, parents, false),
          () => walkParentsSequential(context, parents, false),
        );
        // A credential failure SAP answered ends the call as it came.
        if (read.ended !== undefined) {
          return read.ended;
        }
        // Pass 2 over every parent read, in one envelope.
        const walked = read.walks.flatMap((walk, i) => {
          const parent = parents[i];
          return walk.ok && parent !== undefined
            ? [
                {
                  i,
                  parentType: parent.type,
                  parentName: parent.name,
                  objects: walk.getResult().value,
                },
              ]
            : [];
        });
        const second = await secondPass(context, walked, pass);
        if (!second.ok) return second;
        const lists = second.getResult().value;
        const walks = [...read.walks];
        walked.forEach((entry, j) => {
          walks[entry.i] = ok(lists[j] ?? []);
        });
        read = { walks };
        return ok([]);
      },
      () => {
        const outcomes = read.walks.map((walk, i) => {
          const asked = {
            parent_name: listed[i]?.parent_name,
            parent_type: listed[i]?.parent_type,
          };
          return walk.ok
            ? { list: parentListOf(asked, walk.getResult().value) }
            : { ...asked, error: failureOfWalk(walk) };
        });
        // Through the list table, like every other answer.
        return listAnswerAt(
          PARENT_LISTS,
          level,
        )({ outcomes, shown: listWrittenAt(objectsListAnswers(), level) });
      },
    );
  }

  // The schema required the three, none blank, and the type on this
  // variant: its code. A call that bypassed the schema gets its words.
  const parentName = (parent_name ?? '').toUpperCase();
  const variant = variantOf(context.connection);
  const parentType = tableTypeOf(parent_type ?? '', variant);
  if (parentType === undefined) {
    return return_error(
      notATableType('parent_type', parent_type ?? '', variant),
    );
  }

  // Task 28: why this tool carries no `detail`. The node-level family's
  // shape (`ourUtils.node`, adt-strategies' `utilNodeContents`): a real ADT
  // document is fetched per node, and the reading keeps no wire text beside
  // the level. There is no `.raw` for `detail: 'raw'` to answer, and this
  // tool's own answer besides is a composite assembled from a
  // recursive walk over many such calls, not one reading.
  return answer(
    { tool: 'GetObjectsList', detail: detailOf(args) },
    async () => {
      const walked = await withSequentialFallback(
        context,
        async () => {
          const read = await walkParentsBatched(
            context,
            [{ type: parentType, name: parentName }],
            false,
          );
          const walk = read.ended ?? read.walks[0];
          if ('thrown' in walk) throw walk.thrown;
          return walk;
        },
        () =>
          collectValidObjects(
            context,
            utilsOf(context),
            parentType,
            parentName,
            '000000',
            false,
            new Set(),
          ),
      );
      if (!walked.ok) return walked;
      const second = await secondPass(
        context,
        [{ parentType, parentName, objects: walked.getResult().value }],
        pass,
      );
      if (!second.ok) return second;
      return ok(second.getResult().value[0] ?? []);
    },
    (objects: FlatObject[]) => {
      const result = {
        parent_name,
        parent_tech_name,
        parent_type,
        total_objects: objects.length,
        objects,
      };
      // The cache keeps the full answer, whatever the level answered.
      objectsListCache.setCache(result);
      return shown(
        parentListOf({ parent_name, parent_tech_name, parent_type }, objects),
      );
    },
  );
}
