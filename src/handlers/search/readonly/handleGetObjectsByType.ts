export const TOOL_DEFINITION = {
  name: 'GetObjectsByType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieves all ABAP objects of a specific type (classes, tables, programs, interfaces, etc.) under a given parent node. Useful for listing all objects of one type within a package or composite object.',
  inputSchema: {
    type: 'object',
    properties: {
      parent_name: {
        type: 'string',
        description: '[read-only] Parent object name',
      },
      parent_tech_name: {
        type: 'string',
        description: '[read-only] Parent technical name',
      },
      parent_type: {
        type: 'string',
        description: '[read-only] Parent object type',
      },
      node_id: { type: 'string', description: '[read-only] Node ID' },
      format: {
        type: 'string',
        description:
          "[read-only] Output format: 'parsed' (default). 'raw' is accepted for backward compatibility but answers the same parsed text — see the note on `nodeLevel` below.",
      },
      with_short_descriptions: {
        type: 'boolean',
        description: '[read-only] Include short descriptions',
      },
    },
    required: ['parent_name', 'parent_tech_name', 'parent_type', 'node_id'],
  },
} as const;

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { NodeLevel } from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

/**
 * Grouped, human-readable text — the same shape this tool answered before the
 * migration, built off `ourUtils.node` (`nodeLevel`) instead of a hand-rolled
 * regex over the raw node-structure XML.
 *
 * `ourUtils` deliberately keeps its OWN `node` reading (`resultSets.ts`:
 * "ourUtils... keeps our own node reading") — `nodeLevel` in
 * `packageWalk.ts` — rather than the shipped `nodeContents`, but that
 * reading carries `techName`/`uri` too (added the description; never traded
 * either away — see that file's own doc), so the cached rows below carry
 * `TECH_NAME`/`OBJECT_URI` from it, matching `IRepositoryObjectNode`'s field
 * set. `format: 'raw'` stays unserved: there is no raw XML behind
 * `NodeLevel`, only `objects`/`childNodes`, and restoring it needs a reading
 * that carries the document itself, not more fields — deferred, not
 * attempted here.
 */
function formatObjects(
  level: NodeLevel,
  nodeId: string,
  parentType: string,
  parentName: string,
): { text: string; cached: Array<Record<string, string>> } {
  const objects = level.objects;
  const cached = objects.map((o) => ({
    OBJECT_TYPE: o.type,
    OBJECT_NAME: o.name,
    ...(o.techName ? { TECH_NAME: o.techName } : {}),
    ...(o.uri ? { OBJECT_URI: o.uri } : {}),
  }));

  if (objects.length === 0) {
    return {
      text: `No objects found for node_id '${nodeId}' in ${parentType} '${parentName}'.`,
      cached,
    };
  }

  let responseText = `Found ${objects.length} objects for node_id '${nodeId}' in ${parentType} '${parentName}':\n\n`;
  const objectTypes = [...new Set(objects.map((o) => o.type))];

  if (objectTypes.length > 1) {
    for (const objType of objectTypes) {
      const typeObjects = objects.filter((o) => o.type === objType);
      responseText += `Type: ${objType} (${typeObjects.length} objects)\n`;
      for (const o of typeObjects) {
        responseText += `   - ${o.name}\n`;
      }
      responseText += '\n';
    }
  } else {
    responseText += `Object Type: ${objectTypes[0]}\n\n`;
    for (const o of objects) {
      responseText += `   - ${o.name}\n`;
    }
  }

  responseText += `\nSummary: ${objects.length} objects found\n`;
  if (objectTypes.length > 1) {
    for (const objType of objectTypes) {
      const count = objects.filter((o) => o.type === objType).length;
      responseText += `   ${objType}: ${count} objects\n`;
    }
  }

  return { text: responseText, cached };
}

export async function handleGetObjectsByType(
  context: HandlerContext,
  args: {
    parent_name?: string;
    parent_tech_name?: string;
    parent_type?: string;
    node_id?: string;
    format?: string;
    with_short_descriptions?: boolean;
  },
) {
  const { connection, logger } = context;
  const {
    parent_name,
    parent_tech_name,
    parent_type,
    node_id,
    with_short_descriptions,
  } = args;

  if (
    !parent_name ||
    typeof parent_name !== 'string' ||
    parent_name.trim() === ''
  ) {
    return return_error(
      'Parameter "parent_name" (string) is required and cannot be empty.',
    );
  }
  if (
    !parent_tech_name ||
    typeof parent_tech_name !== 'string' ||
    parent_tech_name.trim() === ''
  ) {
    return return_error(
      'Parameter "parent_tech_name" (string) is required and cannot be empty.',
    );
  }
  if (
    !parent_type ||
    typeof parent_type !== 'string' ||
    parent_type.trim() === ''
  ) {
    return return_error(
      'Parameter "parent_type" (string) is required and cannot be empty.',
    );
  }
  if (!node_id || typeof node_id !== 'string' || node_id.trim() === '') {
    return return_error(
      'Parameter "node_id" (string) is required and cannot be empty.',
    );
  }

  const withDescriptions =
    with_short_descriptions !== undefined
      ? Boolean(with_short_descriptions)
      : true;
  const parentName = parent_name.toUpperCase();

  // `fetchNodeStructure(parentType, parentName, options?)` — no `analyse`:
  // not named by the brief for this member, and `IGetNodeContentsOptions`
  // carries no options field for one either.
  return answer(
    { tool: 'GetObjectsByType', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .fetchNodeStructure(parent_type, parentName, {
          nodeId: node_id,
          withShortDescriptions: withDescriptions,
        }),
    (level: NodeLevel) => {
      const { text, cached } = formatObjects(
        level,
        node_id,
        parent_type,
        parent_name,
      );
      objectsListCache.setCache({
        isError: false,
        content: [{ type: 'text', text }],
        objects: cached,
      });
      return text;
    },
  );
}
