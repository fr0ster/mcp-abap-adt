export const TOOL_DEFINITION = {
  name: "DescribeByList",
  description: "Batch description for a list of ABAP objects. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc.",
  inputSchema: {
    type: "object",
    properties: {
      objects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Object name (required, must be valid ABAP object name or mask)" },
            type: { type: "string", description: "Optional type (e.g. PROG/P, CLAS/OC, etc.)" }
          }
        }
      }
    },
    required: ["objects"]
  }
} as const;

// DescribeByList: Batch description for a list of ABAP objects

import { handleSearchObject } from "./handleSearchObject";

/**
 * DescribeByListArray handler.
 * @param args { objects: Array<{ name: string, type?: string }> }
 * @returns Result of handleDetectObjectTypeList with objects
 */
export async function handleDescribeByList(args: any) {
  const objects = args?.objects;
  if (!args || !Array.isArray(objects) || objects.length === 0) {
    const err = new Error("Missing or invalid parameters: objects (array) is required and must not be empty.");
    // @ts-ignore
    err.status = 400;
    // @ts-ignore
    err.body = {
      error: {
        message: "Missing or invalid parameters: objects (array) is required and must not be empty.",
        code: "INVALID_PARAMS"
      }
    };
    throw err;
  }
  const results: any[] = [];
  try {
    for (const obj of objects) {
      let type = obj.type;
      let res = await handleSearchObject({ object_name: obj.name, object_type: type });
      let parsed;
      try {
  parsed = typeof res === "string" ? JSON.parse(res) : res;

  // If the response is empty or flagged as an error, retry without explicit type
        let tryWithoutType = false;
        if (
          (parsed == null) ||
          (parsed.isError === true) ||
          (parsed.content && Array.isArray(parsed.content) && parsed.content.length === 0)
        ) {
          tryWithoutType = true;
        }

        if (tryWithoutType) {
          res = await handleSearchObject({ object_name: obj.name });
          parsed = typeof res === "string" ? JSON.parse(res) : res;
          // If it still fails or comes back empty, skip this object
          if (
            (parsed == null) ||
            (parsed.isError === true) ||
            (parsed.content && Array.isArray(parsed.content) && parsed.content.length === 0)
          ) {
            continue;
          }
        }

        // When content is a non-empty array
        if (parsed.content && Array.isArray(parsed.content)) {
          const contentArr = parsed.content;
          if (contentArr.length === 0) {
            continue;
          }
          // Handle SearchObject-style payloads containing a results array
          let allResults: any[] = [];
          for (const item of contentArr) {
            try {
              let parsedItem = typeof item.text === "string" ? JSON.parse(item.text) : item.text;
              if (parsedItem && parsedItem.results && Array.isArray(parsedItem.results)) {
                allResults = allResults.concat(parsedItem.results);
              } else {
                allResults.push(parsedItem);
              }
            } catch {
              allResults.push(item);
            }
          }
          results.push({
            type: "text",
            text: JSON.stringify({
              name: obj.name,
              results: allResults
            })
          });
          continue;
        }

        // Otherwise handle direct object payloads (e.g., DTEL)
        if (typeof parsed === "object" && parsed !== null) {
          results.push({ type: "text", text: JSON.stringify(parsed) });
        }
      } catch {
        continue;
      }
    }
    // Return isError: false even when nothing matched
    return {
      isError: false,
      content: results
    };
  } catch (e) {
    return { isError: true, content: [] };
  }
}
