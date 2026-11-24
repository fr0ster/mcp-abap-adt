import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { readerParts, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import { readDomainMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';

export const TOOL_DEFINITION = {
  name: 'GetDomain',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    readerParts({
      object: 'an ABAP domain',
      holding:
        'its data type, length, output format, value table, fixed values, package and description',
    }),
  ),
  inputSchema: z.object({
    domain_name: requiredText('domain_name is required').describe(
      'Domain name.',
    ),
    version: READ_VERSION_FIELD,
  }),
} as const;

type GetDomainArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetDomain(
  context: HandlerContext,
  args: GetDomainArgs,
) {
  const { connection, logger } = context;
  const { domain_name, version = 'active' } = args;
  const domainName = domain_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  // A domain has no source of its own — `IDomainContract` composes
  // `IAdtMetadataReadable` and nothing else, so unlike its siblings there
  // is no `.read()` to call at all: `read` and `readMetadata` fetched the
  // identical document even before 19. One call, at the version asked.
  return answer(
    { tool: 'GetDomain', detail: 'terse' },
    () => readDomainMetadata(client, { domainName }, version),
    (metadata: AdtReading<string>) => ({
      success: true,
      domain_name: domainName,
      version,
      part: 'metadata',
      metadata: metadata.raw,
    }),
  );
}
