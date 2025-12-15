import { SharedBuilder } from '@mcp-abap-adt/adt-clients';
import type { SearchObjectsParams } from '@mcp-abap-adt/adt-clients';
import { McpError, ErrorCode, return_response } from '../../../lib/utils';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "SearchObject",
  description: "[read-only] Search for ABAP objects by name pattern. Parameters: object_name (with or without mask), object_type (optional), maxResults (optional). If object_type is specified, results are filtered by type.",
  inputSchema: {
    type: "object",
    properties: {
      object_name: { type: "string", description: "[read-only] Object name or mask (e.g. 'MARA*')" },
      object_type: { type: "string", description: "[read-only] Optional ABAP object type (e.g. 'TABL', 'CLAS/OC')" },
      maxResults: { type: "number", description: "[read-only] Maximum number of results to return", default: 100 }
    },
    required: ["object_name"]
  }
} as const;

// --- New function for ADT error handling ---
function detectAdtSearchError(response: any): { isError: boolean, content: any[] } | null {
  if (!response) return null;
  const status = response.status || response?.response?.status;
  if (status !== 200) {
    let msg = `ADT request failed (status ${status})`;
    if (status === 406) msg = "Invalid object_type (406 Not Acceptable)";
    if (status === 400) msg = "Bad request (400)";
    return {
      isError: true,
      content: [{ type: "text", text: msg }]
    };
  }
  return null;
}

export async function handleSearchObject(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    const { object_name, object_type, maxResults } = args;
    if (!object_name) {
      throw new McpError(ErrorCode.InvalidParams, 'object_name is required');
    }

    // Use SharedBuilder from @mcp-abap-adt/adt-clients
        const sharedBuilder = new SharedBuilder(connection);

    const searchParams: SearchObjectsParams = {
      query: object_name,
      maxResults: maxResults || 100
    };

    if (object_type) {
      searchParams.objectType = object_type;
    }

    logger.info(`Searching objects: query=${object_name}${object_type ? ` type=${object_type}` : ''}`);
    await sharedBuilder.search(searchParams);
    const response = sharedBuilder.getSearchResult();

    if (!response) {
      throw new Error('Search failed: no response received');
    }

    // --- Error handling using new function ---
    const adtError = detectAdtSearchError(response);
    if (adtError) return adtError;

    let result = return_response(response);
    const { isError, ...rest } = result;

  // Detect empty XML (<adtcore:objectReferences/>) results
  const xmlText = rest.content?.[0]?.text || "";
  if (!xmlText.includes("<adtcore:objectReference ")) {
    // Return an empty result (not an error) when ADT finds nothing
    return {
      isError: false,
      content: []
    };
  }

  // Parse every <adtcore:objectReference .../> entry from the XML
  const matches = Array.from(xmlText.matchAll(/<adtcore:objectReference\s+([^>]*)\/>/g));
  if (!matches || matches.length === 0) {
    // Return an empty result (not an error) when ADT finds nothing
    return {
      isError: false,
      content: []
    };
  }

  const resultsArr: Array<{ name: string; type: string; description: string; packageName: string }> = [];
  for (const m of matches as Array<RegExpMatchArray>) {
    const attrs = m[1];
    function extract(attr: string, def = ""): string {
      const mm = attrs.match(new RegExp(attr + '="([^"]*)"'));
      return mm ? mm[1] : def;
    }
    const name = extract("adtcore:name");
    const type = extract("adtcore:type");
    const description = extract("adtcore:description");
  let pkgName = extract("adtcore:packageName");
  // If packageName is missing, attempt to pull it from the raw XML via <adtcore:packageName>
    if (!pkgName) {
      const pkgMatch = xmlText.match(/<adtcore:packageName>([^<]*)<\/adtcore:packageName>/);
      if (pkgMatch) {
        pkgName = pkgMatch[1];
      }
    }
    resultsArr.push({ name, type, description, packageName: pkgName });
  }

  objectsListCache.setCache(result);
  return {
    isError: false,
    content: [
      {
        type: "text",
        text: JSON.stringify({ results: resultsArr, rawXML: xmlText })
      }
    ]
  };
  } catch (error) {
    // MCP-compliant error response: always return content[] with type "text"
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `ADT error: ${String(error)}`
        }
      ]
    };
  }
}
