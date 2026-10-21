import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type FailureEntry,
  failedPayloadOf,
  failureEntry,
  isCredentialPayload,
  type McpResult,
  thrownEntry,
} from '../../../lib/answer';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import { endsTheCall } from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { carryingFailure } from '../../../lib/strategies/step';
import {
  fetchWhereUsedReferences,
  type WhereUsedSource,
  whereUsedOn,
} from '../../../lib/strategies/whereUsedList';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetStructuresList',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Recursively list the structures embedded in an ABAP structure (.INCLUDE / append), as a tree. ' +
      'Takes structure_name (one structure: its tree) or structure_names (several structures: one entry per structure, in the order given, each its tree answer or { structure_name, error }). ' +
      'Works on BASIS 7.50 and later, where the DDIC structure/table endpoints it reads exist; ' +
      'legacy systems (BASIS < 7.50) refuse it (issue #207).',
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      structure_name: {
        type: 'string',
        description: 'Structure name (or give structure_names).',
      },
      structure_names: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Several structure names, read together (give this or structure_name).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
      include_extensions: {
        type: 'boolean',
        description:
          '[read-only] Also find extension (append) structures via where-used (objects that `extend type <this> with …`). Default true. Set false to skip the (slower) where-used lookups and return includes only.',
        default: true,
      },
    },
    required: [],
  },
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

  const lines = source.split(/\r?\n/);
  for (const rawLine of lines) {
    // Strip line comments (both classic '* ' and DDL '//').
    let line = rawLine.replace(/\/\/.*$/, '');
    line = line.trim();
    if (!line || line.startsWith('@') || line.startsWith('*')) continue;

    // Classic field-list include: .INCLUDE <name>
    // NOTE: appends are NOT parsed from source — ADT does not emit a `.APPEND`
    // line in a structure's source. An append is a separate object that
    // `extend type <this> with …`; those are resolved via where-used in
    // findExtensions(), not here.
    const classicInclude = line.match(/^\.include\s+([a-z0-9_/]+)/i);
    if (classicInclude) {
      refs.push({
        name: classicInclude[1].toUpperCase(),
        attribute: null,
        kind: 'include',
      });
      continue;
    }

    // Modern DDL named include: `<attr> : include <name>;`
    const namedInclude = line.match(
      /^([a-z][a-z0-9_]*)\s*:\s*include\s+([a-z0-9_/]+)\s*;?/i,
    );
    if (namedInclude) {
      refs.push({
        name: namedInclude[2].toUpperCase(),
        attribute: namedInclude[1].toLowerCase(),
        kind: 'include',
      });
      continue;
    }

    // Modern DDL anonymous include: `include <name>;`
    const ddlInclude = line.match(/^include\s+([a-z0-9_/]+)\s*;?/i);
    if (ddlInclude) {
      refs.push({
        name: ddlInclude[1].toUpperCase(),
        attribute: null,
        kind: 'include',
      });
    }
  }

  return refs;
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
function extractSource(result: unknown): string | null {
  if (
    result !== null &&
    typeof result === 'object' &&
    'ok' in result &&
    (result as { ok: unknown }).ok === true &&
    'getResult' in result
  ) {
    const value = (result as { getResult(): { value: unknown } }).getResult()
      .value;
    if (value == null) return null;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return null;
}

async function structuresListOf(
  context: HandlerContext,
  args: {
    structure_name: string;
    version?: 'active' | 'inactive';
    include_extensions?: boolean;
  },
) {
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
    if (!structure_name)
      return return_error(new Error('structure_name is required'));

    const client = createAdtClient(connection, logger);
    const obj = client.getStructure();
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
        read: () => Promise<unknown>,
      ): Promise<string | null> => {
        try {
          const answer = await read();
          const source = extractSource(answer);
          if (source != null) return source;
          const failed = answer as {
            ok?: unknown;
            getError?: () => IAdtError;
          };
          if (failed?.ok === false && typeof failed.getError === 'function') {
            const error = failed.getError();
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
        obj.read({ structureName: name }, version as 'active' | 'inactive', {
          analyse: analyseException,
        }),
      );
      if (structure != null) return { source: structure };
      const table = await attempt('read table', () =>
        client
          .getTable()
          .read({ tableName: name }, version as 'active' | 'inactive', {
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
      // (enableOnlyTypes: ['TABL/DS']). where-used caps the number of returned
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
      for (const objectType of ['structure', 'table'] as const) {
        try {
          const wu = await fetchWhereUsedReferences(
            whereUsedOn(context, utils),
            {
              object_name: baseName,
              object_type: objectType,
              enableOnlyTypes: ['TABL/DS'],
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
          `where-used failed for ${baseName}: ${
            (lastErr as any)?.message ?? String(lastErr)
          }`,
        );
        return [];
      }
      // Candidate referencing DDIC structures/tables (TABL/*), excluding self.
      // The authoritative filter is the source check below (`extend type`).
      const candidates = new Set<string>();
      for (const ref of references) {
        const name = (ref.name ?? '').trim().toUpperCase();
        if (!name || name === baseName) continue;
        if (!/^TABL\//i.test(ref.type ?? '')) continue;
        candidates.add(name);
      }
      const extendRe = new RegExp(
        `extend\\s+type\\s+${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+with`,
        'i',
      );
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
        if (csrc && extendRe.test(csrc)) {
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
        content: [
          { type: 'text', text: JSON.stringify(root.failures, null, 2) },
        ],
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

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          structure_name: rootName,
          // True when a where-used lookup failed, so appends could not be
          // determined and the tree may be missing them (≠ "no appends"). #128
          ...(includeExtensions && appendsUnavailable
            ? { appends_unavailable: true }
            : {}),
          ...(unreadCandidates.length > 0
            ? { append_candidates_unread: unreadCandidates }
            : {}),
          tree,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}

type DdlStep = 'read structure' | 'read table';
type WhereUsedType = 'structure' | 'table';

/**
 * One endpoint's attempt at a name's DDL, from its answer — the sequential
 * version's `attempt`: the source; or `null`, with the failure recorded and
 * a `404` counted. A credential failure is thrown, as it came.
 */
function attemptOf(
  step: DdlStep,
  result: PhaseResult<unknown>,
  state: { failures: FailureEntry[]; answered: number },
): string | null {
  try {
    if (!result.ok) throw result.error;
    const answer = result.value;
    const source = extractSource(answer);
    if (source != null) return source;
    const failed = answer as {
      ok?: unknown;
      getError?: () => IAdtError;
    };
    if (failed?.ok === false && typeof failed.getError === 'function') {
      const error = failed.getError();
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

/** What a where-used lookup of a base came to: its references, or its last error. */
type WhereUsedOutcome =
  | { resolved: true; references: Array<{ name?: string; type?: string }> }
  | { resolved: false; lastErr: unknown };

const WHERE_USED_SCOPE = { enableOnlyTypes: ['TABL/DS'] };

/** A `WhereUsedSource` whose two requests answer `scope` and `whereUsed`. */
function answeredWhereUsed(
  modify: WhereUsedSource['modifyWhereUsedScope'],
  scope: PhaseResult<unknown>,
  whereUsed: (
    params: Parameters<WhereUsedSource['getWhereUsed']>[0],
  ) => unknown,
): WhereUsedSource {
  return {
    getWhereUsedScope: () => settledAs(scope) as never,
    modifyWhereUsedScope: modify,
    getWhereUsed: (params) => whereUsed(params) as never,
  };
}

/** An answer as the request's promise gave it: its value, or its rejection. */
const settledAs = (result: PhaseResult<unknown>): Promise<unknown> =>
  result.ok ? Promise.resolve(result.value) : Promise.reject(result.error);

/**
 * The reads of the batched version, by name, and their phases (spec §11):
 * a level's DDL as (a) the structure of every name, (b) the table of every
 * name the first did not find; the where-used of a base as (c1) the scope
 * of each object type, (c2) the scoped where-used of each type whose scope
 * answered. A credential failure any of them answers ends the call: thrown,
 * as the sequential version throws it.
 */
function structureReads(
  context: HandlerContext,
  version: 'active' | 'inactive',
) {
  const { logger } = context;
  const structures = new Map<string, PhaseResult<unknown>>();
  const tables = new Map<string, PhaseResult<unknown>>();
  const ddl = new Map<string, DdlRead>();
  const scopes = new Map<string, PhaseResult<unknown>>();
  const whereUsed = new Map<string, PhaseResult<unknown>>();
  const outcomes = new Map<string, WhereUsedOutcome>();
  const pairKey = (name: string, type: WhereUsedType) => `${type}:${name}`;
  // Local: builds the scope document, sends nothing.
  const local = createAdtClient(context.connection, logger).getUtils(ourUtils);
  const modify: WhereUsedSource['modifyWhereUsedScope'] = (xml, options) =>
    local.modifyWhereUsedScope(xml, options);
  const utilsOn = (connection: IAbapConnection) =>
    createAdtClient(connection, logger).getUtils(ourUtils);

  /** The where-used of a base from its answers — the sequential loop. */
  const outcomeOf = async (baseName: string): Promise<WhereUsedOutcome> => {
    const known = outcomes.get(baseName);
    if (known !== undefined) return known;
    let references: Array<{ name?: string; type?: string }> = [];
    let resolved = false;
    let lastErr: unknown;
    for (const objectType of ['structure', 'table'] as const) {
      try {
        const key = pairKey(baseName, objectType);
        const wu = await fetchWhereUsedReferences(
          answeredWhereUsed(
            modify,
            scopes.get(key) as PhaseResult<unknown>,
            () => settledAs(whereUsed.get(key) as PhaseResult<unknown>),
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
      return ddl.get(name) as DdlRead;
    },
    outcomeOf,
    /** (a), (b): the DDL of every name not read yet. */
    async readDdl(names: readonly string[]): Promise<void> {
      const fresh = [...new Set(names)].filter((name) => !ddl.has(name));
      if (fresh.length === 0) return;
      const read = await runPhase(context, fresh, (name, connection) =>
        createAdtClient(connection, logger)
          .getStructure()
          .read({ structureName: name }, version, {
            analyse: analyseException,
          }),
      );
      const second: string[] = [];
      fresh.forEach((name, i) => {
        const result = read[i] as PhaseResult<unknown>;
        if (!result.ok && endsTheCall(result.error)) throw result.error;
        structures.set(name, result);
        const state = { failures: [] as FailureEntry[], answered: 0 };
        if (attemptOf('read structure', result, state) == null)
          second.push(name);
      });
      const tableRead =
        second.length > 0
          ? await runPhase(context, second, (name, connection) =>
              createAdtClient(connection, logger)
                .getTable()
                .read({ tableName: name }, version, {
                  analyse: analyseException,
                }),
            )
          : [];
      second.forEach((name, i) => {
        const result = tableRead[i] as PhaseResult<unknown>;
        if (!result.ok && endsTheCall(result.error)) throw result.error;
        tables.set(name, result);
      });
      for (const name of fresh) {
        const state = { failures: [] as FailureEntry[], answered: 0 };
        const structure = attemptOf(
          'read structure',
          structures.get(name) as PhaseResult<unknown>,
          state,
        );
        if (structure != null) {
          ddl.set(name, { source: structure });
          continue;
        }
        const table = attemptOf(
          'read table',
          tables.get(name) as PhaseResult<unknown>,
          state,
        );
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
          (['structure', 'table'] as const).map((objectType) => ({
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
        const result = scoped[i] as PhaseResult<unknown>;
        if (!result.ok && endsTheCall(result.error)) throw result.error;
        scopes.set(pair.key, result);
      });
      const answered = pairs.filter((pair) => {
        const scope = scopes.get(pair.key) as PhaseResult<unknown>;
        return (
          scope.ok && (scope.value as { ok?: unknown } | undefined)?.ok === true
        );
      });
      const found =
        answered.length > 0
          ? await runPhase(context, answered, async (pair, connection) => {
              const source: WhereUsedSource = whereUsedOn(
                context,
                utilsOn(connection),
              );
              let sent: Promise<unknown> | undefined;
              try {
                await fetchWhereUsedReferences(
                  answeredWhereUsed(
                    modify,
                    scopes.get(pair.key) as PhaseResult<unknown>,
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
              return sent as Promise<unknown>;
            })
          : [];
      answered.forEach((pair, i) => {
        const result = found[i] as PhaseResult<unknown>;
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

/** The `extend type <base> with` test an append candidate's source passes. */
const extendsBase = (baseName: string) =>
  new RegExp(
    `extend\\s+type\\s+${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+with`,
    'i',
  );

/** The append candidates a where-used outcome names: referencing TABL objects, not the base. */
function candidatesOf(baseName: string, outcome: WhereUsedOutcome): string[] {
  if (!outcome.resolved) return [];
  const candidates = new Set<string>();
  for (const ref of outcome.references) {
    const name = (ref.name ?? '').trim().toUpperCase();
    if (!name || name === baseName) continue;
    if (!/^TABL\//i.test(ref.type ?? '')) continue;
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
) {
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
          `where-used failed for ${baseName}: ${
            (outcome.lastErr as any)?.message ?? String(outcome.lastErr)
          }`,
        );
        return [];
      }
      const extendRe = extendsBase(baseName);
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
        if (csrc && extendRe.test(csrc)) {
          refs.push({ name: cand, attribute: null, kind: 'append' });
        }
      }
      return refs;
    };

    const root = reads.ddlOf(rootName);
    if ('failures' in root) {
      return {
        isError: true,
        content: [
          { type: 'text', text: JSON.stringify(root.failures, null, 2) },
        ],
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
    return return_response({
      data: JSON.stringify(
        {
          success: true,
          structure_name: rootName,
          ...(includeExtensions && appendsUnavailable
            ? { appends_unavailable: true }
            : {}),
          ...(unreadCandidates.length > 0
            ? { append_candidates_unread: unreadCandidates }
            : {}),
          tree,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
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
  version: 'active' | 'inactive',
  includeExtensions: boolean,
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
        const extendRe = extendsBase(base);
        appends.set(
          base,
          names.filter((name) => {
            const read = reads.ddlOf(name);
            return (
              'source' in read &&
              read.source !== '' &&
              extendRe.test(read.source)
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
      (await structureTreeFromAnswers(
        context,
        rootName,
        includeExtensions,
        reads,
      )) as McpResult,
    );
  }
  return trees;
}

/** An answer's payload: its JSON, else its text. */
function payloadOfAnswer(result: McpResult): unknown {
  const text = result.content[0]?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Whether an answer is a credential failure: it ends a call for several structures. */
function endsList(result: McpResult): boolean {
  const failed = failedPayloadOf(result, 'read structure');
  return failed !== undefined && isCredentialPayload(failed);
}

/** A list call's answer: one entry per structure, in the order asked. */
function listAnswer(
  names: readonly string[],
  results: readonly McpResult[],
): McpResult {
  const entries = results.map((result, i) =>
    result.isError
      ? { structure_name: names[i], error: payloadOfAnswer(result) }
      : payloadOfAnswer(result),
  );
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }],
  };
}

export async function handleGetStructuresList(
  context: HandlerContext,
  args: {
    structure_name?: string;
    structure_names?: string[];
    version?: 'active' | 'inactive';
    include_extensions?: boolean;
  },
) {
  const listed = args?.structure_names;
  const version = args?.version ?? 'active';
  const includeExtensions = args?.include_extensions !== false;
  const sequential = (structure_name: string) => {
    const { structure_names: _list, ...rest } = args;
    return structuresListOf(context, {
      ...rest,
      structure_name,
    }) as Promise<McpResult>;
  };
  try {
    if (listed === undefined) {
      const structure_name = args?.structure_name;
      if (!structure_name) {
        return await sequential(structure_name as string);
      }
      return await withSequentialFallback<McpResult>(
        context,
        async () =>
          (
            await structureTrees(
              context,
              [structure_name.toUpperCase()],
              version,
              includeExtensions,
            )
          )[0] as McpResult,
        () => sequential(structure_name),
      );
    }
    if (
      args.structure_name !== undefined ||
      !Array.isArray(listed) ||
      listed.length === 0 ||
      listed.some((name) => typeof name !== 'string' || name === '')
    ) {
      return return_error(
        'Give exactly one of structure_name or structure_names (a non-empty list of names)',
      );
    }
    const names = listed.map((name) => name.toUpperCase());
    return await withSequentialFallback<McpResult>(
      context,
      async () =>
        listAnswer(
          names,
          await structureTrees(context, names, version, includeExtensions),
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
        return listAnswer(names, results);
      },
    );
  } catch (error: any) {
    return return_error(error);
  }
}
