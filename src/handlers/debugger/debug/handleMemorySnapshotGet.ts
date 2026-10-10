import { MemorySnapshots } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const SNAPSHOT_VIEW_PROPERTIES = {
  view: {
    type: 'string',
    enum: ['header', 'overview', 'ranking', 'children', 'references'],
    default: 'overview',
    description:
      'header: the snapshot; overview: memory by kind; ranking: the largest objects; children: what an object holds; references: what holds an object.',
  },
  key: {
    type: 'string',
    description: 'Object key, for children and references.',
  },
  max_objects: {
    type: 'integer',
    minimum: 1,
    default: 50,
    description: 'Objects in a ranking, children or references answer.',
  },
} as const;

export const TOOL_DEFINITION = {
  name: 'MemorySnapshotGet',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[debug] One memory snapshot in a view: header, memory by kind, largest objects, an object's children or its referrers. Needs the memory snapshot authorization.",
  inputSchema: {
    type: 'object',
    properties: {
      snapshot_id: { type: 'string', description: 'Snapshot id.' },
      ...SNAPSHOT_VIEW_PROPERTIES,
      ...DETAIL_PROPERTY,
    },
    required: ['snapshot_id'],
  },
} as const;

/** The key the children and references views need; the schema cannot tie it to the view. */
export function requireKey(args: { key?: string; view?: string }): string {
  if (!args.key) throw new Error(`view ${args.view}: give key`);
  return args.key;
}

/** The limit of a view, or the default the schema states; its minimum is the schema's. */
export function maxObjectsOf(args: { max_objects?: number }): number {
  return args.max_objects ?? 50;
}

export async function handleMemorySnapshotGet(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  const snapshots = new MemorySnapshots(context.connection, context.logger);
  const opts = { analyse: analyseException };
  return debugAnswer(
    args,
    async () => {
      const id = args.snapshot_id;
      const answer = await (() => {
        switch (args.view ?? 'overview') {
          case 'header':
            return snapshots.getById(id, opts);
          case 'overview':
            return snapshots.getOverview(id, opts);
          case 'ranking':
            return snapshots.getRankingList(id, {
              ...opts,
              maxNumberOfObjects: maxObjectsOf(args),
            });
          case 'children':
            return snapshots.getChildren(id, requireKey(args), {
              ...opts,
              maxNumberOfObjects: maxObjectsOf(args),
            });
          case 'references':
            return snapshots.getReferences(id, requireKey(args), {
              ...opts,
              maxNumberOfReferences: maxObjectsOf(args),
            });
        }
      })();
      if (!answer.ok) throw new Error(answer.getError().message);
      const raw = String(answer.getResult().value ?? '');
      return { value: raw, raw };
    },
    readXmlDocument,
    readXmlDocument,
  );
}
