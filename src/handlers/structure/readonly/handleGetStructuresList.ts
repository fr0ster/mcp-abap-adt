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
      timeout: {
        type: 'number',
        description: '[read-only] Timeout in ms for each ADT request.',
      },
    },
    required: ['structure_name'],
  },
} as const;

interface StructureNode {
  structure: string; // the structure's own name (root = the requested structure)
  kind: 'root' | 'include' | 'append'; // how THIS node is embedded into its parent
  children: StructureNode[]; // embedded structures of this one
  cyclic?: boolean;
  error?: string; // if this node's source could not be read
}

interface EmbeddedRef {
  name: string;
  kind: 'include' | 'append';
}

/**
 * Parses structure DDL/field-list source for embedded structures
 * (.INCLUDE / .APPEND / modern DDL `include`). Plain component lines are
 * ignored — only embedded STRUCTURES are returned.
 */
function parseEmbeddedStructures(source: string): EmbeddedRef[] {
  const refs: EmbeddedRef[] = [];
  if (!source) return refs;

  const lines = source.split(/\r?\n/);
  for (const rawLine of lines) {
    // Strip line comments (both classic '* ' and DDL '//').
    let line = rawLine.replace(/\/\/.*$/, '');
    line = line.trim();
    if (!line) continue;

    // Classic field-list: .INCLUDE <name> / .APPEND[STRUCTURE] <name>
    const classicAppend = line.match(
      /^\.append(?:structure)?\s+([a-z0-9_/]+)/i,
    );
    if (classicAppend) {
      refs.push({ name: classicAppend[1].toUpperCase(), kind: 'append' });
      continue;
    }
    const classicInclude = line.match(/^\.include\s+([a-z0-9_/]+)/i);
    if (classicInclude) {
      refs.push({ name: classicInclude[1].toUpperCase(), kind: 'include' });
      continue;
    }

    // Modern DDL: `include <name>;`
    const ddlInclude = line.match(/^include\s+([a-z0-9_/]+)\s*;?/i);
    if (ddlInclude) {
      refs.push({ name: ddlInclude[1].toUpperCase(), kind: 'include' });
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
    timeout?: number;
  },
) {
  const { connection, logger } = context;
  try {
    const { structure_name, version = 'active' } = args;
    if (!structure_name)
      return return_error(new Error('structure_name is required'));

    const client = createAdtClient(connection, logger);
    const obj = client.getStructure();
    const rootName = structure_name.toUpperCase();

    // Read root source first; failure here is fatal for the whole call.
    let rootSource: string | null;
    try {
      const readResult = await obj.read(
        { structureName: rootName },
        version as 'active' | 'inactive',
      );
      rootSource = extractSource(readResult);
    } catch (e: any) {
      return return_error(
        new Error(
          `Could not read structure ${rootName}: ${e?.message ?? String(e)}`,
        ),
      );
    }
    if (rootSource == null) {
      return return_error(
        new Error(`Could not read source for structure ${rootName}`),
      );
    }

    const visited = new Set<string>([rootName]);

    const buildChildren = async (source: string): Promise<StructureNode[]> => {
      const refs = parseEmbeddedStructures(source);
      const children: StructureNode[] = [];
      for (const ref of refs) {
        const node: StructureNode = {
          structure: ref.name,
          kind: ref.kind,
          children: [],
        };

        if (visited.has(ref.name)) {
          node.cyclic = true;
          children.push(node);
          continue;
        }
        visited.add(ref.name);

        try {
          const childResult = await obj.read(
            { structureName: ref.name },
            version as 'active' | 'inactive',
          );
          const childSource = extractSource(childResult);
          if (childSource == null) {
            node.error = `Could not read source for structure ${ref.name}`;
          } else {
            node.children = await buildChildren(childSource);
          }
        } catch (e: any) {
          logger?.warn(
            `Could not read source for ${ref.name}: ${e?.message ?? String(e)}`,
          );
          node.error = e?.message ?? String(e);
        }

        children.push(node);
      }
      return children;
    };

    const tree: StructureNode = {
      structure: rootName,
      kind: 'root',
      children: await buildChildren(rootSource),
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
