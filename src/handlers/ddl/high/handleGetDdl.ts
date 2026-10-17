import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetDdl',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read an ABAP DDL source (CDS) in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name.',
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
    required: ['ddl_name'],
  },
} as const;

interface GetDdlArgs {
  ddl_name: string;
  part?: ReadPart;
  version?: 'active' | 'inactive';
}

export async function handleGetDdl(context: HandlerContext, args: GetDdlArgs) {
  const { connection, logger } = context;
  const { ddl_name, version = 'active' } = args;
  if (!ddl_name) return return_error(new Error('ddl_name is required'));
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  const ddlName = ddl_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getDdl(
    resultsFor(ddlDocuments),
  );

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetDdl', detail: 'terse' },
      () => obj.readMetadata({ ddlName }, { analyse: analyseException }),
      (metadata: AdtReading<string>) => ({
        success: true,
        ddl_name: ddlName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answer(
    { tool: 'GetDdl', detail: 'terse' },
    () => obj.read({ ddlName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      ddl_name: ddlName,
      version,
      part,
      source: source.raw,
    }),
  );
}
