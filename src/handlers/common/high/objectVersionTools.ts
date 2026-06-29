/**
 * Per-object HIGH-LEVEL version-history tools (#30).
 *
 * For each versioned object_type this factory builds a pair of tools that
 * mirror the existing high-level Get<X> accessor (e.g. GetClass → GetClassVersions
 * / GetClassVersionSource), so development (HighLevel) clients can read version
 * history without enabling the generic ReadOnly group.
 *
 *   Get<Display>Versions       — version history of that object.
 *   Get<Display>VersionSource  — source of one version, by its opaque content_uri.
 *
 * Both delegate to the SAME resolveVersionedObject dispatch + IAdtObject methods
 * (getVersions / getVersionSource) used by the generic ReadOnly handlers, so the
 * wire behaviour is identical. The generic GetObjectVersions/GetObjectVersionSource
 * (ReadOnly group) stay; these are HighLevel-only per-type equivalents.
 */

import { AdtObjectErrorCodes } from '@mcp-abap-adt/interfaces';
import { createAdtClient } from '../../../lib/clients';
import type {
  HandlerContext,
  SapEnvironment,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { buildVersionDiff } from '../readonly/handleGetObjectVersionDiff';
import { resolveVersionedObject } from '../readonly/resolveVersionedObject';

/** Handler signature before context injection (the group wraps with withContext). */
type RawHandler = (context: HandlerContext, args: any) => Promise<any>;

export interface ObjectVersionToolEntry {
  toolDefinition: ToolDefinition;
  handler: RawHandler;
}

interface VersionedTypeRow {
  /** object_type key for resolveVersionedObject (same set as VERSIONED_OBJECT_TYPES). */
  object_type: string;
  /** PascalCase display matching the existing high-level Get<Display> tool. */
  display: string;
  /** The natural name input param (e.g. class_name) — required on the Versions tool. */
  nameParam: string;
  /** Human label used in descriptions (e.g. "ABAP class", "CDS view"). */
  label: string;
  /** Environments — MUST match this type's existing high-level Get<X> TOOL_DEFINITION. */
  available_in?: readonly SapEnvironment[];
}

/**
 * One row per versioned object_type. `available_in` is copied from each type's
 * existing high-level Get<X> handler (src/handlers/<type>/high/handleGet<X>.ts).
 */
export const VERSIONED_TYPES: VersionedTypeRow[] = [
  {
    object_type: 'class',
    display: 'Class',
    nameParam: 'class_name',
    label: 'ABAP class',
    available_in: ['onprem', 'cloud', 'legacy'],
  },
  {
    object_type: 'program',
    display: 'Program',
    nameParam: 'program_name',
    label: 'ABAP program',
    available_in: ['onprem', 'legacy'],
  },
  {
    object_type: 'interface',
    display: 'Interface',
    nameParam: 'interface_name',
    label: 'ABAP interface',
    available_in: ['onprem', 'cloud', 'legacy'],
  },
  {
    object_type: 'function_group',
    display: 'FunctionGroup',
    nameParam: 'function_group_name',
    label: 'ABAP function group',
    available_in: ['onprem', 'cloud', 'legacy'],
  },
  {
    object_type: 'function_module',
    display: 'FunctionModule',
    nameParam: 'function_module_name',
    label: 'ABAP function module',
    available_in: ['onprem', 'cloud', 'legacy'],
  },
  {
    object_type: 'table',
    display: 'Table',
    nameParam: 'table_name',
    label: 'ABAP table',
    available_in: ['onprem', 'cloud'],
  },
  {
    object_type: 'structure',
    display: 'Structure',
    nameParam: 'structure_name',
    label: 'ABAP structure',
    available_in: ['onprem', 'cloud'],
  },
  {
    object_type: 'ddl',
    display: 'Ddl',
    nameParam: 'ddl_name',
    label: 'CDS view (DDL source)',
    available_in: ['onprem', 'cloud', 'legacy'],
  },
  {
    object_type: 'domain',
    display: 'Domain',
    nameParam: 'domain_name',
    label: 'ABAP domain',
    available_in: ['onprem', 'cloud'],
  },
  {
    object_type: 'data_element',
    display: 'DataElement',
    nameParam: 'data_element_name',
    label: 'ABAP data element',
    available_in: ['onprem', 'cloud'],
  },
  {
    object_type: 'package',
    display: 'Package',
    nameParam: 'package_name',
    label: 'ABAP package',
    available_in: ['onprem', 'cloud', 'legacy'],
  },
  {
    object_type: 'behavior_definition',
    display: 'BehaviorDefinition',
    nameParam: 'behavior_definition_name',
    label: 'RAP behavior definition',
    available_in: ['onprem', 'cloud'],
  },
  {
    object_type: 'metadata_extension',
    display: 'MetadataExtension',
    nameParam: 'metadata_extension_name',
    label: 'CDS metadata extension',
    available_in: ['onprem', 'cloud'],
  },
];

function buildVersionsTool(row: VersionedTypeRow): ObjectVersionToolEntry {
  const isFm = row.object_type === 'function_module';
  const properties: Record<string, unknown> = {
    [row.nameParam]: {
      type: 'string',
      description: `${row.label} name.`,
    },
  };
  const required = [row.nameParam];
  if (isFm) {
    properties.function_group_name = {
      type: 'string',
      description: 'Owning function group name (required).',
    };
    required.push('function_group_name');
  }

  const toolDefinition: ToolDefinition = {
    name: `Get${row.display}Versions`,
    ...(row.available_in ? { available_in: row.available_in } : {}),
    description: `[read-only] List the SAP version history of a ${row.label}. Returns each version with its versionId, author, updatedAt, title and an opaque content_uri to fetch that version's source via Get${row.display}VersionSource.`,
    inputSchema: {
      type: 'object',
      properties,
      required,
    },
  };

  const handler: RawHandler = async (context, args) => {
    const { connection, logger } = context;
    try {
      const name = args?.[row.nameParam];
      if (!name) {
        return return_error(new Error(`${row.nameParam} is required`));
      }
      const functionGroupName = isFm ? args?.function_group_name : undefined;
      if (isFm && !functionGroupName) {
        return return_error(new Error('function_group_name is required'));
      }

      const client = createAdtClient(connection, logger);
      let resolved: ReturnType<typeof resolveVersionedObject>;
      try {
        resolved = resolveVersionedObject(
          client,
          row.object_type,
          String(name),
          functionGroupName ? String(functionGroupName) : undefined,
        );
      } catch (e: any) {
        return return_error(e instanceof Error ? e : new Error(String(e)));
      }
      if (!resolved) {
        return return_error(
          new Error(`Unsupported object_type: ${row.object_type}`),
        );
      }

      try {
        const versions = await resolved.obj.getVersions(resolved.config);
        return return_response({
          data: JSON.stringify(
            {
              success: true,
              object_type: row.object_type,
              object_name: String(name).toUpperCase(),
              versions,
            },
            null,
            2,
          ),
        } as AxiosResponse);
      } catch (error: any) {
        if (error?.code === AdtObjectErrorCodes.UNSUPPORTED_OPERATION) {
          return return_error(
            new Error(
              `Version history is not supported for object_type '${row.object_type}' (${String(name).toUpperCase()}).`,
            ),
          );
        }
        return return_error(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } catch (error: any) {
      return return_error(error);
    }
  };

  return { toolDefinition, handler };
}

function buildVersionSourceTool(row: VersionedTypeRow): ObjectVersionToolEntry {
  const toolDefinition: ToolDefinition = {
    name: `Get${row.display}VersionSource`,
    ...(row.available_in ? { available_in: row.available_in } : {}),
    description: `[read-only] Fetch the source of a specific ${row.label} version by its content_uri (taken from a Get${row.display}Versions entry).`,
    inputSchema: {
      type: 'object',
      properties: {
        content_uri: {
          type: 'string',
          description: `Opaque content_uri taken from a Get${row.display}Versions entry.`,
        },
      },
      required: ['content_uri'],
    },
  };

  const handler: RawHandler = async (context, args) => {
    const { connection, logger } = context;
    try {
      const content_uri = args?.content_uri;
      if (!content_uri) {
        return return_error(new Error('content_uri is required'));
      }

      const client = createAdtClient(connection, logger);
      // content_uri carries the full object identity; a placeholder name is only
      // needed to obtain the right IAdtObject instance.
      const resolved = resolveVersionedObject(
        client,
        row.object_type,
        'X',
        'X',
      );
      if (!resolved) {
        return return_error(
          new Error(`Unsupported object_type: ${row.object_type}`),
        );
      }

      try {
        const source = await resolved.obj.getVersionSource(String(content_uri));
        return return_response({
          data: JSON.stringify({ success: true, content_uri, source }, null, 2),
        } as AxiosResponse);
      } catch (error: any) {
        if (error?.code === AdtObjectErrorCodes.UNSUPPORTED_OPERATION) {
          return return_error(
            new Error(
              `Version source is not supported for object_type '${row.object_type}'.`,
            ),
          );
        }
        return return_error(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } catch (error: any) {
      return return_error(error);
    }
  };

  return { toolDefinition, handler };
}

function buildVersionDiffTool(row: VersionedTypeRow): ObjectVersionToolEntry {
  const toolDefinition: ToolDefinition = {
    name: `Get${row.display}VersionDiff`,
    ...(row.available_in ? { available_in: row.available_in } : {}),
    description: `[read-only] Compute a unified diff between two ${row.label} versions, by their content_uris (taken from Get${row.display}Versions entries).`,
    inputSchema: {
      type: 'object',
      properties: {
        content_uri_from: {
          type: 'string',
          description: `Opaque content_uri of the OLD/base version (from a Get${row.display}Versions entry).`,
        },
        content_uri_to: {
          type: 'string',
          description: `Opaque content_uri of the NEW/compare version (from a Get${row.display}Versions entry).`,
        },
      },
      required: ['content_uri_from', 'content_uri_to'],
    },
  };

  const handler: RawHandler = async (context, args) => {
    const { connection, logger } = context;
    try {
      const content_uri_from = args?.content_uri_from;
      const content_uri_to = args?.content_uri_to;
      if (!content_uri_from || !content_uri_to) {
        return return_error(
          new Error('content_uri_from and content_uri_to are required'),
        );
      }

      const client = createAdtClient(connection, logger);
      // content_uri carries the full object identity; a placeholder name is only
      // needed to obtain the right IAdtObject instance.
      const resolved = resolveVersionedObject(
        client,
        row.object_type,
        'X',
        'X',
      );
      if (!resolved) {
        return return_error(
          new Error(`Unsupported object_type: ${row.object_type}`),
        );
      }

      try {
        const { diff, identical, notes } = await buildVersionDiff(
          resolved.obj,
          String(content_uri_from),
          String(content_uri_to),
        );
        return return_response({
          data: JSON.stringify(
            {
              success: true,
              object_type: row.object_type,
              content_uri_from,
              content_uri_to,
              identical,
              diff,
              ...(notes ? { notes } : {}),
            },
            null,
            2,
          ),
        } as AxiosResponse);
      } catch (error: any) {
        if (error?.code === AdtObjectErrorCodes.UNSUPPORTED_OPERATION) {
          return return_error(
            new Error(
              `Version diff is not supported for object_type '${row.object_type}'.`,
            ),
          );
        }
        return return_error(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } catch (error: any) {
      return return_error(error);
    }
  };

  return { toolDefinition, handler };
}

/**
 * Build all 39 high-level per-object version tools (13 types ×
 * {Versions, VersionSource, VersionDiff}). The handlers take (context, args);
 * the registering group wraps each with withContext.
 */
export function buildObjectVersionTools(): ObjectVersionToolEntry[] {
  const entries: ObjectVersionToolEntry[] = [];
  for (const row of VERSIONED_TYPES) {
    entries.push(buildVersionsTool(row));
    entries.push(buildVersionSourceTool(row));
    entries.push(buildVersionDiffTool(row));
  }
  return entries;
}
