import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_FIELD,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import {
  READ_VERSION_FIELD_UNDEFAULTED,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  SOURCE_RANGE_WORDS,
  type SourceCut,
  type SourceRangeArgs,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readIncludeMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetInclude',
  available_in: ['onprem', 'cloud'] as const,
  description: `[read-only] Reads the ABAP include named by include_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. ${SOURCE_RANGE_WORDS}`,
  inputSchema: z.object({
    include_name: z.string().describe('Include name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD_UNDEFAULTED,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetIncludeArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** How a source read is answered: the read's text, with what was asked. */
type SourceAnswer<R> = (
  includeName: string,
  version: ReadVersion | undefined,
  source: string,
  cut: SourceCut | undefined,
) => R;

/**
 * The one request a call sends: the source or the metadata document, at
 * `version` (active when none is given), answered as `GetProgram` answers it, the source as
 * `sourceAnswer` makes it.
 */
async function readInclude<R>(
  context: HandlerContext,
  args: GetIncludeArgs,
  sourceAnswer: SourceAnswer<R>,
) {
  const { connection, logger } = context;
  const { include_name, version } = args;
  if (!include_name) return return_error('Include name is required');
  const part = readPartOf(args.part);
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

  const includeName = include_name.toUpperCase();
  logger?.info(`Fetching include: ${includeName}`);
  const client = createAdtClient(connection, logger);

  // One request per call: the part asked for, and only it. SAP's refusal is
  // the method's error as it is, a credential failure the chain's answer, a
  // throw of our own `client_threw`.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetInclude', detail: 'terse' },
      () => readIncludeMetadata(client, { includeName }, version ?? 'active'),
      (metadata: AdtReading<string>) => ({
        success: true,
        include_name: includeName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetInclude', detail: 'terse' },
    range,
    () =>
      client
        .getInclude(resultsFor(includeDocuments))
        .read({ includeName }, version ?? 'active', {
          analyse: analyseException,
        }),
    (source, cut) => sourceAnswer(includeName, version, source, cut),
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
  return readInclude(context, args, (includeName, version, source, cut) => ({
    success: true,
    include_name: includeName,
    ...(version === undefined ? {} : { version }),
    part: 'source',
    source,
    ...rangeFields(cut),
  }));
}
