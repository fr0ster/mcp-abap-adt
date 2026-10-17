import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import { readClassMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read an ABAP class in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name.',
      },
      part: READ_PART_PROPERTY,
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.',
        default: 'active',
      },
    },
    required: ['class_name'],
  },
} as const;

interface GetClassArgs {
  class_name: string;
  part?: ReadPart;
  version?: 'active' | 'inactive';
}

export async function handleGetClass(
  context: HandlerContext,
  args: GetClassArgs,
) {
  const { connection, logger } = context;
  const { class_name, version = 'active' } = args;
  if (!class_name) return return_error(new Error('class_name is required'));
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  const className = class_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getClass(resultsFor(classDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetClass', detail: 'terse' },
      () => readClassMetadata(client, { className }),
      (metadata: AdtReading<string>) => ({
        success: true,
        class_name: className,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answer(
    { tool: 'GetClass', detail: 'terse' },
    () => obj.read({ className }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      class_name: className,
      version,
      part,
      source: source.raw,
    }),
  );
}
