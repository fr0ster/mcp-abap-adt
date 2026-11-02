import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_PROPERTY,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import { readDomainMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP domain named by domain_name in one request: its ADT metadata document (definition, package, description), at the version asked. Returns it under `metadata`, with `part: "metadata"`.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name.',
      },
      version: READ_VERSION_PROPERTY,
    },
    required: ['domain_name'],
  },
} as const;

interface GetDomainArgs {
  domain_name: string;
  version?: ReadVersion;
}

export async function handleGetDomain(
  context: HandlerContext,
  args: GetDomainArgs,
) {
  const { connection, logger } = context;
  const { domain_name, version = 'active' } = args;
  if (!domain_name) return return_error(new Error('domain_name is required'));

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
