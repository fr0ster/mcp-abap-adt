import { MemorySnapshots } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readSnapshotList } from '../../../lib/debugger/memoryReadings';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'MemorySnapshotList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Memory snapshots the system lists. Empty without the memory snapshot authorization.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description: 'Only the snapshots of this SAP user.',
      },
      ...DETAIL_PROPERTY,
    },
    required: [],
  },
} as const;

const NO_AUTHORIZATION =
  'an empty list is also the answer without the memory snapshot authorization';

export async function handleMemorySnapshotList(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  const snapshots = new MemorySnapshots(context.connection, context.logger);
  return debugAnswer(
    args,
    async () => {
      const answer = await snapshots.list({
        ...(args.user ? { user: args.user.toUpperCase() } : {}),
        analyse: analyseException,
      });
      if (!answer.ok) throw new Error(answer.getError().message);
      const raw = String(answer.getResult().value ?? '');
      return { value: raw, raw };
    },
    (xml) => {
      // Terse drops only the file name; the id, user and time tell the snapshots apart.
      const list = readSnapshotList(xml).map(({ fileName: _f, ...s }) => s);
      return list.length > 0
        ? list
        : { snapshots: [], authorization: NO_AUTHORIZATION };
    },
    (xml) => {
      const list = readSnapshotList(xml);
      return list.length > 0
        ? list
        : { snapshots: [], authorization: NO_AUTHORIZATION };
    },
  );
}
