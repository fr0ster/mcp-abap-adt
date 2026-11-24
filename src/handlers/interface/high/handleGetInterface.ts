import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { sourceReader, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { READ_PART_FIELD, readPartOf } from '../../../lib/handlers/readPart';
import { READ_VERSION_FIELD } from '../../../lib/handlers/readVersion';
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readInterfaceMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetInterface',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    sourceReader({
      object: 'an ABAP interface',
      metadata: true,
    }),
  ),
  inputSchema: z.object({
    interface_name: requiredText('interface_name is required').describe(
      'Interface name.',
    ),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetInterfaceArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetInterface(
  context: HandlerContext,
  args: GetInterfaceArgs,
) {
  const { connection, logger } = context;
  const { interface_name, version = 'active' } = args;
  const part = readPartOf(args.part);
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

  const interfaceName = interface_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getInterface(resultsFor(interfaceDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetInterface', detail: 'terse' },
      () => readInterfaceMetadata(client, { interfaceName }, version),
      (metadata: AdtReading<string>) => ({
        success: true,
        interface_name: interfaceName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetInterface', detail: 'terse' },
    range,
    () => obj.read({ interfaceName }, version, { analyse: analyseException }),
    (source, cut) => ({
      success: true,
      interface_name: interfaceName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
