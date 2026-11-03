/**
 * A tool's zod input schema read as the JSON Schema a client lists: the
 * conversion the MCP SDK applies to it (`toJSONSchema`, draft-07, the input
 * side). Tests read the listed form through this, never a schema's internals.
 */
import * as z from 'zod';
import type { ToolDefinition } from '../../lib/handlers/interfaces';
import { registeredSchema } from '../../lib/handlers/utils/schemaUtils';

/** One JSON Schema node, as zod renders it. */
export type JsonSchema = z.core.JSONSchema.BaseSchema;

/**
 * `schema` as a client lists it; a definition not yet in zod is listed as
 * its registration converts it (`registeredSchema`).
 */
export function listedJson(
  schema: ToolDefinition['inputSchema'] | z.ZodType,
): JsonSchema {
  const listed =
    schema instanceof z.ZodType ? schema : registeredSchema(schema);
  return z.toJSONSchema(
    listed instanceof z.ZodType ? listed : z.object(listed),
    { target: 'draft-7', io: 'input' },
  );
}

/**
 * The node at `path` under `schema`: each step names a property, `[]` the
 * items of an array. A step that names nothing is refused, naming it.
 */
export function jsonAt(schema: JsonSchema, ...path: string[]): JsonSchema {
  let node = schema;
  for (const step of path) {
    const next = step === '[]' ? node.items : node.properties?.[step];
    if (
      next === undefined ||
      typeof next === 'boolean' ||
      Array.isArray(next)
    ) {
      throw new Error(`the schema has no ${path.join('.')} (at ${step})`);
    }
    node = next;
  }
  return node;
}

/**
 * The arguments `schema` declares required, as its JSON Schema stated them
 * before it moved to zod: a field neither optional nor a default over an
 * optional one (a default over a required field stays required).
 */
export function declaredRequired(
  schema: ToolDefinition['inputSchema'] | z.ZodType,
): string[] {
  if (!(schema instanceof z.ZodObject)) {
    return schema instanceof z.ZodType ? [] : [...(schema.required ?? [])];
  }
  return Object.entries(schema.shape)
    .filter(([, field]) => !optionalField(field))
    .map(([name]) => name);
}

function optionalField(field: z.ZodType): boolean {
  if (field instanceof z.ZodOptional) return true;
  return (
    field instanceof z.ZodDefault && field.unwrap() instanceof z.ZodOptional
  );
}

/** The node at `path` under `schema` (as {@link jsonAt}), or `undefined` when there is none. */
export function jsonFind(
  schema: JsonSchema,
  ...path: string[]
): JsonSchema | undefined {
  let node = schema;
  for (const step of path) {
    const next = step === '[]' ? node.items : node.properties?.[step];
    if (
      next === undefined ||
      typeof next === 'boolean' ||
      Array.isArray(next)
    ) {
      return undefined;
    }
    node = next;
  }
  return node;
}
