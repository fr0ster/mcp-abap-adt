import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import { readIncludeMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetInclude',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP include named by include_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      include_name: {
        type: 'string',
        description: 'Include name.',
      },
      part: READ_PART_PROPERTY,
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.',
      },
    },
    required: ['include_name'],
  },
} as const;

interface GetIncludeArgs {
  /** Required by the schema; a call from outside it may leave it out. */
  include_name?: string;
  part?: ReadPart;
  version?: 'active' | 'inactive';
}

/** How a source read is answered: the read's text, with what was asked. */
type SourceAnswer = (
  includeName: string,
  version: 'active' | 'inactive' | undefined,
  source: string,
) => unknown;

/**
 * The one request a call sends: the source (at `version` when given) or the
 * metadata document, answered as `GetProgram` answers it, the source as
 * `sourceAnswer` makes it.
 */
async function readInclude(
  context: HandlerContext,
  args: GetIncludeArgs,
  sourceAnswer: SourceAnswer,
) {
  const { connection, logger } = context;
  const { include_name, version } = args;
  if (!include_name) return return_error('Include name is required');
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  const includeName = include_name.toUpperCase();
  logger?.info(`Fetching include: ${includeName}`);
  const client = createAdtClient(connection, logger);

  // One request per call: the part asked for, and only it. SAP's refusal is
  // the method's error as it is, a credential failure the chain's answer, a
  // throw of our own `client_threw`.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetInclude', detail: 'terse' },
      () => readIncludeMetadata(client, { includeName }),
      (metadata: AdtReading<string>) => ({
        success: true,
        include_name: includeName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answer(
    { tool: 'GetInclude', detail: 'terse' },
    () =>
      client
        .getInclude(resultsFor(includeDocuments))
        .read({ includeName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) =>
      sourceAnswer(includeName, version, source.raw),
  );
}

/**
 * `GetInclude`: the source as the text SAP sent, the metadata document as
 * `GetProgram` answers it.
 */
export async function handleGetInclude(
  context: HandlerContext,
  args: GetIncludeArgs,
) {
  return readInclude(context, args, (_name, _version, source) => source);
}

/**
 * Both parts as `GetProgram` answers them: the source too, as
 * `{ success, include_name, version, part: 'source', source }` (compact
 * `HandlerGet`), `version` present when the call gave one.
 */
export async function handleGetIncludePart(
  context: HandlerContext,
  args: GetIncludeArgs,
) {
  return readInclude(context, args, (includeName, version, source) => ({
    success: true,
    include_name: includeName,
    ...(version === undefined ? {} : { version }),
    part: 'source',
    source,
  }));
}
