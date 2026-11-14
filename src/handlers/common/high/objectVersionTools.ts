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

import * as z from 'zod';
import type {
  VersionedKind,
  VersionSourceKind,
} from '../../../lib/adtProjections';
import type { McpResult } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type {
  HandlerContext,
  SapEnvironment,
  ToolArgs,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { buildVersionDiff } from '../readonly/handleGetObjectVersionDiff';
import {
  readVersionSource,
  readVersions,
  resolveVersionedObject,
} from '../readonly/resolveVersionedObject';

/**
 * A version tool's handler: the arguments as its schema parses them — the
 * name parameter is the type's own (`nameParam`), so the keys are known
 * only per row, and each is read as a value of unknown shape.
 */
type RawHandler = (
  context: HandlerContext,
  args: ToolArgs,
) => Promise<McpResult>;

export interface ObjectVersionToolEntry {
  toolDefinition: ToolDefinition;
  handler: RawHandler;
}

interface VersionedTypeRow<K extends VersionedKind> {
  /** The kind resolveVersionedObject reads: one of `VERSIONED_ROUTES`. */
  object_type: K;
  /** PascalCase display matching the existing high-level Get<Display> tool. */
  display: string;
  /** The natural name input param (e.g. class_name) — required on the Versions tool. */
  nameParam: string;
  /** Human label used in descriptions (e.g. "ABAP class", "CDS view"). */
  label: string;
  /** A sentence appended to each version tool's description, when the type needs one. */
  note?: string;
  /** Environments — MUST match this type's existing high-level Get<X> TOOL_DEFINITION. */
  available_in?: readonly SapEnvironment[];
}

/**
 * One row per versioned object_type. `available_in` is copied from each type's
 * existing high-level Get<X> handler (src/handlers/<type>/high/handleGet<X>.ts).
 *
 * Only object types whose adt-clients handler implements version history
 * (IAdtSourceObject) appear here — same supported set as VERSIONED_OBJECT_TYPES
 * in resolveVersionedObject. Non-versioned lockable types (function_group,
 * domain, data_element, package) are deliberately excluded: their
 * getVersions/getVersionSource throw "not supported", so per-type version tools
 * for them would always error.
 */
export const VERSIONED_TYPES: VersionedTypeRow<VersionSourceKind>[] = [
  {
    object_type: 'class',
    display: 'Class',
    nameParam: 'class_name',
    label: 'ABAP class',
    available_in: ['onprem', 'cloud'],
  },
  {
    object_type: 'program',
    display: 'Program',
    nameParam: 'program_name',
    label: 'ABAP program',
    note: "On ABAP Cloud, the programs are SAP's standard programs.",
    available_in: ['onprem', 'cloud'],
  },
  {
    object_type: 'interface',
    display: 'Interface',
    nameParam: 'interface_name',
    label: 'ABAP interface',
    available_in: ['onprem', 'cloud'],
  },
  {
    object_type: 'function_module',
    display: 'FunctionModule',
    nameParam: 'function_module_name',
    label: 'ABAP function module',
    available_in: ['onprem', 'cloud'],
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
    available_in: ['onprem', 'cloud'],
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

/**
 * The versioned types whose version list SAP serves and whose version source
 * it refuses: the table type (403 "Request version for TTYP is not
 * supported", measured on premise 2026-11-01 and on ABAP cloud 2026-11-02).
 * Each gets its Versions tool alone.
 */
export const LIST_ONLY_VERSIONED_TYPES: VersionedTypeRow<
  Exclude<VersionedKind, VersionSourceKind>
>[] = [
  {
    object_type: 'table_type',
    display: 'TableType',
    nameParam: 'table_type_name',
    label: 'ABAP table type',
    available_in: ['onprem', 'cloud'],
  },
];

function buildVersionsTool(
  row: VersionedTypeRow<VersionedKind>,
): ObjectVersionToolEntry {
  const isFm = row.object_type === 'function_module';
  const named = {
    [row.nameParam]: z.string().describe(`${row.label} name.`),
  };
  const inputSchema = z.object(
    isFm
      ? {
          ...named,
          function_group_name: z
            .string()
            .describe('Owning function group name (required).'),
        }
      : named,
  );

  const toolDefinition: ToolDefinition = {
    name: `Get${row.display}Versions`,
    ...(row.available_in ? { available_in: row.available_in } : {}),
    description: `[read-only] Lists the version history of the ${row.label} named by ${row.nameParam}: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.${row.note ? ` ${row.note}` : ''}`,
    inputSchema,
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
      } catch (e) {
        return return_error(e instanceof Error ? e : new Error(String(e)));
      }

      try {
        const versions = await readVersions(resolved);
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
        });
      } catch (error) {
        return return_error(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } catch (error) {
      return return_error(error);
    }
  };

  return { toolDefinition, handler };
}

function buildVersionSourceTool(
  row: VersionedTypeRow<VersionSourceKind>,
): ObjectVersionToolEntry {
  const toolDefinition: ToolDefinition = {
    name: `Get${row.display}VersionSource`,
    ...(row.available_in ? { available_in: row.available_in } : {}),
    description: `[read-only] Reads the source of the ${row.label} version named by content_uri, an entry of the ${row.label}'s version history.${row.note ? ` ${row.note}` : ''}`,
    inputSchema: z.object({
      content_uri: z
        .string()
        .describe(
          `Opaque content_uri of a version, from the ${row.label}'s version history.`,
        ),
    }),
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

      try {
        const source = await readVersionSource(resolved, String(content_uri));
        return return_response({
          data: JSON.stringify({ success: true, content_uri, source }, null, 2),
        });
      } catch (error) {
        return return_error(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } catch (error) {
      return return_error(error);
    }
  };

  return { toolDefinition, handler };
}

function buildVersionDiffTool(
  row: VersionedTypeRow<VersionSourceKind>,
): ObjectVersionToolEntry {
  const toolDefinition: ToolDefinition = {
    name: `Get${row.display}VersionDiff`,
    ...(row.available_in ? { available_in: row.available_in } : {}),
    description: `[read-only] Compares the two ${row.label} versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.${row.note ? ` ${row.note}` : ''}`,
    inputSchema: z.object({
      content_uri_from: z
        .string()
        .describe(
          `Opaque content_uri of the OLD/base version, from the ${row.label}'s version history.`,
        ),
      content_uri_to: z
        .string()
        .describe(
          `Opaque content_uri of the NEW/compare version, from the ${row.label}'s version history.`,
        ),
    }),
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

      try {
        const { diff, identical, notes } = await buildVersionDiff(
          resolved,
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
        });
      } catch (error) {
        return return_error(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } catch (error) {
      return return_error(error);
    }
  };

  return { toolDefinition, handler };
}

/**
 * Build the 28 high-level per-object version tools: {Versions, VersionSource,
 * VersionDiff} for each of the 9 types with a version source, and Versions
 * alone for each list-only type. The handlers take (context, args); the
 * registering group wraps each with withContext.
 */
export function buildObjectVersionTools(): ObjectVersionToolEntry[] {
  const entries: ObjectVersionToolEntry[] = [];
  for (const row of VERSIONED_TYPES) {
    entries.push(buildVersionsTool(row));
    entries.push(buildVersionSourceTool(row));
    entries.push(buildVersionDiffTool(row));
  }
  for (const row of LIST_ONLY_VERSIONED_TYPES) {
    entries.push(buildVersionsTool(row));
  }
  return entries;
}
