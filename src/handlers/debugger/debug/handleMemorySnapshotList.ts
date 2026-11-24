import { MemorySnapshots } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  NO_SNAPSHOT_AUTHORIZATION,
  readSnapshotList,
  terseSnapshotList,
} from '../../../lib/debugger/memoryReadings';
import { purpose, toolDescription } from '../../../lib/description';
import { SNAPSHOTS } from '../../../lib/description/debugger';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import { carryingFailure } from '../../../lib/strategies/step';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'MemorySnapshotList',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Lists the memory snapshots the system holds, of one user when asked.',
      ),
      result: SNAPSHOTS,
    }),
  ),
  inputSchema: z.object({
    user: z
      .string()
      .optional()
      .describe('Only the snapshots of this SAP user.'),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleMemorySnapshotList(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const snapshots = MemorySnapshots.create(context.connection, {
    logger: context.logger,
  });
  return debugAnswer(
    args,
    async () => {
      const answer = await snapshots.list({
        ...(args.user ? { user: args.user.toUpperCase() } : {}),
        analyse: analyseException,
      });
      if (!answer.ok) {
        throw carryingFailure(
          new Error(answer.getError().message),
          answer.getError(),
          'list memory snapshots',
        );
      }
      const raw = String(answer.getResult().value ?? '');
      return { value: raw, raw };
    },
    terseSnapshotList,
    (xml) => {
      const list = readSnapshotList(xml);
      return list.length > 0
        ? list
        : { snapshots: [], authorization: NO_SNAPSHOT_AUTHORIZATION };
    },
  );
}
