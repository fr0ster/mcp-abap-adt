import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetStructuresList',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Recursively list the structures embedded in an ABAP structure (.INCLUDE / append), as a tree.',
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

function extractSource(readResult: any): string | null {
  // Library may return { data } or { readResult: { data } }.
  const data = readResult?.readResult?.data ?? readResult?.data;
  if (data == null) return null;
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
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
    if (!structure_name)
      return return_error(new Error('structure_name is required'));

    const client = createAdtClient(connection, logger);
    const obj = client.getStructure();
    const utils = client.getUtils();
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
        );
        const s = extractSource(sr);
        if (s != null) return s;
      } catch {
        // fall through to table
      }
      try {
        const tr = await client
          .getTable()
          .read({ tableName: name }, version as 'active' | 'inactive');
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
      // Use getWhereUsedList with enableAllTypes: the DEFAULT where-used scope
      // leaves some object types unselected, so an extension's type may be
      // excluded and the search returns nothing useful. enableAllTypes selects
      // every type, and the result is already parsed into { name, type } refs.
      let references: Array<{ name?: string; type?: string }> = [];
      try {
        const wu = await utils.getWhereUsedList({
          object_name: baseName,
          object_type: 'structure',
          enableAllTypes: true,
        } as any);
        references = (wu?.references ?? []) as Array<{
          name?: string;
          type?: string;
        }>;
      } catch (e: any) {
        logger?.warn(
          `where-used failed for ${baseName}: ${e?.message ?? String(e)}`,
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
