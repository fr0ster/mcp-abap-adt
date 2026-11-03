import * as z from 'zod';
import { child, type Element, isElement, isList } from '../../../lib/xml/tree';
export const TOOL_DEFINITION = {
  name: 'GetObjectNodeFromCache',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present, reading the active version of the object it names.',
  inputSchema: z.object({
    object_type: z.string().describe('[read-only] Object type'),
    object_name: z.string().describe('[read-only] Object name'),
    tech_name: z.string().describe('[read-only] Technical name'),
  }),
} as const;

// handleGetObjectNodeFromCache returns a cached node by OBJECT_TYPE, OBJECT_NAME, and TECH_NAME, expanding OBJECT_URI when available

import { answerRequestThrown } from '../../../lib/answer';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { makeAdtRequest } from '../../../lib/utils';

/**
 * `endpoint` reading the active version: `version=active` in its query, the
 * rest of the query kept. A read states its version; this tool has no version
 * parameter, so it reads the active one.
 */
function atActiveVersion(endpoint: string): string {
  const at = endpoint.indexOf('?');
  const path = at < 0 ? endpoint : endpoint.slice(0, at);
  const query = new URLSearchParams(at < 0 ? '' : endpoint.slice(at + 1));
  query.set('version', 'active');
  return `${path}?${query.toString()}`;
}

/**
 * @param args { object_type, object_name, tech_name }
 * @returns cached node including object_uri_response when OBJECT_URI exists
 */
export async function handleGetObjectNodeFromCache(
  context: HandlerContext,
  args: any,
) {
  const { connection, logger } = context;
  const { object_type, object_name, tech_name } = args;
  if (!object_type || !object_name || !tech_name) {
    return {
      isError: true,
      content: [
        { type: 'text', text: 'object_type, object_name, tech_name required' },
      ],
    };
  }
  const cache = objectsListCache.getCache();
  const cached = child(cache, 'objects');
  const objects = isList(cached) ? cached : [];
  const matches = (obj: unknown) =>
    child(obj, 'OBJECT_TYPE') === object_type &&
    child(obj, 'OBJECT_NAME') === object_name &&
    child(obj, 'TECH_NAME') === tech_name;
  const found = objects.find(matches);
  if (!isElement(found)) {
    logger?.debug(
      `Node ${object_type}/${object_name}/${tech_name} not found in cache`,
    );
    return {
      isError: true,
      content: [{ type: 'text', text: 'Node not found in cache' }],
    };
  }
  let node: Element = found;
  const objectUri = node.OBJECT_URI;
  if (objectUri && !node.object_uri_response) {
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
    const endpoint = atActiveVersion(buildEndpoint(String(objectUri)));
    let resp: Awaited<ReturnType<typeof makeAdtRequest>>;
    try {
      // No deadline of the server's: the request waits for SAP's answer.
      resp = await makeAdtRequest(connection, endpoint, 'GET', 0);
    } catch (e) {
      logger?.error('Failed to expand OBJECT_URI from cache', e as any);
      // The read's error as SAP answered it, with its step — the call's
      // failure, not content inside a success; a credential failure as the
      // chain made it.
      return answerRequestThrown(
        e,
        { method: 'GET', url: endpoint },
        'read OBJECT_URI',
      );
    }
    const objectUriResponse =
      typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    node = { ...node, object_uri_response: objectUriResponse };

    // Persist the fetched OBJECT_URI payload back into the cache entry
    const idx = objects.findIndex(matches);
    if (idx >= 0 && isElement(cache)) {
      objectsListCache.setCache({
        ...cache,
        objects: objects.map((obj, at) =>
          at === idx && isElement(obj)
            ? { ...obj, object_uri_response: objectUriResponse }
            : obj,
        ),
      });
    }
  }
  logger?.info(
    `Returning cached node for ${object_type}/${object_name}/${tech_name}`,
  );
  return {
    content: [{ type: 'json', json: node }],
  };
}
