import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  AdtModernVariant,
  IAdtError,
  IAdtResponse,
  IAdtSuccess,
} from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import type {
  IServerAdtClient,
  UtilsApi,
} from '../../../lib/adtClientContract';
import type { AdtHeadersContext } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  INCLUDES_PARENT_MAIN_TYPES,
  type INCLUDES_PARENT_ROUTES,
  INCLUDES_PARENTS,
  MAIN_TYPE_SENTENCE,
  type ProjectionVariant,
  supported,
} from '../../../lib/adtProjections';
import {
  acceptedCodeOf,
  sharedMainType,
  tableCodeOf,
} from '../../../lib/adtTypeCode';
import {
  answerCaught,
  failedPayloadOf,
  failureEntry,
  failurePayload,
  isCredentialPayload,
  type McpResult,
} from '../../../lib/answer';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient, variantOf } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_FIELD, withLongToolAdvice } from '../../../lib/longTools';
import {
  type FunctionGroupNodeSource,
  fetchFunctionGroupChildren,
} from '../../../lib/strategies/functionGroupChildren';
import { classIncludeTypesOf } from '../../../lib/strategies/metadataFields';
import {
  endsTheCall,
  type NodeLevel,
  nodeStructureOn,
} from '../../../lib/strategies/packageWalk';
import { ourUtils, resultsFor } from '../../../lib/strategies/resultSets';
import { carryingFailure, withStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { byVariant } from '../../../lib/variantDefinition';
import { child } from '../../../lib/xml/tree';
export const TOOL_DEFINITION = {
  name: 'GetIncludesList',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: withLongToolAdvice(
      '[read-only] Recursively discover and list ALL include files within an ABAP program or include. Takes object_name and object_type (one object: its tree) or objects (several objects: one entry per object, in the order given, each { object_name, object_type, tree } or { object_name, object_type, error }).',
    ),
    inputSchema: includesListSchema(variant),
  })),
} as const;

/** GetIncludesList's input on `variant`. */
function includesListSchema(variant: ProjectionVariant) {
  return z.object({
    timeout: TIMEOUT_FIELD,
    object_name: z
      .string()
      .optional()
      .describe(
        'Name of the ABAP program or include (with object_type; or give objects)',
      ),
    object_type: z
      .enum([
        ...INCLUDES_PARENTS[variant],
        ...INCLUDES_PARENT_MAIN_TYPES[variant],
      ])
      .optional()
      .describe(
        `[read-only] ADT object type of the parent. ${supported(INCLUDES_PARENTS[variant])} ${MAIN_TYPE_SENTENCE}`,
      ),
    objects: z
      .array(
        z.object({
          object_name: z
            .string()
            .describe('Name of the ABAP program or include'),
          object_type: z
            .enum([
              ...INCLUDES_PARENTS[variant],
              ...INCLUDES_PARENT_MAIN_TYPES[variant],
            ])
            .describe(
              `ADT object type. ${supported(INCLUDES_PARENTS[variant])} ${MAIN_TYPE_SENTENCE}`,
            ),
        }),
      )
      .optional()
      .describe(
        '[read-only] Several objects, read together (give this or object_name and object_type)',
      ),
    detailed: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        '[read-only] If true, returns structured JSON with metadata and raw XML.',
      ),
  });
}

/**
 * GetIncludesList's arguments, as its schema parses them on either variant —
 * with each `object_type` any text: the handler reads it past the schema's
 * boundary (`parentOf`), and names the parents or the shared main type when
 * it is none of them.
 */
type IncludesListArgs = Omit<
  z.output<ReturnType<typeof includesListSchema>>,
  'object_type' | 'objects'
> & {
  object_type?: string;
  objects?: Array<{ object_name: string; object_type: string }>;
};

interface IncludeNode {
  name: string;
  type?: string;
  children: IncludeNode[];
  /** This include appears inside itself — a real cycle, and not expanded. */
  cyclic?: boolean;
  /**
   * This include was already reached elsewhere in the tree.
   *
   * **In ABAP that is not a diamond, it is invalid source.** An include is a
   * textual insertion into one global scope, so including the same one twice
   * duplicates every declaration it makes and the object cannot be activated —
   * whatever the tree looks like, that code does not run. It is reported rather
   * than expanded: expanding it would describe a shape that cannot exist, and
   * calling it `cyclic` would name the wrong defect.
   */
  duplicate?: boolean;
  truncated?: boolean;
}

const MAX_INCLUDE_DEPTH = 20;

/** A parent this tool walks: a code of `INCLUDES_PARENT_ROUTES`. */
type ParentKind = keyof typeof INCLUDES_PARENT_ROUTES;

/**
 * The parent the caller named, past the boundary of `object_type`: one of
 * the declared variant's parents (`INCLUDES_PARENTS`), or the one parent
 * whose main type it names, either case; `undefined` for any other text,
 * which the tool refuses naming the list (or, for a main type two parents
 * share, those parents).
 */
function parentOf(
  connection: object,
  objectType: string,
  objectName: string,
): { kind: ParentKind; name: string } | undefined {
  const kind = acceptedCodeOf(
    objectType,
    INCLUDES_PARENTS[variantOf(connection)],
    [],
  );
  return kind === undefined ? undefined : resolveParent(kind, objectName);
}

/**
 * What the caller asked for, in the four kinds this tool walks. A function
 * group's main program `SAPL<fg>` is not readable as a program — its
 * program and include URIs both answer 404 on premise — so it is walked as the group.
 */
function resolveParent(
  kind: ParentKind,
  objectName: string,
): { kind: ParentKind; name: string } {
  const name = objectName.trim().toUpperCase();
  if (kind === 'PROG/P' && name.startsWith('SAPL') && name.length > 4) {
    return { kind: 'FUGR/F', name: name.slice(4) };
  }
  return { kind, name };
}

/**
 * The includes a piece of ABAP source names, in order. A full-line comment
 * (`*`) and a trailing one (`"`) are not code; `INCLUDE STRUCTURE` and
 * `INCLUDE TYPE` embed a type, not a program include.
 */
export function includeStatementsOf(source: string): string[] {
  const found: string[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    if (rawLine.startsWith('*')) continue;
    const line = rawLine.replace(/".*$/, '');
    const m = line.match(/^\s*INCLUDE\s+([A-Z0-9_/]+)\s*(?:IF\s+FOUND\s*)?\./i);
    if (!m) continue;
    const name = m[1].toUpperCase();
    if (name === 'STRUCTURE' || name === 'TYPE') continue;
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

/** A source's or metadata's read, as this tool sends it. */
type SourceAnswer = IAdtResponse<unknown, IAdtError>;

/** A function group's node structure level, as this tool reads it. */
type NodeAnswer = IAdtResponse<NodeLevel, IAdtError>;

/** The text inside a source reading — a string, or `{value, raw}`. */
function textOf(response: IAdtSuccess<unknown>): string {
  const v = response.getResult().value;
  if (typeof v === 'string') return v;
  return String(child(v, 'value') ?? child(v, 'raw') ?? '');
}

/**
 * Why a source produced no text: it is not there, or the server refused to give
 * it.
 *
 * **These were the same thing, and that is a defect.** `textOf` used to answer
 * `''` for any failure, so an include this user may not read — or a server
 * error — arrived as "this include names no others", and the tree came back
 * short with nothing saying so. ADT distinguishes the two itself: a missing
 * resource is `ExceptionResourceNotFound` over `404`, and a refusal is its own
 * exception (`ExceptionResourceNoAccess` for a lock or an authorization), which
 * is exactly the case that used to disappear.
 *
 * `absent` keeps the old behaviour where it was right: not that kind of object,
 * or an include that is not there, so the walk goes on. `refused` is collected
 * and travels in the answer beside the tree — the same shape `withLock` uses for
 * a release that failed after a write that landed: what was found, plus what
 * could not be read, never one instead of the other.
 */
type SourceRead =
  | { kind: 'text'; text: string }
  | { kind: 'absent' }
  | { kind: 'refused'; error: IAdtError };

function readSource(response: SourceAnswer): SourceRead {
  if (response.ok) return { kind: 'text', text: textOf(response) };
  const error = response.getError();
  const absent =
    error.response?.status === 404 ||
    error.adtType === 'ExceptionResourceNotFound';
  return absent ? { kind: 'absent' } : { kind: 'refused', error };
}

async function includesListOf(
  context: HandlerContext,
  args: IncludesListArgs,
): Promise<McpResult> {
  const { connection, logger } = context;
  try {
    const { object_name, object_type } = args;

    if (
      !object_name ||
      typeof object_name !== 'string' ||
      object_name.trim() === ''
    ) {
      return return_error(
        'Parameter "object_name" (string) is required and cannot be empty.',
      );
    }
    if (!object_type || typeof object_type !== 'string') {
      return return_error('Parameter "object_type" (string) is required.');
    }

    const parent = parentOf(connection, object_type, object_name);
    if (!parent) {
      const parents = INCLUDES_PARENTS[variantOf(connection)];
      return return_error(
        sharedMainType('object_type', object_type, parents) ??
          `Unsupported object_type "${object_type}": ${supported(parents)}`,
      );
    }

    // No deadline of the server's on a request: the call's own
    // `timeout`, when given, ends only the wait — a request abandoned here
    // would run on in SAP while its session is logged off under it.
    logger?.info(
      `Starting includes tree discovery for ${parent.name} (${parent.kind})`,
    );

    const client = createAdtClient(connection, logger);
    const utils = client.getUtils(ourUtils);

    /** What could not be read, and why — reported beside the tree. */
    const unreadable: Record<string, unknown>[] = [];
    const sourceOf = async (
      what: string,
      read: Promise<SourceAnswer>,
    ): Promise<string> => {
      const answer = readSource(await read);
      if (answer.kind === 'text') return answer.text;
      if (answer.kind === 'refused') {
        // A credential SAP refused is every include's: the call ends with
        // the method's error as it is — no further include is asked.
        if (isCredentialPayload(failureEntry(answer.error, 'read source')))
          throw carryingFailure(
            new Error(answer.error.message),
            answer.error,
            'read source',
          );
        logger?.warn?.(`could not read ${what}: ${answer.error.message}`);
        // The method's error as it is, with the step it arose at.
        unreadable.push({
          name: what,
          ...failurePayload(withStep(answer.error, 'read source')),
        });
      }
      return '';
    };
    const readInclude = async (name: string) =>
      sourceOf(name, readIncludeSource(client, name));

    // Two different things, and one `visited` set was calling both a cycle.
    //
    // `ancestors` is the path from the root to here: a name in it is a genuine
    // cycle — the include includes itself, directly or through others.
    //
    // `seen` is everything the walk has reached anywhere. A second occurrence
    // there is a DUPLICATE, not a cycle and not a legitimate diamond: an
    // include is inserted textually into one global scope, so including the
    // same one twice duplicates its declarations and the object will not
    // activate. Either way it is not expanded; the difference is which defect
    // the answer names.
    const seen = new Set<string>([parent.name]);
    const expand = async (
      names: string[],
      depth: number,
      ancestors: Set<string>,
    ): Promise<IncludeNode[]> => {
      const children: IncludeNode[] = [];
      for (const name of names) {
        const node: IncludeNode = { name, children: [] };
        if (ancestors.has(name)) {
          node.cyclic = true;
        } else if (seen.has(name)) {
          node.duplicate = true;
        } else if (depth >= MAX_INCLUDE_DEPTH) {
          node.truncated = true;
        } else {
          seen.add(name);
          node.children = await expand(
            includeStatementsOf(await readInclude(name)),
            depth + 1,
            new Set([...ancestors, name]),
          );
        }
        children.push(node);
      }
      return children;
    };

    let children: IncludeNode[];
    if (parent.kind === 'CLAS/OC') {
      // A class has sections, not program includes: its metadata lists them
      // by `includeType` (definitions, implementations, macros, testclasses,
      // main), with no name of their own.
      const meta = await sourceOf(
        `class ${parent.name}`,
        utils.readObjectMetadata('CLAS/OC', parent.name, undefined, {
          version: 'active',
          analyse: analyseException,
        }),
      );
      children = classIncludeTypesOf(meta).map((name) => ({
        name,
        type: 'CLAS/I',
        children: [],
      }));
    } else if (parent.kind === 'FUGR/F') {
      // The group's main program cannot be read, so which includes it names
      // directly is worked out from the rest: every include of the group,
      // less those another include of the group names.
      const listed = await fetchFunctionGroupChildren(
        nodeStructureOn(context, utils),
        parent.name,
        'FUGR/I',
      );
      if (!listed.ok) {
        throw carryingFailure(
          new Error(listed.getError().message),
          listed.getError(),
          'list function group includes',
        );
      }
      const all: string[] = listed
        .getResult()
        .value.map((o: { name: string }) => o.name.toUpperCase());
      const nested = new Set<string>();
      for (const name of all) {
        for (const inc of includeStatementsOf(await readInclude(name))) {
          nested.add(inc);
        }
      }
      children = await expand(
        all.filter((name) => !nested.has(name)),
        0,
        new Set([parent.name]),
      );
    } else {
      const rootSource =
        parent.kind === 'PROG/P'
          ? await sourceOf(
              `program ${parent.name}`,
              utils.readObjectSource(
                'PROG/P',
                parent.name,
                undefined,
                'active',
                { analyse: analyseException },
              ),
            )
          : await readInclude(parent.name);
      children = await expand(
        includeStatementsOf(rootSource),
        0,
        new Set([parent.name]),
      );
    }

    const tree: IncludeNode = { name: parent.name, children };

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              object_name: parent.name,
              object_type: parent.kind,
              tree,
              // Only when there is something to say: a caller reading a tree
              // needs to know it is short, and why.
              ...(unreadable.length > 0 ? { unreadable } : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    logger?.error(
      `Error getting includes list: ${error instanceof Error ? error.message : String(error)}`,
    );
    // A carried method error as it is, a chain failure as it came, a throw
    // of our own `client_threw` — never the bare message.
    return answerCaught(error, { tool: 'GetIncludesList', detail: 'terse' });
  }
}

/** A read answered by a source or a class's metadata. */
interface SourceRead_ {
  kind: 'program' | 'include' | 'class';
  name: string;
}

/** A read of a function group's node structure: its root, or its includes node. */
interface GroupRead {
  kind: 'group';
  name: string;
  nodeId?: string;
}

/** One read of the batched version: a source, a class's metadata, a group's node. */
type IncludeRead = SourceRead_ | GroupRead;

const readKey = (read: IncludeRead): string =>
  read.kind === 'group'
    ? `group:${read.name}:${read.nodeId ?? ''}`
    : `${read.kind}:${read.name}`;

/** The utilities every read of this tool is sent on. */
type IncludeUtils = UtilsApi<typeof ourUtils, AdtModernVariant>;

/** An include's source, active: what the tree is built from. */
function readIncludeSource(client: IServerAdtClient, includeName: string) {
  return client
    .getInclude(resultsFor(includeDocuments))
    .read({ includeName }, 'active', { analyse: analyseException });
}

/** A read's answer, by what the read was: a source or metadata, or a group's node. */
type IncludeAnswer =
  | { of: 'source'; response: SourceAnswer }
  | { of: 'node'; response: NodeAnswer };

/** `read` sent on `client`, as the sequential version sends it. */
async function sendRead(
  context: AdtHeadersContext,
  client: IServerAdtClient,
  read: IncludeRead,
): Promise<IncludeAnswer> {
  const utils: IncludeUtils = client.getUtils(ourUtils);
  switch (read.kind) {
    case 'program':
      return {
        of: 'source',
        response: await utils.readObjectSource(
          'PROG/P',
          read.name,
          undefined,
          'active',
          { analyse: analyseException },
        ),
      };
    case 'include':
      return {
        of: 'source',
        response: await readIncludeSource(client, read.name),
      };
    case 'class':
      return {
        of: 'source',
        response: await utils.readObjectMetadata(
          'CLAS/OC',
          read.name,
          undefined,
          { version: 'active', analyse: analyseException },
        ),
      };
    case 'group': {
      // `fetchFunctionGroupChildren`'s two requests: the group's node
      // structure, then its includes node — on the source it reads.
      const groups: FunctionGroupNodeSource = nodeStructureOn(context, utils);
      return {
        of: 'node',
        response: await groups.fetchNodeStructure('FUGR/F', read.name, {
          ...(read.nodeId !== undefined ? { nodeId: read.nodeId } : {}),
          withShortDescriptions: true,
        }),
      };
    }
  }
}

/**
 * The answers of the batched version's phases, by read. Each phase sends the
 * reads not answered yet in one envelope (`runPhase`); a credential failure
 * any of them answers — thrown, or SAP's `401` — ends the call: thrown, as
 * the sequential version throws it.
 */
function includeAnswers(context: HandlerContext) {
  const sources = new Map<string, PhaseResult<SourceAnswer>>();
  const nodes = new Map<string, PhaseResult<NodeAnswer>>();
  /** The entry an earlier phase set for `read`; a read no phase sent throws in words. */
  const earlier = <V>(map: ReadonlyMap<string, V>, read: IncludeRead): V => {
    const result = map.get(readKey(read));
    if (result === undefined) {
      throw new Error(`${readKey(read)} was not read in an earlier phase`);
    }
    return result;
  };
  return {
    /** A source's or metadata's answer, read in an earlier phase. */
    get(read: SourceRead_): PhaseResult<SourceAnswer> {
      return earlier(sources, read);
    },
    /** A group's node answer, read in an earlier phase. */
    getNode(read: GroupRead): PhaseResult<NodeAnswer> {
      return earlier(nodes, read);
    },
    async phase(reads: readonly IncludeRead[]): Promise<void> {
      const asked = new Map<string, IncludeRead>();
      for (const read of reads) {
        const key = readKey(read);
        if (!sources.has(key) && !nodes.has(key)) asked.set(key, read);
      }
      if (asked.size === 0) return;
      const pending = [...asked.values()];
      const results = await runPhase(context, pending, (read, connection) =>
        sendRead(context, createAdtClient(connection, context.logger), read),
      );
      results.forEach((result, i) => {
        const read = pending[i];
        const key = readKey(read);
        if (!result.ok) {
          if (endsTheCall(result.error)) throw result.error;
          if (read.kind === 'group') nodes.set(key, result);
          else sources.set(key, result);
          return;
        }
        const answer = result.value;
        if (answer.of === 'node') {
          const response = answer.response;
          if (
            !response.ok &&
            isCredentialPayload(
              failureEntry(response.getError(), 'list function group includes'),
            )
          ) {
            throw carryingFailure(
              new Error(response.getError().message),
              response.getError(),
              'list function group includes',
            );
          }
          nodes.set(key, { ok: true, value: response });
        } else {
          const read = readSource(answer.response);
          if (
            read.kind === 'refused' &&
            isCredentialPayload(failureEntry(read.error, 'read source'))
          ) {
            throw carryingFailure(
              new Error(read.error.message),
              read.error,
              'read source',
            );
          }
          sources.set(key, { ok: true, value: answer.response });
        }
      });
    },
  };
}

type IncludeAnswers = ReturnType<typeof includeAnswers>;

/** A source an answer carries, `''` for anything else — what the walk reads on. */
function answeredText(result: PhaseResult<SourceAnswer>): string {
  if (!result.ok) return '';
  const answer = readSource(result.value);
  return answer.kind === 'text' ? answer.text : '';
}

/**
 * The first read of an object answered by a document: its source or its
 * metadata; `undefined` for a function group, whose first read is its node.
 */
function firstSourceRead(parent: {
  kind: ParentKind;
  name: string;
}): SourceRead_ | undefined {
  switch (parent.kind) {
    case 'PROG/P':
      return { kind: 'program', name: parent.name };
    case 'PROG/I':
      return { kind: 'include', name: parent.name };
    case 'CLAS/OC':
      return { kind: 'class', name: parent.name };
    case 'FUGR/F':
      return undefined;
  }
}

/** The first read of an object: its source, its metadata or its group's node. */
function firstRead(parent: { kind: ParentKind; name: string }): IncludeRead {
  return firstSourceRead(parent) ?? { kind: 'group', name: parent.name };
}

/** The includes node a group's node structure lists, if it answered. */
function includesNodeOf(result: PhaseResult<NodeAnswer>): string | undefined {
  if (!result.ok) return undefined;
  const response = result.value;
  if (!response.ok) return undefined;
  return response
    .getResult()
    .value.childNodes.find((c) => tableCodeOf(c.type) === 'FUGR/I')?.nodeId;
}

/**
 * The tree of one object from the phases' answers — the sequential version's
 * walk, depth first, over the answers instead of requests: the same tree,
 * the same `cyclic` and `duplicate` marks, the same `unreadable` entries in
 * the same order, the same failure answer.
 */
async function treeFromAnswers(
  context: HandlerContext,
  parent: { kind: ParentKind; name: string },
  answers: IncludeAnswers,
): Promise<McpResult> {
  const { logger } = context;
  try {
    logger?.info(
      `Starting includes tree discovery for ${parent.name} (${parent.kind})`,
    );
    const answered = (read: SourceRead_): SourceAnswer => {
      const result = answers.get(read);
      if (!result.ok) throw result.error;
      return result.value;
    };
    const answeredNode = (read: GroupRead): NodeAnswer => {
      const result = answers.getNode(read);
      if (!result.ok) throw result.error;
      return result.value;
    };
    const unreadable: Record<string, unknown>[] = [];
    const sourceOf = (what: string, read: SourceRead_): string => {
      const answer = readSource(answered(read));
      if (answer.kind === 'text') return answer.text;
      if (answer.kind === 'refused') {
        logger?.warn?.(`could not read ${what}: ${answer.error.message}`);
        unreadable.push({
          name: what,
          ...failurePayload(withStep(answer.error, 'read source')),
        });
      }
      return '';
    };
    const readInclude = (name: string) =>
      sourceOf(name, { kind: 'include', name });

    const seen = new Set<string>([parent.name]);
    const expand = (
      names: string[],
      depth: number,
      ancestors: Set<string>,
    ): IncludeNode[] => {
      const children: IncludeNode[] = [];
      for (const name of names) {
        const node: IncludeNode = { name, children: [] };
        if (ancestors.has(name)) {
          node.cyclic = true;
        } else if (seen.has(name)) {
          node.duplicate = true;
        } else if (depth >= MAX_INCLUDE_DEPTH) {
          node.truncated = true;
        } else {
          seen.add(name);
          node.children = expand(
            includeStatementsOf(readInclude(name)),
            depth + 1,
            new Set([...ancestors, name]),
          );
        }
        children.push(node);
      }
      return children;
    };

    let children: IncludeNode[];
    if (parent.kind === 'CLAS/OC') {
      const meta = sourceOf(`class ${parent.name}`, {
        kind: 'class',
        name: parent.name,
      });
      children = classIncludeTypesOf(meta).map((name) => ({
        name,
        type: 'CLAS/I',
        children: [],
      }));
    } else if (parent.kind === 'FUGR/F') {
      const listed = await fetchFunctionGroupChildren(
        {
          fetchNodeStructure: async (_type, name, options) =>
            answeredNode({
              kind: 'group',
              name,
              ...(options?.nodeId !== undefined
                ? { nodeId: options.nodeId }
                : {}),
            }),
        },
        parent.name,
        'FUGR/I',
      );
      if (!listed.ok) {
        throw carryingFailure(
          new Error(listed.getError().message),
          listed.getError(),
          'list function group includes',
        );
      }
      const all: string[] = listed
        .getResult()
        .value.map((o: { name: string }) => o.name.toUpperCase());
      const nested = new Set<string>();
      for (const name of all) {
        for (const inc of includeStatementsOf(readInclude(name))) {
          nested.add(inc);
        }
      }
      children = expand(
        all.filter((name) => !nested.has(name)),
        0,
        new Set([parent.name]),
      );
    } else {
      const rootSource =
        parent.kind === 'PROG/P'
          ? sourceOf(`program ${parent.name}`, {
              kind: 'program',
              name: parent.name,
            })
          : readInclude(parent.name);
      children = expand(
        includeStatementsOf(rootSource),
        0,
        new Set([parent.name]),
      );
    }

    const tree: IncludeNode = { name: parent.name, children };
    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              object_name: parent.name,
              object_type: parent.kind,
              tree,
              ...(unreadable.length > 0 ? { unreadable } : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    logger?.error(
      `Error getting includes list: ${error instanceof Error ? error.message : String(error)}`,
    );
    return answerCaught(error, { tool: 'GetIncludesList', detail: 'terse' });
  }
}

/**
 * Every object's tree in ADT batch envelopes (spec §11), one level at a
 * time: (1) every object's first read — a program's or include's source, a
 * class's metadata, a function group's node structure; (2) the includes node
 * of every function group; then per depth, up to 20, the source of every
 * include first reached at that depth, read once for the call. Each tree is
 * then the sequential version's walk over these answers. A credential
 * failure ends the call: thrown.
 */
async function includeTrees(
  context: HandlerContext,
  parents: ReadonlyArray<{ kind: ParentKind; name: string }>,
): Promise<McpResult[]> {
  const answers = includeAnswers(context);
  await answers.phase(parents.map(firstRead));
  const groupNodes: IncludeRead[] = [];
  for (const parent of parents) {
    if (parent.kind !== 'FUGR/F') continue;
    const nodeId = includesNodeOf(
      answers.getNode({ kind: 'group', name: parent.name }),
    );
    if (nodeId !== undefined) {
      groupNodes.push({ kind: 'group', name: parent.name, nodeId });
    }
  }
  await answers.phase(groupNodes);

  // Per object: the includes reached so far, and those first reached at the
  // depth the next phase reads.
  const walks = parents
    .filter((parent) => parent.kind !== 'CLAS/OC')
    .map((parent) => {
      let level: string[] = [];
      if (parent.kind === 'FUGR/F') {
        const nodeId = includesNodeOf(
          answers.getNode({ kind: 'group', name: parent.name }),
        );
        const node =
          nodeId === undefined
            ? undefined
            : answers.getNode({ kind: 'group', name: parent.name, nodeId });
        const response = node?.ok === true ? node.value : undefined;
        if (response?.ok) {
          level = [
            ...new Set(
              response
                .getResult()
                .value.objects.map((o) => o.name.toUpperCase()),
            ),
          ];
        }
      } else {
        const first = firstSourceRead(parent);
        level =
          first === undefined
            ? []
            : includeStatementsOf(answeredText(answers.get(first)));
      }
      return { reached: new Set([parent.name, ...level]), level };
    });
  for (let depth = 0; depth < MAX_INCLUDE_DEPTH; depth++) {
    const reads = walks.flatMap((walk) =>
      walk.level.map((name): IncludeRead => ({ kind: 'include', name })),
    );
    if (reads.length === 0) break;
    await answers.phase(reads);
    for (const walk of walks) {
      const next: string[] = [];
      for (const name of walk.level) {
        const text = answeredText(answers.get({ kind: 'include', name }));
        for (const inc of includeStatementsOf(text)) {
          if (walk.reached.has(inc)) continue;
          walk.reached.add(inc);
          next.push(inc);
        }
      }
      walk.level = next;
    }
  }
  const trees: McpResult[] = [];
  for (const parent of parents) {
    trees.push(await treeFromAnswers(context, parent, answers));
  }
  return trees;
}

/** A failed answer's payload: its JSON, else its text. */
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
  const failed = failedPayloadOf(result, 'read source');
  return failed !== undefined && isCredentialPayload(failed);
}

/** A list call's answer: one entry per object, in the order asked. */
function listAnswer(
  objects: ReadonlyArray<{ object_name: string; object_type: string }>,
  results: readonly McpResult[],
): McpResult {
  const entries = results.map((result, i) => {
    const asked = objects[i];
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

export async function handleGetIncludesList(
  context: HandlerContext,
  args: IncludesListArgs,
) {
  const { logger } = context;
  const listed = args?.objects;
  if (listed === undefined) {
    const parent =
      typeof args?.object_name === 'string' &&
      args.object_name.trim() !== '' &&
      typeof args?.object_type === 'string'
        ? parentOf(context.connection, args.object_type, args.object_name)
        : undefined;
    // A class is one metadata read: there is nothing to read together.
    if (parent === undefined || parent.kind === 'CLAS/OC') {
      return includesListOf(context, args);
    }
    try {
      return await withSequentialFallback<McpResult>(
        context,
        async () => (await includeTrees(context, [parent]))[0],
        () => includesListOf(context, args),
      );
    } catch (error) {
      logger?.error(
        `Error getting includes list: ${error instanceof Error ? error.message : String(error)}`,
      );
      return answerCaught(error, { tool: 'GetIncludesList', detail: 'terse' });
    }
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
    object_name: o.object_name,
    object_type: o.object_type,
  }));
  const single = (o: (typeof objects)[number]) => {
    const { objects: _list, ...rest } = args;
    return { ...rest, ...o };
  };
  try {
    return await withSequentialFallback<McpResult>(
      context,
      async () => {
        const parents = objects.map((o) =>
          typeof o.object_name === 'string' &&
          o.object_name.trim() !== '' &&
          typeof o.object_type === 'string'
            ? parentOf(context.connection, o.object_type, o.object_name)
            : undefined,
        );
        const read = parents.filter(
          (p): p is { kind: ParentKind; name: string } => p !== undefined,
        );
        const trees = await includeTrees(context, read);
        const results: McpResult[] = [];
        let at = 0;
        for (const [i, parent] of parents.entries()) {
          if (parent === undefined) {
            results.push(await includesListOf(context, single(objects[i])));
          } else {
            results.push(trees[at++]);
          }
        }
        return listAnswer(objects, results);
      },
      async () => {
        // One object after another, each as the single call reads it; a
        // credential failure ends the call, and nothing after it is read.
        const results: McpResult[] = [];
        for (const o of objects) {
          const result = await includesListOf(context, single(o));
          if (endsList(result)) return result;
          results.push(result);
        }
        return listAnswer(objects, results);
      },
    );
  } catch (error) {
    logger?.error(
      `Error getting includes list: ${error instanceof Error ? error.message : String(error)}`,
    );
    return answerCaught(error, { tool: 'GetIncludesList', detail: 'terse' });
  }
}
