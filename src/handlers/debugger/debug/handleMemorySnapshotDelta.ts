import { MemorySnapshots } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import { carryingFailure } from '../../../lib/strategies/step';
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
    "[read-only] [debug] Two memory snapshots compared in a view: memory by kind, largest objects, an object's children or its referrers. Needs the memory snapshot authorization.",
  inputSchema: z.object({
    from_id: z.string().describe('Snapshot id to compare from.'),
    to_id: z.string().describe('Snapshot id to compare to.'),
    view: z
      .enum(['overview', 'ranking', 'children', 'references'])
      .default('overview')
      .optional()
      .describe(
        'overview: memory by kind; ranking: the largest objects; children: what an object holds; references: what holds an object.',
      ),
    key: SNAPSHOT_VIEW_PROPERTIES.key,
    max_objects: SNAPSHOT_VIEW_PROPERTIES.max_objects,
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleMemorySnapshotDelta(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const snapshots = MemorySnapshots.create(context.connection, {
    logger: context.logger,
  });
  const opts = { analyse: analyseException };
  return debugAnswer(
    args,
    async () => {
      const from = args.from_id;
      const to = args.to_id;
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
        }
      })();
      if (!answer.ok) {
        throw carryingFailure(
          new Error(answer.getError().message),
          answer.getError(),
          'compare memory snapshots',
        );
      }
      const raw = String(answer.getResult().value ?? '');
      return { value: raw, raw };
    },
    readXmlDocument,
    readXmlDocument,
  );
}
