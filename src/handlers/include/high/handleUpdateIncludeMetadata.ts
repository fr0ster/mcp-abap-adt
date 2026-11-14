import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateIncludeMetadata Handler - Replace the Metadata Document of an ABAP Include
 *
 * One PUT of the document as given, through `withLock` — held for the whole
 * write, released on every path out: lock -> write -> unlock. No activation
 * step. The client is the on-premise one, so a connection declared otherwise
 * is refused `variant_not_served` before anything is sent.
 */

import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateIncludeMetadata',
  available_in: ['onprem'] as const,
  description:
    "Writes the given metadata document as the whole stored metadata of the ABAP include named by include_name: locks it, writes, unlocks. Returns SAP's answer to the write.",
  inputSchema: z.object({
    include_name: z
      .string()
      .describe('Include name. The include must already exist.'),
    metadata: z
      .string()
      .describe(
        'The whole ADT metadata document of the include, as GetInclude part "metadata" returns it, with the changes made; it is sent as given and replaces the stored one.',
      ),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
type UpdateIncludeMetadataArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleUpdateIncludeMetadata(
  context: HandlerContext,
  args: UpdateIncludeMetadataArgs,
) {
  const { connection, logger } = context;

  if (!args.include_name) {
    return return_error(new Error('include_name is required'));
  }
  if (!args.metadata) {
    return return_error(new Error('metadata is required'));
  }

  const includeName = args.include_name.toUpperCase();
  const document = args.metadata;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateIncludeMetadata', detail },
    () => {
      const obj = createOnPremAdtClient(connection, logger).getInclude(
        resultsFor(includeDocuments),
      );

      return withLock(
        () => obj.lock({ includeName }, { analyse: analyseLock }),
        (lockHandle) =>
          atStep('update', () =>
            withAdtHeaders(context, 'include.updateMetadata', (headers) =>
              obj.updateMetadata(
                { includeName, transportRequest: args.transport_request },
                {
                  headers,
                  source: document,
                  lockHandle,
                  analyse: analyseException,
                },
              ),
            ),
          )(),
        (lockHandle) =>
          obj.unlock({ includeName }, lockHandle, {
            analyse: analyseException,
          }),
        { type: 'INCLUDE', name: includeName },
      );
    },
    project(detail, terseWrite),
  );
}
