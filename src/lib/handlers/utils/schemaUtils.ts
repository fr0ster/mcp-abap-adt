import * as z from 'zod';

/**
 * Converts JSON Schema to Zod schema object (not z.object(), but object with Zod fields)
 * SDK expects inputSchema to be an object with Zod schemas as values, not z.object()
 */
export function jsonSchemaToZod(jsonSchema: any): any {
  // If already a Zod schema object (object with Zod fields), return as-is
  if (
    jsonSchema &&
    typeof jsonSchema === 'object' &&
    !jsonSchema.type &&
    !jsonSchema.properties
  ) {
    // Check if it looks like a Zod schema object (has Zod types as values)
    const firstValue = Object.values(jsonSchema)[0];
    if (
      firstValue &&
      ((firstValue as any).def ||
        (firstValue as any)._def ||
        typeof (firstValue as any).parse === 'function')
    ) {
      return jsonSchema;
    }
  }

  // If it's a JSON Schema object
  if (
    jsonSchema &&
    typeof jsonSchema === 'object' &&
    jsonSchema.type === 'object' &&
    jsonSchema.properties
  ) {
    // Return object with Zod fields, not z.object()
    return shapeOf(jsonSchema);
  }

  // Fallback: if it's already a Zod schema object, return as-is
  if (jsonSchema && typeof jsonSchema === 'object' && !jsonSchema.type) {
    return jsonSchema;
  }

  // Fallback: return empty object for unknown schemas
  return {};
}

/**
 * The zod fields of an object schema's `properties`: each property mapped by
 * `fieldOf`, made optional unless `required` names it.
 */
function shapeOf(schema: any): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const required: unknown[] = Array.isArray(schema.required)
    ? schema.required
    : [];
  for (const [key, prop] of Object.entries(schema.properties)) {
    shape[key] = fieldOf(prop, required.includes(key));
  }
  return shape;
}

/**
 * One property, at any depth: its type, then `default`, then optional when not
 * required, then `description` — the order the top level has always used.
 */
function fieldOf(prop: any, required: boolean): z.ZodTypeAny {
  let field = typeOf(prop);
  // Add default value if present (before optional)
  if (prop?.default !== undefined) {
    field = field.default(prop.default);
  }
  // Make optional if not required (after default, before describe)
  if (!required) {
    field = field.optional();
  }
  if (prop?.description) {
    field = field.describe(prop.description);
  }
  return field;
}

/**
 * The zod type of one JSON schema, recursively. A nested object is a
 * `z.object`, which drops undeclared keys exactly as the SDK's top-level
 * object does; an object without `properties`, an array without typed
 * `items` and anything this mapping does not know stay `z.any()`.
 */
function typeOf(schema: any): z.ZodTypeAny {
  switch (schema?.type) {
    case 'string': {
      const values = schema.enum;
      if (Array.isArray(values) && values.length > 0) {
        // z.enum needs two or more values; one is a literal.
        return values.length === 1
          ? z.literal(values[0])
          : z.enum(values as [string, ...string[]]);
      }
      return z.string();
    }
    case 'number':
    case 'integer': {
      let n = schema.type === 'integer' ? z.number().int() : z.number();
      if (typeof schema.minimum === 'number') n = n.min(schema.minimum);
      if (typeof schema.maximum === 'number') n = n.max(schema.maximum);
      return n;
    }
    case 'boolean':
      return z.boolean();
    case 'array': {
      let a = z.array(schema.items ? typeOf(schema.items) : z.any());
      if (typeof schema.minItems === 'number') a = a.min(schema.minItems);
      if (typeof schema.maxItems === 'number') a = a.max(schema.maxItems);
      return a;
    }
    case 'object':
      return schema.properties ? z.object(shapeOf(schema)) : z.any();
    default:
      return z.any();
  }
}
