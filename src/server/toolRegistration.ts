/**
 * Tool registration utilities for MCP server
 */

import * as z from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool definition interface (matches handler TOOL_DEFINITION format)
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: readonly string[] | string[];
  };
}

/**
 * Handler function type for MCP tools
 */
export type ToolHandler = (args: any) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text?: string; json?: any }>;
}>;

/**
 * Converts JSON Schema to Zod schema object
 * SDK expects inputSchema to be an object with Zod schemas as values, not z.object()
 */
export function jsonSchemaToZod(jsonSchema: any): Record<string, z.ZodTypeAny> {
  // If already a Zod schema object (object with Zod fields), return as-is
  if (jsonSchema && typeof jsonSchema === 'object' && !jsonSchema.type && !jsonSchema.properties) {
    const firstValue = Object.values(jsonSchema)[0];
    if (firstValue && ((firstValue as any).def || (firstValue as any)._def || typeof (firstValue as any).parse === 'function')) {
      return jsonSchema;
    }
  }

  // If it's a JSON Schema object
  if (jsonSchema && typeof jsonSchema === 'object' && jsonSchema.type === 'object' && jsonSchema.properties) {
    const zodShape: Record<string, z.ZodTypeAny> = {};
    const required = jsonSchema.required || [];

    for (const [key, prop] of Object.entries(jsonSchema.properties)) {
      const propSchema = prop as any;
      let zodType: z.ZodTypeAny;

      if (propSchema.type === 'string') {
        if (propSchema.enum && Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
          if (propSchema.enum.length === 1) {
            zodType = z.literal(propSchema.enum[0]);
          } else {
            zodType = z.enum(propSchema.enum as [string, ...string[]]);
          }
        } else {
          zodType = z.string();
        }
      } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
        zodType = z.number();
      } else if (propSchema.type === 'boolean') {
        zodType = z.boolean();
      } else if (propSchema.type === 'array') {
        const items = propSchema.items;
        if (items?.type === 'string') {
          zodType = z.array(z.string());
        } else if (items?.type === 'number' || items?.type === 'integer') {
          zodType = z.array(z.number());
        } else if (items?.type === 'boolean') {
          zodType = z.array(z.boolean());
        } else if (items?.type === 'object' && items.properties) {
          const nestedShape = buildNestedObjectSchema(items);
          zodType = z.array(z.object(nestedShape));
        } else {
          zodType = z.array(z.any());
        }
      } else if (propSchema.type === 'object' && propSchema.properties) {
        const nestedShape = buildNestedObjectSchema(propSchema);
        zodType = z.object(nestedShape);
      } else {
        zodType = z.any();
      }

      // Add default value if present (before optional)
      if (propSchema.default !== undefined) {
        zodType = zodType.default(propSchema.default);
      }

      // Make optional if not in required array (must be after default, before describe)
      if (!required.includes(key)) {
        zodType = zodType.optional();
      }

      // Add description if present (after optional)
      if (propSchema.description) {
        zodType = zodType.describe(propSchema.description);
      }

      zodShape[key] = zodType;
    }

    return zodShape;
  }

  // Fallback: if it's already a Zod schema object, return as-is
  if (jsonSchema && typeof jsonSchema === 'object' && !jsonSchema.type) {
    return jsonSchema;
  }

  // Fallback: return empty object for unknown schemas
  return {};
}

/**
 * Build Zod schema for nested objects
 */
function buildNestedObjectSchema(schema: any): Record<string, z.ZodTypeAny> {
  const nestedShape: Record<string, z.ZodTypeAny> = {};
  const nestedRequired = schema.required || [];

  for (const [nestedKey, nestedProp] of Object.entries(schema.properties)) {
    const nestedPropSchema = nestedProp as any;
    let nestedZodType: z.ZodTypeAny;

    if (nestedPropSchema.type === 'string') {
      if (nestedPropSchema.enum && Array.isArray(nestedPropSchema.enum) && nestedPropSchema.enum.length > 0) {
        if (nestedPropSchema.enum.length === 1) {
          nestedZodType = z.literal(nestedPropSchema.enum[0]);
        } else {
          nestedZodType = z.enum(nestedPropSchema.enum as [string, ...string[]]);
        }
      } else {
        nestedZodType = z.string();
      }
    } else if (nestedPropSchema.type === 'number' || nestedPropSchema.type === 'integer') {
      nestedZodType = z.number();
    } else if (nestedPropSchema.type === 'boolean') {
      nestedZodType = z.boolean();
    } else {
      nestedZodType = z.any();
    }

    if (nestedPropSchema.default !== undefined) {
      nestedZodType = nestedZodType.default(nestedPropSchema.default);
    }
    if (!nestedRequired.includes(nestedKey)) {
      nestedZodType = nestedZodType.optional();
    }
    if (nestedPropSchema.description) {
      nestedZodType = nestedZodType.describe(nestedPropSchema.description);
    }

    nestedShape[nestedKey] = nestedZodType;
  }

  return nestedShape;
}

/**
 * Register a single tool on McpServer with response conversion
 */
export function registerToolOnServer(
  server: McpServer,
  toolName: string,
  description: string,
  inputSchema: any,
  handler: ToolHandler
): void {
  // Convert JSON Schema to Zod if needed
  const zodSchema = (inputSchema && typeof inputSchema === 'object' && inputSchema.type === 'object' && inputSchema.properties)
    ? jsonSchemaToZod(inputSchema)
    : inputSchema;

  server.registerTool(
    toolName,
    {
      description,
      inputSchema: zodSchema,
    },
    async (args: any) => {
      const result = await handler(args);

      // If error, throw it
      if (result.isError) {
        const errorText = result.content
          ?.map((item: any) => {
            if (item?.type === "json" && item.json !== undefined) {
              return JSON.stringify(item.json);
            }
            return item?.text || String(item);
          })
          .join("\n") || "Unknown error";
        throw new McpError(ErrorCode.InternalError, errorText);
      }

      // Convert content to MCP format - JSON items become text
      const content = (result.content || []).map((item: any) => {
        if (item?.type === "json" && item.json !== undefined) {
          return {
            type: "text" as const,
            text: JSON.stringify(item.json),
          };
        }
        return {
          type: "text" as const,
          text: item?.text || String(item || ""),
        };
      });

      return { content };
    }
  );
}
