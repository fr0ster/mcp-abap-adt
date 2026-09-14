import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: Domain. Will be useful for reading, creating, or updating domain. [read-only] Read ABAP domain definition and metadata. Answers: "show domain X", "display domain fixed values", "view domain definition", "get domain properties". Returns definition, fixed values, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name (e.g., Z_MY_DOMAIN).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['domain_name'],
  },
} as const;

export async function handleReadDomain(
  context: HandlerContext,
  args: { domain_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  const { domain_name, version = 'active' } = args;
  if (!domain_name) return return_error(new Error('domain_name is required'));

  const domainName = domain_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getDomain(
    resultsFor(domainDocuments),
  );

  // A domain has no source of its own — `IDomainContract` composes
  // `IAdtMetadataReadable` and nothing else, so unlike its siblings in this
  // family there is no `.read()` to call at all: `read` and `readMetadata`
  // fetched the identical document even before 19. One call, used for both
  // fields this tool has always answered.
  return answer(
    { tool: 'ReadDomain', detail: 'terse' },
    () => obj.readMetadata({ domainName }, { analyse: analyseException }),
    (metadata: AdtReading<string>) => ({
      success: true,
      domain_name: domainName,
      version,
      source_code: metadata.raw,
      metadata: metadata.raw,
    }),
  );
}
