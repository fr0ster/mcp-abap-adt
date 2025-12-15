import { AbapConnection } from '@mcp-abap-adt/connection';

export const TOOL_DEFINITION = {
  name: "GetObjectNodeFromCache",
  description: "[read-only] Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present.",
  inputSchema: {
    type: "object",
    properties:
{
      object_type: { type: "string", description: "[read-only] Object type" },
      object_name: { type: "string", description: "[read-only] Object name" },
      tech_name: { type: "string", description: "[read-only] Technical name" }
    },
    required: ["object_type", "object_name", "tech_name"]
  }
} as const;

// handleGetObjectNodeFromCache returns a cached node by OBJECT_TYPE, OBJECT_NAME, and TECH_NAME, expanding OBJECT_URI when available

import { objectsListCache } from '../../../lib/getObjectsListCache';
import { makeAdtRequest } from '../../../lib/utils';
import { HandlerContext } from '../../../lib/handlers/interfaces';

/**
 * @param args { object_type, object_name, tech_name }
 * @returns cached node including object_uri_response when OBJECT_URI exists
 */
export async function handleGetObjectNodeFromCache(context: HandlerContext, args: any) {
    const { connection, logger } = context;
    const { object_type, object_name, tech_name } = args;
    if (!object_type || !object_name || !tech_name) {
        return {
            isError: true,
            content: [{ type: 'text', text: 'object_type, object_name, tech_name required' }]
        };
    }
    const cache = objectsListCache.getCache();
    let node: any = null;
    if (cache && Array.isArray(cache.objects)) {
        node = (cache.objects as any[]).find(
            (obj: any) =>
                obj.OBJECT_TYPE === object_type &&
                obj.OBJECT_NAME === object_name &&
                obj.TECH_NAME === tech_name
        ) || null;
    }
    if (!node) {
        logger.debug(`Node ${object_type}/${object_name}/${tech_name} not found in cache`);
        return {
            isError: true,
            content: [{ type: 'text', text: 'Node not found in cache' }]
        };
    }
    if (node.OBJECT_URI && !node.object_uri_response) {
        const buildEndpoint = (uri: string) => {
            if (uri.startsWith('http')) {
                try {
                    const parsed = new URL(uri);
                    return `${parsed.pathname}${parsed.search}`;
                } catch {
                    // fall back to original if parsing fails
                    return uri;
                }
            }
            return uri;
        };
        try {
            const endpoint = buildEndpoint(node.OBJECT_URI);
            const resp = await makeAdtRequest(connection, endpoint, 'GET', 15000);
            node.object_uri_response = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);

            // Persist the fetched OBJECT_URI payload back into the cache entry
            const idx = cache.objects.findIndex(
                (obj: any) =>
                    obj.OBJECT_TYPE === object_type &&
                    obj.OBJECT_NAME === object_name &&
                    obj.TECH_NAME === tech_name
            );
            if (idx >= 0) {
                cache.objects[idx] = { ...cache.objects[idx], object_uri_response: node.object_uri_response };
                objectsListCache.setCache(cache);
            }
        } catch (e) {
            logger.error('Failed to expand OBJECT_URI from cache', e as any);
            node.object_uri_response = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
        }
    }
    logger.info(`Returning cached node for ${object_type}/${object_name}/${tech_name}`);
    return {
        content: [{ type: 'json', json: node }]
    };
}
