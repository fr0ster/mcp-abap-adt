import { structureDocuments, tableDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import * as z from 'zod';
import type { AdtCodes } from '../../../lib/adtProjections';
import {
  answerPayload,
  type FailureEntry,
  failedPayloadOf,
  failureEntry,
  isCredentialPayload,
  type ListedAnswer,
  listedAnswer,
  type McpResult,
  thrownEntry,
} from '../../../lib/answer';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import {
  asJsonResult,
  asTextResult,
  byListing,
  type Column,
  type DetailLevel,
  type Head,
  jsonText,
  type ListAnswerTable,
  type Listing,
  listAnswerAt,
  marks,
  nest,
  node,
  partsOf,
  type RowSchemas,
  rows,
  sections,
  type TextResult,
  values,
  type Written,
  wireAnswer,
  writeJsonList,
  writeListing,
  writeWhole,
} from '../../../lib/detail';
import { stated, withInCallSchema } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import type { JsonValue } from '../../../lib/json';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import {
  afterBlanksAt,
  asciiLower,
  asciiUpper,
  holdsPhrase,
  isAsciiLetter,
  isWordCharacter,
  linesOf,
  wordAt,
} from '../../../lib/plainText';
import {
  ASSEMBLED_DETAIL_SHAPE,
  levelOf,
} from '../../../lib/strategies/detail';
import { endsTheCall } from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { carryingFailure } from '../../../lib/strategies/step';
import {
  fetchWhereUsedReferences,
  presentScopeOptions,
  type WhereUsedSource,
  whereUsedOn,
} from '../../../lib/strategies/whereUsedList';
import { child } from '../../../lib/thrownValue';
import { return_error, return_response } from '../../../lib/utils';

/** GetStructuresList's arguments but `background`. */
const FIELDS = {
  structure_name: z
    .string()
    .optional()
    .describe('Structure name (or give structure_names).'),
  structure_names: z
    .array(z.string())
    .optional()
    .describe(
      'Several structure names, read together (give this or structure_name).',
    ),
  version: READ_VERSION_FIELD,
  include_extensions: z
    .boolean()
    .default(true)
    .optional()
    .describe(
      '[read-only] Also find extension (append) structures via where-used (objects that `extend type <this> with …`). Default true. Set false to skip the (slower) where-used lookups and return includes only.',
    ),
  ...ASSEMBLED_DETAIL_SHAPE,
};

/**
 * `structure_name`, or a non-empty `structure_names` of names alone.
 */
function oneStructureForm(
  args: {
    structure_name?: string | undefined;
    structure_names?: string[] | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const listed = args.structure_names;
  if (listed === undefined) {
    if (!stated(args.structure_name)) {
      ctx.addIssue({
        code: 'custom',
        message: 'structure_name is required',
        path: ['structure_name'],
      });
    }
    return;
  }
  if (
    args.structure_name !== undefined ||
    listed.length === 0 ||
    listed.some((name) => !stated(name))
  ) {
    ctx.addIssue({
      code: 'custom',
      message:
        'Give exactly one of structure_name or structure_names (a non-empty list of names)',
      path: ['structure_names'],
    });
  }
}

export const TOOL_DEFINITION = {
  name: 'GetStructuresList',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Recursively list the structures embedded in an ABAP structure (.INCLUDE / append), as a tree. ' +
      'Takes structure_name (one structure: its tree) or structure_names (several structures: one entry per structure, in the order given, each its tree answer or { structure_name, error }). ' +
      'Works on BASIS 7.50 and later, where the DDIC structure/table endpoints it reads exist; ' +
      'legacy systems (BASIS < 7.50) refuse it (issue #207).',
  ),
  inputSchema: withInCallSchema(
    z
      .object({ background: LONG_BACKGROUND_FIELD, ...FIELDS })
      .superRefine(oneStructureForm),
    z.object(FIELDS).superRefine(oneStructureForm),
  ),
} as const;

interface StructureNode {
  structure: string; // the embedded structure's own name (root = the requested structure)
  attribute: string | null; // component name it is embedded under (null = anonymous / root)
  kind: 'root' | 'include' | 'append'; // how THIS node is embedded into its parent
  children: StructureNode[]; // embedded structures of this one
  cyclic?: boolean;
  // This node's source could not be read: words when neither endpoint has
  // it (404), else what each endpoint answered, with its step.
  error?: string | FailureEntry[];
}

/**
 * What reading a name's DDL came to: its source; absence — both endpoints
 * answered 404; or each endpoint's failure as it is, with its step.
 */
type DdlRead =
  | { source: string }
  | { absent: true }
  | { failures: FailureEntry[] };

interface EmbeddedRef {
  name: string; // embedded structure name
  attribute: string | null; // component/attribute name (named include) or null (anonymous)
  kind: 'include' | 'append';
}

/**
 * Parses structure/table DDL (or classic field-list) source for embedded
 * STRUCTURES. Recognised forms (see a real table like VBAK):
 *   include <name>;                  -> anonymous include (attribute = null)
 *   <attr> : include <name>;         -> named include (attribute = <attr>)
 *   .INCLUDE <name>                  -> classic include
 * Appends are NOT in the source — an append is a separate object that
 * `extend type <this> with …`, resolved via where-used (findExtensions), not
 * parsed here. Plain component lines (`fld : type;`) and annotations
 * (`@AbapCatalog…`) are NOT structure embeddings and are ignored — do NOT
 * confuse the `@AbapCatalog.enhancement.category` annotation with an include.
 */
export function parseEmbeddedStructures(source: string): EmbeddedRef[] {
  const refs: EmbeddedRef[] = [];
  if (!source) return refs;

  for (const rawLine of linesOf(source)) {
    // Strip line comments (both classic '* ' and DDL '//').
    const comment = rawLine.indexOf('//');
    const line = (comment === -1 ? rawLine : rawLine.slice(0, comment)).trim();
    if (!line || line.startsWith('@') || line.startsWith('*')) continue;

    // Classic field-list include: .INCLUDE <name>
    // NOTE: appends are NOT parsed from source — ADT does not emit a `.APPEND`
    // line in a structure's source. An append is a separate object that
    // `extend type <this> with …`; those are resolved via where-used in
    // findExtensions(), not here.
    const classicInclude = includedName(line, '.INCLUDE');
    if (classicInclude !== undefined) {
      refs.push({ name: classicInclude, attribute: null, kind: 'include' });
      continue;
    }

    // Modern DDL named include: `<attr> : include <name>;`
    const named = namedInclude(line);
    if (named !== undefined) {
      refs.push({ ...named, kind: 'include' });
      continue;
    }

    // Modern DDL anonymous include: `include <name>;`
    const ddlInclude = includedName(line, 'INCLUDE');
    if (ddlInclude !== undefined) {
      refs.push({ name: ddlInclude, attribute: null, kind: 'include' });
    }
  }

  return refs;
}

/** A structure name's characters: letters, digits, `_` and `/` (a namespace). */
const isStructureNameCharacter = (character: string | undefined): boolean =>
  isWordCharacter(character) || character === '/';

/**
 * The name after `keyword` (any case) at the start of `line`, the keyword
 * and the name one or more blanks apart, in upper case; what follows the
 * name is not read. `undefined` when the line does not start so.
 */
function includedName(line: string, keyword: string): string | undefined {
  if (!wordAt(line, 0, keyword)) return undefined;
  const at = afterBlanksAt(line, keyword.length);
  if (at === keyword.length) return undefined;
  let end = at;
  while (end < line.length && isStructureNameCharacter(line[end])) end++;
  return end > at ? asciiUpper(line.slice(at, end)) : undefined;
}

/** `<attr> : include <name>` at the start of `line`: the attribute in lower case, the name in upper. */
function namedInclude(
  line: string,
): { name: string; attribute: string } | undefined {
  if (!isAsciiLetter(line[0])) return undefined;
  let end = 1;
  while (end < line.length && isWordCharacter(line[end])) end++;
  const colon = afterBlanksAt(line, end);
  if (line[colon] !== ':') return undefined;
  const name = includedName(
    line.slice(afterBlanksAt(line, colon + 1)),
    'INCLUDE',
  );
  return name === undefined
    ? undefined
    : { name, attribute: asciiLower(line.slice(0, end)) };
}

/**
 * Pull the source string out of an `IAdtResponse<string>` — `{ ok: true,
 * getResult() }` on success, `{ ok: false, getError() }` on refusal, per the
 * 19 contract `findExtensions` already reads a few lines below this. This
 * used to read a bare `data` field, or a `data` field nested one level under
 * a `readResult` key — the pre-19 wire-envelope shape — which answers
 * `undefined` on either half of the real contract, which made
 * `readDdl` fall through to the table endpoint for every structure — even
 * ones that read back fine. `.ok`/`.getResult().value` never throws on a
 * refusal, which is why `readDdl`'s fallback checks this function's result
 * rather than relying on a caught exception for the ordinary "not this
 * endpoint, try the other one" case.
 */
function extractSource(result: IAdtResponse<string, IAdtError>): string | null {
  return result.ok ? result.getResult().value : null;
}

/** One structure's tree as read, and what of its appends could not be read. */
interface StructuresRead {
  structure_name: string;
  appends_unavailable: boolean;
  append_candidates_unread: ReadonlyArray<{
    candidate: string;
    step: 'read append candidate';
    failures: FailureEntry[];
  }>;
  tree: StructureNode;
}

/** What a level answers of one structure's tree. */
type StructuresShown = (read: StructuresRead) => string;

/**
 * Each answered structure's read, by the answer it became: a list call
 * writes every structure's terse text from these by the listing writer, never
 * by splicing the single answers' texts.
 */
const readsOf = new WeakMap<McpResult, StructuresRead>();

/** One structure's answer at its level, its read kept for a list call. */
function readAnswer(shown: StructuresShown, read: StructuresRead): McpResult {
  const result = return_response({ data: shown(read) });
  readsOf.set(result, read);
  return result;
}

/** A node's row: its structure, kind and attribute, then `cyclic` or `not read` where it is so. */
const structureColumns: Column<StructureNode>[] = [
  { name: 'structure', cell: (node) => node.structure },
  { name: 'kind', cell: (node) => node.kind },
  { name: 'attribute', cell: (node) => node.attribute ?? '' },
  {
    name: 'cyclic',
    cell: () => 'cyclic',
    when: (node) => node.cyclic === true,
  },
  {
    name: 'not_read',
    cell: () => 'not read',
    when: (node) => node.error !== undefined,
  },
];

/** Each failure of a read as a `# failure` line, its JSON one cell. */
const failureMarks = <K extends string>(key: K) =>
  marks(key, 'failure', (entry: FailureEntry) => [JSON.stringify(entry)]);

/** Every node below a node, one level deeper. */
const structureSchemas: RowSchemas<StructureNode> = {
  // A node not read: its `not read` cell, then each failure of its read
  // (what each endpoint answered, with its step) a line of its own.
  error: failureMarks('error'),
  children: rows('children', {
    columns: structureColumns,
    header: 'none',
    get lists() {
      return structureSchemas;
    },
  }),
};

/** The answer before `detail` (full). */
function fullStructures(read: StructuresRead): string {
  return JSON.stringify(structuresWhole(read));
}

/** The answer before `detail`: the tree whole, what could not be read beside it. */
function structuresWhole(read: StructuresRead) {
  return {
    success: true,
    structure_name: read.structure_name,
    ...(read.appends_unavailable ? { appends_unavailable: true } : {}),
    ...(read.append_candidates_unread.length > 0
      ? { append_candidates_unread: read.append_candidates_unread }
      : {}),
    tree: read.tree,
  };
}

/**
 * What GetStructuresList answers of one structure at each `detail`,
 * selected before the reads (`src/lib/detail`): terse the tree as indented
 * `structure\tkind\tattribute` rows (a node not read or cyclic marked), with
 * `# appends_unavailable` when where-used failed and a
 * `# append_candidate_unread<TAB>NAME` line per candidate SAP refused to read; medium and full the answer
 * before `detail`. A tree reads many documents, so
 * raw never reaches this table: the handler answers it as the wire documents (`wireAnswer`).
 */

/** The lists a StructuresRead listing writes: what its description states. */
const STRUCTURES_LISTS: RowSchemas<StructuresRead> = {
  // Each candidate SAP refused to read, by name — the one to read again —
  // then each failure of its read.
  append_candidates_unread: sections(
    'append_candidates_unread',
    (unread: StructuresRead['append_candidates_unread'][number]) => [
      { mark: 'append_candidate_unread', words: [unread.candidate] },
    ],
    { failures: failureMarks('failures') },
  ),
  // The tree from its root: the root a row, every node below it.
  tree: node('tree', {
    columns: structureColumns,
    header: 'none',
    tree: true,
    lists: structureSchemas,
  }),
};

/**
 * A structure's terse text, written from its read: its heads, a mark per
 * append candidate SAP refused to read, then the tree from its root.
 */
const structuresListing = (read: StructuresRead): Listing<StructuresRead> => ({
  heads: [
    { head: 'structure', value: read.structure_name },
    ...(read.appends_unavailable ? [{ head: 'appends_unavailable' }] : []),
  ],
  reading: read,
  lists: STRUCTURES_LISTS,
});

// Every node and unread candidate written from the read by the listing
// writer; medium and full write the tree whole.
const STRUCTURES_ANSWERS: ListAnswerTable<StructuresRead, string> = {
  terse: (read) => writeListing(structuresListing(read)),
  // The tree whole, as full gives it: complete by construction.
  medium: (read) => jsonText(writeWhole(structuresWhole(read))),
  full: fullStructures,
  raw: fullStructures,
};

async function structuresListOf(
  context: HandlerContext,
  args: {
    structure_name: string;
    version?: ReadVersion | undefined;
    include_extensions?: boolean | undefined;
  },
  shown: StructuresShown,
): Promise<McpResult> {
  const { connection, logger } = context;
  try {
    const { structure_name, version = 'active' } = args;
    const includeExtensions = args.include_extensions !== false;
    // Set when the append where-used lookup fails for every resolved
    // object_type, so the response can flag that appends could not be
    // determined (≠ "no appends"). #128
    let appendsUnavailable = false;
    // Append candidates where-used named but SAP refused to read: each with
    // its refusal as it is, the step `read append candidate` and its name —
    // listed, not skipped as "not an append". A candidate both endpoints
    // answer 404 for is absent and stays skipped.
    const unreadCandidates: Array<{
      candidate: string;
      step: 'read append candidate';
      failures: FailureEntry[];
    }> = [];
    const client = createAdtClient(connection, logger);
    const obj = client.getStructure(structureDocuments);
    const utils = client.getUtils(ourUtils);
    const rootName = structure_name.toUpperCase();

    /**
     * Read the DDL source of a structure OR table (the embed/extend syntax is
     * identical, and an extension's base is often a table). Try the structure
     * endpoint first, fall back to the table endpoint. When neither has it,
     * a 404 from both is absence; anything else is each endpoint's failure
     * as it is, with its step (`read structure`, `read table`).
     */
    const readDdl = async (name: string): Promise<DdlRead> => {
      const failures: FailureEntry[] = [];
      let answered = 0; // endpoints that answered 404 (or nothing to read)
      const attempt = async (
        step: 'read structure' | 'read table',
        read: () => Promise<IAdtResponse<string, IAdtError>>,
      ): Promise<string | null> => {
        try {
          const answer = await read();
          const source = extractSource(answer);
          if (source != null) return source;
          if (!answer.ok) {
            const error = answer.getError();
            // The credentials are the same for every node: the whole call
            // ends, as it came.
            if (isCredentialPayload(failureEntry(error, step)))
              throw carryingFailure(new Error(error.message), error, step);
            failures.push(failureEntry(error, step));
            if (error?.response?.status !== 404) return null;
          }
          answered++;
        } catch (thrown) {
          if (isCredentialPayload(thrownEntry(thrown, step))) throw thrown;
          failures.push(thrownEntry(thrown, step));
        }
        return null;
      };
      const structure = await attempt('read structure', () =>
        obj.read({ structureName: name }, version, {
          analyse: analyseException,
        }),
      );
      if (structure != null) return { source: structure };
      const table = await attempt('read table', () =>
        client.getTable(tableDocuments).read({ tableName: name }, version, {
          analyse: analyseException,
        }),
      );
      if (table != null) return { source: table };
      return answered === 2 ? { absent: true } : { failures };
    };

    /**
     * Find extension (append) structures of `baseName` via where-used: an
     * extension is a structure whose source is `extend type <baseName> with …`.
     * The base's own source does NOT list its extensions, so we resolve them
     * from the where-used referencing objects (structures only) and confirm by
     * reading each candidate's source.
     */
    const findExtensions = async (baseName: string): Promise<EmbeddedRef[]> => {
      if (!includeExtensions) return [];
      // Scope the where-used search to append structures only
      // (enableOnlyTypes: [STRUCTURES_ONLY]). where-used caps the number of returned
      // records, so with the default/all-types scope a heavily-used base has
      // its append (structure) records crowded out by other reference types and
      // dropped → 0 appends. Restricting the search to TABL/DS server-side keeps
      // the appends within the cap. An append is always a structure (TABL/DS),
      // not a table, so TABL/DS is the only type we need here.
      //
      // The base may be defined as a structure OR a table; where-used needs the
      // matching object_type to build the URI (a structures URI 404s for a table
      // and vice-versa). adt-clients deliberately does not auto-fallback (it
      // would hide a wrong object_type), so resolve it here like readDdl does:
      // try 'structure', fall back to 'table'. (#128, adt-clients #54)
      let references: Array<{ name?: string; type?: string }> = [];
      let resolved = false;
      let lastErr: unknown;
      for (const objectType of WHERE_USED_TYPES) {
        try {
          const wu = await fetchWhereUsedReferences(
            whereUsedOn(context, utils),
            {
              object_name: baseName,
              object_type: objectType,
              enableOnlyTypes: [STRUCTURES_ONLY],
            },
          );
          if (!wu.ok) {
            // The credentials are the same for every request: the call ends.
            if (isCredentialPayload(failureEntry(wu.getError(), 'where-used')))
              throw carryingFailure(
                new Error(wu.getError().message),
                wu.getError(),
                'where-used',
              );
            lastErr = new Error(wu.getError().message);
            continue;
          }
          references = wu.getResult().value.references;
          resolved = true;
          break;
        } catch (e) {
          if (isCredentialPayload(thrownEntry(e, 'where-used'))) throw e;
          lastErr = e;
        }
      }
      if (!resolved) {
        // Do NOT swallow the failure into an empty result — flag the response
        // as degraded so callers can tell "could not determine appends" apart
        // from "no appends".
        appendsUnavailable = true;
        logger?.warn(
          `where-used failed for ${baseName}: ${messageOf(lastErr)}`,
        );
        return [];
      }
      // Candidate referencing DDIC structures/tables (TABL/*), excluding self.
      // The authoritative filter is the source check below (`extend type`).
      const candidates = new Set<string>();
      for (const ref of references) {
        const name = (ref.name ?? '').trim().toUpperCase();
        if (!name || name === baseName) continue;
        if (!isTablType(ref.type)) continue;
        candidates.add(name);
      }
      const refs: EmbeddedRef[] = [];
      for (const cand of candidates) {
        const read = await readDdl(cand);
        if ('failures' in read) {
          unreadCandidates.push({
            candidate: cand,
            step: 'read append candidate',
            failures: read.failures,
          });
        }
        const csrc = 'source' in read ? read.source : null;
        if (csrc && extendsBase(csrc, baseName)) {
          refs.push({ name: cand, attribute: null, kind: 'append' });
        }
      }
      return refs;
    };

    // Read root source first (structure or table); failure here is fatal.
    const root = await readDdl(rootName);
    if ('failures' in root) {
      // Both endpoints failed: each failure as it is, with its step.
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(root.failures) }],
      };
    }
    if ('absent' in root) {
      return return_error(
        new Error(`Could not read source for structure/table ${rootName}`),
      );
    }
    const rootSource = root.source;

    const visited = new Set<string>([rootName]);

    const buildChildren = async (
      structureName: string,
      source: string,
    ): Promise<StructureNode[]> => {
      // includes come from the source; extensions (appends) from where-used.
      const refs: EmbeddedRef[] = [
        ...parseEmbeddedStructures(source),
        ...(await findExtensions(structureName)),
      ];
      const children: StructureNode[] = [];
      for (const ref of refs) {
        const node: StructureNode = {
          structure: ref.name,
          attribute: ref.attribute,
          kind: ref.kind,
          children: [],
        };

        if (visited.has(ref.name)) {
          node.cyclic = true;
          children.push(node);
          continue;
        }
        visited.add(ref.name);

        const child = await readDdl(ref.name);
        if ('failures' in child) {
          node.error = child.failures;
        } else if ('absent' in child) {
          node.error = `Could not read source for ${ref.name}`;
        } else {
          node.children = await buildChildren(ref.name, child.source);
        }

        children.push(node);
      }
      return children;
    };

    const tree: StructureNode = {
      structure: rootName,
      attribute: null,
      kind: 'root',
      children: await buildChildren(rootName, rootSource),
    };

    return readAnswer(shown, {
      structure_name: rootName,
      // True when a where-used lookup failed, so appends could not be
      // determined and the tree may be missing them (≠ "no appends"). #128
      appends_unavailable: includeExtensions && appendsUnavailable,
      append_candidates_unread: unreadCandidates,
      tree,
    });
  } catch (error) {
    return return_error(error);
  }
}

/** A thrown value's `message`, else the value written out. */
function messageOf(thrown: unknown): string {
  const message = child(thrown, 'message');
  return message === undefined || message === null
    ? String(thrown)
    : String(message);
}

type DdlStep = 'read structure' | 'read table';
type WhereUsedType = AdtCodes<'TABL/DS' | 'TABL/DT'>;

/** A base's where-used is asked as a structure, then as a table. */
const WHERE_USED_TYPES = [
  'TABL/DS',
  'TABL/DT',
] as const satisfies readonly WhereUsedType[];

/** The one type a base's where-used is restricted to: the structures. */
const STRUCTURES_ONLY: AdtCodes<'TABL/DS'> = 'TABL/DS';

/**
 * One endpoint's attempt at a name's DDL, from its answer — the sequential
 * version's `attempt`: the source; or `null`, with the failure recorded and
 * a `404` counted. A credential failure is thrown, as it came.
 */
function attemptOf(
  step: DdlStep,
  result: PhaseResult<DdlAnswer>,
  state: AttemptState,
): string | null {
  try {
    if (!result.ok) throw result.error;
    const answer = result.value;
    const source = extractSource(answer);
    if (source != null) return source;
    if (!answer.ok) {
      const error = answer.getError();
      if (isCredentialPayload(failureEntry(error, step)))
        throw carryingFailure(new Error(error.message), error, step);
      state.failures.push(failureEntry(error, step));
      if (error?.response?.status !== 404) return null;
    }
    state.answered++;
  } catch (thrown) {
    if (isCredentialPayload(thrownEntry(thrown, step))) throw thrown;
    state.failures.push(thrownEntry(thrown, step));
  }
  return null;
}

/** What a DDL read answered. */
type DdlAnswer = IAdtResponse<string, IAdtError>;

/** One name's DDL attempts so far: the failures recorded, the `404`s counted. */
interface AttemptState {
  failures: FailureEntry[];
  answered: number;
}

/** What a where-used request answered. */
type WhereUsedAnswer = Awaited<ReturnType<WhereUsedSource['getWhereUsed']>>;

/** What a where-used scope request answered. */
type ScopeAnswer = Awaited<ReturnType<WhereUsedSource['getWhereUsedScope']>>;

/** What a where-used lookup of a base came to: its references, or its last error. */
type WhereUsedOutcome =
  | { resolved: true; references: Array<{ name?: string; type?: string }> }
  | { resolved: false; lastErr: unknown };

const WHERE_USED_SCOPE = { enableOnlyTypes: [STRUCTURES_ONLY] };

/** A `WhereUsedSource` whose two requests answer `scope` and `whereUsed`. */
function answeredWhereUsed(
  modify: WhereUsedSource['modifyWhereUsedScope'],
  scope: () => Promise<ScopeAnswer>,
  whereUsed: WhereUsedSource['getWhereUsed'],
): WhereUsedSource {
  return {
    getWhereUsedScope: scope,
    modifyWhereUsedScope: modify,
    getWhereUsed: whereUsed,
  };
}

/**
 * An answer as the request's promise gave it: its value, or its rejection;
 * a request no phase sent (`what` names it) rejects in words.
 */
function settledAs<R>(
  result: PhaseResult<R | undefined> | undefined,
  what: string,
): Promise<R> {
  if (result === undefined) {
    return Promise.reject(new Error(`${what} was not sent`));
  }
  if (!result.ok) return Promise.reject(result.error);
  const { value } = result;
  return value === undefined
    ? Promise.reject(new Error(`${what} was not sent`))
    : Promise.resolve(value);
}

/** The entry of `map` for `name`, which an earlier phase set; else a throw in words. */
function readEarlier<V>(map: ReadonlyMap<string, V>, name: string): V {
  const value = map.get(name);
  if (value === undefined) {
    throw new Error(`${name} was not read in an earlier phase`);
  }
  return value;
}

/**
 * The reads of the batched version, by name, and their phases (spec §11):
 * a level's DDL as (a) the structure of every name, (b) the table of every
 * name the first did not find; the where-used of a base as (c1) the scope
 * of each object type, (c2) the scoped where-used of each type whose scope
 * answered. A credential failure any of them answers ends the call: thrown,
 * as the sequential version throws it.
 */
function structureReads(context: HandlerContext, version: ReadVersion) {
  const { logger } = context;
  const structures = new Map<string, PhaseResult<DdlAnswer>>();
  const tables = new Map<string, PhaseResult<DdlAnswer>>();
  const ddl = new Map<string, DdlRead>();
  const scopes = new Map<string, PhaseResult<ScopeAnswer>>();
  const whereUsed = new Map<string, PhaseResult<WhereUsedAnswer | undefined>>();
  const outcomes = new Map<string, WhereUsedOutcome>();
  const pairKey = (name: string, type: WhereUsedType) => `${type}:${name}`;
  // Local: builds the scope document, sends nothing.
  const local = createAdtClient(context.connection, logger).getUtils(ourUtils);
  const modify: WhereUsedSource['modifyWhereUsedScope'] = (xml, options) =>
    local.modifyWhereUsedScope(xml, presentScopeOptions(options));
  const utilsOn = (connection: IAbapConnection) =>
    createAdtClient(connection, logger).getUtils(ourUtils);

  /** The where-used of a base from its answers — the sequential loop. */
  const outcomeOf = async (baseName: string): Promise<WhereUsedOutcome> => {
    const known = outcomes.get(baseName);
    if (known !== undefined) return known;
    let references: Array<{ name?: string; type?: string }> = [];
    let resolved = false;
    let lastErr: unknown;
    for (const objectType of WHERE_USED_TYPES) {
      try {
        const key = pairKey(baseName, objectType);
        const wu = await fetchWhereUsedReferences(
          answeredWhereUsed(
            modify,
            () => settledAs(scopes.get(key), `where-used scope of ${key}`),
            () => settledAs(whereUsed.get(key), `where-used of ${key}`),
          ),
          {
            object_name: baseName,
            object_type: objectType,
            ...WHERE_USED_SCOPE,
          },
        );
        if (!wu.ok) {
          if (isCredentialPayload(failureEntry(wu.getError(), 'where-used')))
            throw carryingFailure(
              new Error(wu.getError().message),
              wu.getError(),
              'where-used',
            );
          lastErr = new Error(wu.getError().message);
          continue;
        }
        references = wu.getResult().value.references;
        resolved = true;
        break;
      } catch (e) {
        if (isCredentialPayload(thrownEntry(e, 'where-used'))) throw e;
        lastErr = e;
      }
    }
    const outcome: WhereUsedOutcome = resolved
      ? { resolved: true, references }
      : { resolved: false, lastErr };
    outcomes.set(baseName, outcome);
    return outcome;
  };

  return {
    /** The DDL of `name`, read in an earlier phase. */
    ddlOf(name: string): DdlRead {
      return readEarlier(ddl, name);
    },
    outcomeOf,
    /** (a), (b): the DDL of every name not read yet. */
    async readDdl(names: readonly string[]): Promise<void> {
      const fresh = [...new Set(names)].filter((name) => !ddl.has(name));
      if (fresh.length === 0) return;
      const read = await runPhase(context, fresh, (name, connection) =>
        createAdtClient(connection, logger)
          .getStructure(structureDocuments)
          .read({ structureName: name }, version, {
            analyse: analyseException,
          }),
      );
      const second: string[] = [];
      fresh.forEach((name, i) => {
        const result = read[i];
        if (!result.ok && endsTheCall(result.error)) throw result.error;
        structures.set(name, result);
        const state: AttemptState = { failures: [], answered: 0 };
        if (attemptOf('read structure', result, state) == null)
          second.push(name);
      });
      const tableRead =
        second.length > 0
          ? await runPhase(context, second, (name, connection) =>
              createAdtClient(connection, logger)
                .getTable(tableDocuments)
                .read({ tableName: name }, version, {
                  analyse: analyseException,
                }),
            )
          : [];
      second.forEach((name, i) => {
        const result = tableRead[i];
        if (!result.ok && endsTheCall(result.error)) throw result.error;
        tables.set(name, result);
      });
      for (const name of fresh) {
        const state: AttemptState = { failures: [], answered: 0 };
        const structure = attemptOf(
          'read structure',
          readEarlier(structures, name),
          state,
        );
        if (structure != null) {
          ddl.set(name, { source: structure });
          continue;
        }
        const table = attemptOf('read table', readEarlier(tables, name), state);
        ddl.set(
          name,
          table != null
            ? { source: table }
            : state.answered === 2
              ? { absent: true }
              : { failures: state.failures },
        );
      }
    },
    /** (c1), (c2): the where-used of every base not looked up yet. */
    async readWhereUsed(bases: readonly string[]): Promise<void> {
      const pairs = [...new Set(bases)]
        .filter((name) => !outcomes.has(name))
        .flatMap((name) =>
          WHERE_USED_TYPES.map((objectType) => ({
            name,
            objectType,
            key: pairKey(name, objectType),
          })),
        )
        .filter((pair) => !scopes.has(pair.key));
      if (pairs.length === 0) return;
      // Sent as `fetchWhereUsedReferences` sends it, through the members
      // it names (`WhereUsedSource`).
      const scoped = await runPhase(context, pairs, (pair, connection) => {
        const source: WhereUsedSource = whereUsedOn(
          context,
          utilsOn(connection),
        );
        return source.getWhereUsedScope({
          object_name: pair.name,
          object_type: pair.objectType,
        });
      });
      pairs.forEach((pair, i) => {
        const result = scoped[i];
        if (!result.ok && endsTheCall(result.error)) throw result.error;
        scopes.set(pair.key, result);
      });
      const answered = pairs.filter((pair) => {
        const scope = scopes.get(pair.key);
        return scope?.ok === true && scope.value.ok;
      });
      const found =
        answered.length > 0
          ? await runPhase(context, answered, async (pair, connection) => {
              const source: WhereUsedSource = whereUsedOn(
                context,
                utilsOn(connection),
              );
              let sent: Promise<WhereUsedAnswer> | undefined;
              try {
                await fetchWhereUsedReferences(
                  answeredWhereUsed(
                    modify,
                    () =>
                      settledAs(
                        scopes.get(pair.key),
                        `where-used scope of ${pair.key}`,
                      ),
                    (params) => {
                      sent = source.getWhereUsed(params);
                      return sent;
                    },
                  ),
                  {
                    object_name: pair.name,
                    object_type: pair.objectType,
                    ...WHERE_USED_SCOPE,
                  },
                );
              } catch {
                // The request's own answer is kept below, as it came.
              }
              return sent;
            })
          : [];
      answered.forEach((pair, i) => {
        const result = found[i];
        if (!result.ok && endsTheCall(result.error)) throw result.error;
        whereUsed.set(pair.key, result);
      });
      // A credential failure the lookups answered ends the call now.
      for (const name of new Set(pairs.map((pair) => pair.name))) {
        await outcomeOf(name);
      }
    },
  };
}

type StructureReads = ReturnType<typeof structureReads>;

/**
 * Whether an append candidate's source states `extend type <base> with`:
 * the words in any case, one or more white-space characters apart.
 */
export function extendsBase(source: string, baseName: string): boolean {
  return holdsPhrase(source, ['extend', 'type', baseName, 'with']);
}

/** Whether a where-used reference's type is a `TABL` one, in any case. */
function isTablType(type: string | undefined): boolean {
  return wordAt(type ?? '', 0, 'TABL/');
}

/** The append candidates a where-used outcome names: referencing TABL objects, not the base. */
function candidatesOf(baseName: string, outcome: WhereUsedOutcome): string[] {
  if (!outcome.resolved) return [];
  const candidates = new Set<string>();
  for (const ref of outcome.references) {
    const name = (ref.name ?? '').trim().toUpperCase();
    if (!name || name === baseName) continue;
    if (!isTablType(ref.type)) continue;
    candidates.add(name);
  }
  return [...candidates];
}

/**
 * One structure's tree from the phases' answers — the sequential version's
 * walk, depth first, over the answers instead of requests: the same tree,
 * the same `cyclic` marks, the same `appends_unavailable` and
 * `append_candidates_unread`, the same failure answer.
 */
async function structureTreeFromAnswers(
  context: HandlerContext,
  rootName: string,
  includeExtensions: boolean,
  reads: StructureReads,
  shown: StructuresShown,
): Promise<McpResult> {
  const { logger } = context;
  try {
    let appendsUnavailable = false;
    const unreadCandidates: Array<{
      candidate: string;
      step: 'read append candidate';
      failures: FailureEntry[];
    }> = [];
    const findExtensions = async (baseName: string): Promise<EmbeddedRef[]> => {
      if (!includeExtensions) return [];
      const outcome = await reads.outcomeOf(baseName);
      if (!outcome.resolved) {
        appendsUnavailable = true;
        logger?.warn(
          `where-used failed for ${baseName}: ${messageOf(outcome.lastErr)}`,
        );
        return [];
      }
      const refs: EmbeddedRef[] = [];
      for (const cand of candidatesOf(baseName, outcome)) {
        const read = reads.ddlOf(cand);
        if ('failures' in read) {
          unreadCandidates.push({
            candidate: cand,
            step: 'read append candidate',
            failures: read.failures,
          });
        }
        const csrc = 'source' in read ? read.source : null;
        if (csrc && extendsBase(csrc, baseName)) {
          refs.push({ name: cand, attribute: null, kind: 'append' });
        }
      }
      return refs;
    };

    const root = reads.ddlOf(rootName);
    if ('failures' in root) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(root.failures) }],
      };
    }
    if ('absent' in root) {
      return return_error(
        new Error(`Could not read source for structure/table ${rootName}`),
      );
    }

    const visited = new Set<string>([rootName]);
    const buildChildren = async (
      structureName: string,
      source: string,
    ): Promise<StructureNode[]> => {
      const refs: EmbeddedRef[] = [
        ...parseEmbeddedStructures(source),
        ...(await findExtensions(structureName)),
      ];
      const children: StructureNode[] = [];
      for (const ref of refs) {
        const node: StructureNode = {
          structure: ref.name,
          attribute: ref.attribute,
          kind: ref.kind,
          children: [],
        };
        if (visited.has(ref.name)) {
          node.cyclic = true;
          children.push(node);
          continue;
        }
        visited.add(ref.name);
        const child = reads.ddlOf(ref.name);
        if ('failures' in child) {
          node.error = child.failures;
        } else if ('absent' in child) {
          node.error = `Could not read source for ${ref.name}`;
        } else {
          node.children = await buildChildren(ref.name, child.source);
        }
        children.push(node);
      }
      return children;
    };

    const tree: StructureNode = {
      structure: rootName,
      attribute: null,
      kind: 'root',
      children: await buildChildren(rootName, root.source),
    };
    return readAnswer(shown, {
      structure_name: rootName,
      // True when a where-used lookup failed, so appends could not be
      // determined and the tree may be missing them (≠ "no appends"). #128
      appends_unavailable: includeExtensions && appendsUnavailable,
      append_candidates_unread: unreadCandidates,
      tree,
    });
  } catch (error) {
    return return_error(error);
  }
}

/**
 * Every structure's tree in ADT batch envelopes (spec §11), one level at a
 * time, as the package walks read: per level, (a) the structure source of
 * every node, (b) the table source of the nodes (a) did not find; with
 * `include_extensions`, then (c1) the where-used scope pair (structure,
 * table) of every node read, (c2) the scoped where-used of every scope that
 * answered, (d) the source of every append candidate (structure, then
 * table). The next level is the embedded and append structures found, not
 * reached before. Each name is read once for the call. Each tree is then
 * the sequential version's walk over these answers. A credential failure
 * ends the call: thrown.
 */
async function structureTrees(
  context: HandlerContext,
  rootNames: readonly string[],
  version: ReadVersion,
  includeExtensions: boolean,
  shown: StructuresShown,
) {
  const reads = structureReads(context, version);
  const walks = rootNames.map((name) => ({
    reached: new Set([name]),
    level: [name],
  }));
  while (walks.some((walk) => walk.level.length > 0)) {
    await reads.readDdl(walks.flatMap((walk) => walk.level));
    // The nodes of the level whose source was read: their children are next.
    const built = walks.map((walk) =>
      walk.level.flatMap((name) => {
        const read = reads.ddlOf(name);
        return 'source' in read ? [{ name, source: read.source }] : [];
      }),
    );
    const appends = new Map<string, string[]>();
    if (includeExtensions) {
      const bases = built.flat().map((node) => node.name);
      await reads.readWhereUsed(bases);
      const candidates = new Map<string, string[]>();
      for (const base of new Set(bases)) {
        candidates.set(base, candidatesOf(base, await reads.outcomeOf(base)));
      }
      await reads.readDdl([...candidates.values()].flat());
      for (const [base, names] of candidates) {
        appends.set(
          base,
          names.filter((name) => {
            const read = reads.ddlOf(name);
            return (
              'source' in read &&
              read.source !== '' &&
              extendsBase(read.source, base)
            );
          }),
        );
      }
    }
    walks.forEach((walk, i) => {
      const next: string[] = [];
      for (const node of built[i] ?? []) {
        const children = [
          ...parseEmbeddedStructures(node.source).map((ref) => ref.name),
          ...(appends.get(node.name) ?? []),
        ];
        for (const name of children) {
          if (walk.reached.has(name)) continue;
          walk.reached.add(name);
          next.push(name);
        }
      }
      walk.level = next;
    });
  }
  const trees: McpResult[] = [];
  for (const rootName of rootNames) {
    trees.push(
      await structureTreeFromAnswers(
        context,
        rootName,
        includeExtensions,
        reads,
        shown,
      ),
    );
  }
  return trees;
}

/** An answer's payload: its JSON, else its text. */
function payloadOfAnswer(result: McpResult): JsonValue {
  return answerPayload(result);
}

/** Whether an answer is a credential failure: it ends a call for several structures. */
function endsList(result: McpResult): boolean {
  const failed = failedPayloadOf(result, 'read structure');
  return failed !== undefined && isCredentialPayload(failed);
}

/** What a list call answers from: the entries asked, and each one's answer. */
interface ListOf {
  readonly names: readonly string[];
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
  names: readonly string[],
  results: readonly McpResult[],
  level: DetailLevel,
): McpResult {
  return listAnswerAt(LIST_ANSWERS, level)({ names, results });
}

/** A list call's terse text. */
function terseList({ names, results }: ListOf): Written<TextResult> {
  // Every structure's text written by the listing writer: a failure under
  // its escaped `# structure` line and one `# error` line; an answered one
  // as its own terse listing.
  const text = writeListing({
    heads: [],
    reading: {
      answered: results.map((result, i) => ({
        name: names[i] ?? '',
        answer: answerPayload(result),
        read: result.isError ? undefined : readsOf.get(result),
      })),
    },
    lists: {
      answered: partsOf(
        'answered',
        ({ name, answer, read }: AnsweredStructure): Head[] =>
          read === undefined
            ? [
                { head: 'structure', value: name },
                {
                  head: 'error',
                  value: JSON.stringify(answer),
                },
              ]
            : [],
        'read',
        byListing(STRUCTURES_LISTS, structuresListing),
      ),
    },
  });
  return asTextResult(text);
}

/** One structure of a list call: its name, its answer, and its read when answered. */
interface AnsweredStructure {
  readonly name: string;
  readonly answer: JsonValue;
  readonly read: StructuresRead | undefined;
}

/** A list call's entries as a JSON array. */
function jsonList({ names, results }: ListOf): Written<TextResult> {
  // Every answer one entry, written by the listing writer.
  return asJsonResult(
    writeJsonList(
      { answered: results.map(listedAnswer) },
      values('answered', ({ isError, answer, i }: ListedAnswer) =>
        ((isError, answer, i) =>
          isError ? { structure_name: names[i], error: answer } : answer)(
          isError,
          answer,
          i,
        ),
      ),
    ),
  );
}

/**
 * The tool's answer; at `raw` what ADT sent — the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleGetStructuresList(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetStructuresList',
        shape: 'assembled',
      },
      () => answeredGetStructuresList(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetStructuresList(context, args);
}

async function answeredGetStructuresList(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  // The schema holds the rule: `structure_name`, or a non-empty
  // `structure_names` of names alone.
  const listed = args?.structure_names;
  const version = args?.version ?? 'active';
  const includeExtensions = args?.include_extensions !== false;
  const level = levelOf(args);
  const shown = listAnswerAt(STRUCTURES_ANSWERS, levelOf(args));
  const sequential = (structure_name: string) => {
    const { structure_names: _list, ...rest } = args;
    return structuresListOf(context, { ...rest, structure_name }, shown);
  };
  try {
    if (listed === undefined) {
      const structure_name = args.structure_name ?? '';
      return await withSequentialFallback<McpResult>(
        context,
        async () =>
          (
            await structureTrees(
              context,
              [structure_name.toUpperCase()],
              version,
              includeExtensions,
              shown,
            )
          )[0],
        () => sequential(structure_name),
      );
    }
    const names = listed.map((name) => name.toUpperCase());
    return await withSequentialFallback<McpResult>(
      context,
      async () =>
        listAnswer(
          names,
          await structureTrees(
            context,
            names,
            version,
            includeExtensions,
            shown,
          ),
          level,
        ),
      async () => {
        // One structure after another, each as the single call reads it; a
        // credential failure ends the call, and nothing after it is read.
        const results: McpResult[] = [];
        for (const name of listed) {
          const result = await sequential(name);
          if (endsList(result)) return result;
          results.push(result);
        }
        return listAnswer(names, results, level);
      },
    );
  } catch (error) {
    return return_error(error);
  }
}
