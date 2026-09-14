export const TOOL_DEFINITION = {
  name: 'GetObjectsList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Recursively retrieves all child ABAP repository objects for a given parent — programs (PROG), function groups (FUGR), classes (CLAS), packages (DEVC), and other composite objects — including nested includes and subcomponents.',
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
        description: '[read-only] Parent object type (e.g. PROG/P, FUGR)',
      },
      with_short_descriptions: {
        type: 'boolean',
        description: '[read-only] Include short descriptions (default: true)',
      },
    },
    required: ['parent_name', 'parent_tech_name', 'parent_type'],
  },
} as const;

import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { NodeLevel } from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

function utilsOf(context: HandlerContext) {
  return createAdtClient(context.connection, context.logger).getUtils(ourUtils);
}

type NodeSource = ReturnType<typeof utilsOf>;

interface FlatObject {
  name: string;
  type: string;
  tech_name: string;
}

function ok(objects: FlatObject[]): IAdtResponse<FlatObject[], IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value: objects }),
    getError: () => {
      throw new Error('asked for the error of a success');
    },
  } as unknown as IAdtResponse<FlatObject[], IAdtError>;
}

/**
 * Walk the node structure recursively, one `fetchNodeStructure` call per
 * node — the same recursion this tool ran before the migration, over
 * `ourUtils.node` (`nodeLevel`) instead of a hand-rolled XML regex. Every
 * step keeps IAdtResponse's `ok`/`getResult`/`getError` shape rather than
 * throwing, so the FIRST refusal anywhere in the tree — not just at the
 * root — reaches `answer()` and is formatted the same way every other
 * handler in this migration formats one. `tech_name` falls back to `name`:
 * see the note in `handleGetObjectsByType.ts` on what `ourUtils.node` does
 * and does not carry.
 */
async function collectValidObjects(
  utils: NodeSource,
  parentType: string,
  parentName: string,
  nodeId: string,
  withShortDescriptions: boolean,
  visited: Set<string>,
): Promise<IAdtResponse<FlatObject[], IAdtError>> {
  if (visited.has(nodeId)) return ok([]);
  visited.add(nodeId);

  const response = await utils.fetchNodeStructure(parentType, parentName, {
    nodeId,
    withShortDescriptions,
  });
  if (!response.ok) return response as IAdtResponse<FlatObject[], IAdtError>;

  const level = response.getResult().value as NodeLevel;
  let objects: FlatObject[] = level.objects.map((o) => ({
    name: o.name,
    type: o.type,
    tech_name: o.name,
  }));

  for (const child of level.childNodes) {
    const childResult = await collectValidObjects(
      utils,
      parentType,
      parentName,
      child.nodeId,
      withShortDescriptions,
      visited,
    );
    if (!childResult.ok) return childResult;
    objects = objects.concat(childResult.getResult().value);
  }

  return ok(objects);
}

export async function handleGetObjectsList(
  context: HandlerContext,
  args: {
    parent_name?: string;
    parent_tech_name?: string;
    parent_type?: string;
    with_short_descriptions?: boolean;
  },
) {
  const {
    parent_name,
    parent_tech_name,
    parent_type,
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

  const withDescriptions =
    with_short_descriptions !== undefined
      ? Boolean(with_short_descriptions)
      : true;
  const parentName = parent_name.toUpperCase();
  const utils = utilsOf(context);

  return answer(
    { tool: 'GetObjectsList', detail: 'terse' },
    () =>
      collectValidObjects(
        utils,
        parent_type,
        parentName,
        '000000',
        withDescriptions,
        new Set(),
      ),
    (objects: FlatObject[]) => {
      const result = {
        parent_name,
        parent_tech_name,
        parent_type,
        total_objects: objects.length,
        objects,
      };
      objectsListCache.setCache(result);
      return result;
    },
  );
}
