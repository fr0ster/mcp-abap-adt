import { MemorySnapshots } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';
import {
  maxObjectsOf,
  requireKey,
  SNAPSHOT_VIEW_PROPERTIES,
} from './handleMemorySnapshotGet';

export const TOOL_DEFINITION = {
  name: 'MemorySnapshotDelta',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[debug] Two memory snapshots compared in a view: memory by kind, largest objects, an object's children or its referrers. Needs the memory snapshot authorization.",
  inputSchema: {
    type: 'object',
    properties: {
      from_id: { type: 'string', description: 'Snapshot id to compare from.' },
      to_id: { type: 'string', description: 'Snapshot id to compare to.' },
      view: {
        type: 'string',
        enum: ['overview', 'ranking', 'children', 'references'],
        default: 'overview',
        description:
          'overview: memory by kind; ranking: the largest objects; children: what an object holds; references: what holds an object.',
      },
      key: SNAPSHOT_VIEW_PROPERTIES.key,
      max_objects: SNAPSHOT_VIEW_PROPERTIES.max_objects,
      ...DETAIL_PROPERTY,
    },
    required: ['from_id', 'to_id'],
  },
} as const;

export async function handleMemorySnapshotDelta(
  context: HandlerContext,
  args: {
    from_id: string;
    to_id: string;
    view?: string;
    key?: string;
    max_objects?: number;
    detail?: string;
  },
) {
  const snapshots = new MemorySnapshots(context.connection, context.logger);
  const opts = { analyse: analyseException };
  return debugAnswer(
    args,
    async () => {
      if (!args.from_id || !args.to_id)
        throw new Error('from_id and to_id are required');
      const from = String(args.from_id);
      const to = String(args.to_id);
      const answer = await (() => {
        switch (args.view ?? 'overview') {
          case 'overview':
            return snapshots.getDeltaOverview(from, to, opts);
          case 'ranking':
            return snapshots.getDeltaRankingList(from, to, {
              ...opts,
              maxNumberOfObjects: maxObjectsOf(args),
            });
          case 'children':
            return snapshots.getDeltaChildren(from, to, requireKey(args), {
              ...opts,
              maxNumberOfObjects: maxObjectsOf(args),
            });
          case 'references':
            return snapshots.getDeltaReferences(from, to, requireKey(args), {
              ...opts,
              maxNumberOfReferences: maxObjectsOf(args),
            });
          default:
            throw new Error('view: overview, ranking, children or references');
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
