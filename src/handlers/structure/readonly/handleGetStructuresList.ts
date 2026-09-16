import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { fetchWhereUsedReferences } from '../../../lib/strategies/whereUsedList';
import {
  type AxiosResponse,
  isLegacyConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetStructuresList',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Recursively list the structures embedded in an ABAP structure (.INCLUDE / append), as a tree. ' +
    'Refused outright on legacy systems (BASIS < 7.50): AdtClientLegacy.getStructure()/getTable() both throw — the ' +
    'DDIC structure/table endpoints this needs are not present there (issue #207).',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name (e.g., Z_MY_STRUCTURE).',
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
      timeout: {
        type: 'number',
        description: '[read-only] Timeout in ms for each ADT request.',
      },
    },
    required: ['structure_name'],
  },
} as const;

interface StructureNode {
  structure: string; // the embedded structure's own name (root = the requested structure)
  attribute: string | null; // component name it is embedded under (null = anonymous / root)
  kind: 'root' | 'include' | 'append'; // how THIS node is embedded into its parent
  children: StructureNode[]; // embedded structures of this one
  cyclic?: boolean;
  error?: string; // if this node's source could not be read
}

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

export async function handleGetStructuresList(
  context: HandlerContext,
  args: {
    structure_name: string;
    version?: 'active' | 'inactive';
    include_extensions?: boolean;
    timeout?: number;
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
    if (!structure_name)
      return return_error(new Error('structure_name is required'));

    // `AdtClientLegacy.getStructure()`/`getTable()` both throw synchronously
    // — the DDIC structure/table endpoints this needs are absent from a
    // legacy system's discovery catalog. Refuse before either call.
    if (isLegacyConnection()) {
      return return_error(
        new Error(
          'Structures and tables are not available on legacy SAP systems (BASIS < 7.50): the DDIC endpoints this needs are not present there.',
        ),
      );
    }

    const client = createAdtClient(connection, logger);
    const obj = client.getStructure();
    const utils = client.getUtils(ourUtils);
    const rootName = structure_name.toUpperCase();

    /**
     * Read the DDL source of a structure OR table (the embed/extend syntax is
     * identical, and an extension's base is often a table). Try the structure
     * endpoint first, fall back to the table endpoint.
     */
    const readDdl = async (name: string): Promise<string | null> => {
      try {
        const sr = await obj.read(
          { structureName: name },
          version as 'active' | 'inactive',
          { analyse: analyseException },
        );
        const s = extractSource(sr);
        if (s != null) return s;
      } catch {
        // fall through to table
      }
      try {
        const tr = await client
          .getTable()
          .read({ tableName: name }, version as 'active' | 'inactive', {
            analyse: analyseException,
          });
        return extractSource(tr);
      } catch {
        return null;
      }
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
          const wu = await fetchWhereUsedReferences(utils, {
            object_name: baseName,
            object_type: objectType,
            enableOnlyTypes: ['TABL/DS'],
          });
          if (!wu.ok) {
            lastErr = new Error(wu.getError().message);
            continue;
          }
          references = wu.getResult().value.references;
          resolved = true;
          break;
        } catch (e) {
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
        const csrc = await readDdl(cand);
        if (csrc && extendRe.test(csrc)) {
          refs.push({ name: cand, attribute: null, kind: 'append' });
        }
      }
      return refs;
    };

    // Read root source first (structure or table); failure here is fatal.
    const rootSource = await readDdl(rootName);
    if (rootSource == null) {
      return return_error(
        new Error(`Could not read source for structure/table ${rootName}`),
      );
    }

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

        const childSource = await readDdl(ref.name);
        if (childSource == null) {
          node.error = `Could not read source for ${ref.name}`;
        } else {
          node.children = await buildChildren(ref.name, childSource);
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
