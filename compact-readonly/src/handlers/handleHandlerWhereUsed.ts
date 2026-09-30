import { compactWhereUsedSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetWhereUsed } from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';

export const TOOL_DEFINITION = {
  name: 'HandlerWhereUsed',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Where-used list of an ABAP object: the objects that use, call or reference it, with type and package. Required: object_type*, object_name*. Optional: function_group_name (FUNCTION_MODULE), max_results (default 100). Response: JSON.',
  inputSchema: compactWhereUsedSchema,
} as const;

type HandlerWhereUsedArgs = {
  object_type: string;
  object_name: string;
  function_group_name?: string;
  max_results?: number;
};

/** The compact object types, as the where-used tool names them. */
const WHERE_USED_TYPE: Record<string, string> = {
  CLASS: 'class',
  INTERFACE: 'interface',
  PROGRAM: 'program',
  INCLUDE: 'include',
  FUNCTION_GROUP: 'functiongroup',
  FUNCTION_MODULE: 'functionmodule',
  PACKAGE: 'package',
  TABLE: 'table',
  STRUCTURE: 'structure',
  DOMAIN: 'domain',
  DATA_ELEMENT: 'dataelement',
  DDL: 'view',
};

type Answer = { isError?: boolean; content?: Array<{ text?: string }> };

export async function handleHandlerWhereUsed(
  context: HandlerContext,
  args: HandlerWhereUsedArgs,
) {
  const type = WHERE_USED_TYPE[String(args?.object_type ?? '').toUpperCase()];
  if (!type) {
    return return_error(
      new Error(
        `object_type must be one of: ${Object.keys(WHERE_USED_TYPE).join(', ')}.`,
      ),
    );
  }
  if (!args.object_name) {
    return return_error(new Error('object_name is required'));
  }
  if (type === 'functionmodule' && !args.function_group_name) {
    return return_error(
      new Error('function_group_name is required for FUNCTION_MODULE'),
    );
  }

  const objectName =
    type === 'functionmodule'
      ? `${args.function_group_name}|${args.object_name}`
      : args.object_name;
  const answered = (await handleGetWhereUsed(context, {
    object_name: objectName,
    object_type: type,
  } as never)) as Answer;

  // The list is capped here: an object used everywhere answers thousands of
  // references, more than a client takes in one result. The total stays.
  const max = args.max_results ?? 100;
  const text = answered?.content?.[0]?.text;
  if (answered?.isError || typeof text !== 'string') return answered;
  try {
    const value = JSON.parse(text) as { references?: unknown[] };
    if (!Array.isArray(value.references) || value.references.length <= max) {
      return answered;
    }
    const capped = {
      ...value,
      references: value.references.slice(0, max),
      returned_references: max,
    };
    return {
      ...answered,
      content: [{ type: 'text', text: JSON.stringify(capped, null, 2) }],
    };
  } catch {
    return answered;
  }
}
