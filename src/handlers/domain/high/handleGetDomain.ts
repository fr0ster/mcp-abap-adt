import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP domain definition. Supports reading active or inactive version.',
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
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['domain_name'],
  },
} as const;

interface GetDomainArgs {
  domain_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetDomain(
  context: HandlerContext,
  args: GetDomainArgs,
) {
  const { connection, logger } = context;
  const { domain_name, version = 'active' } = args;
  if (!domain_name) return return_error(new Error('domain_name is required'));

  const domainName = domain_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getDomain(
    resultsFor(domainDocuments),
  );

  // A domain has no source of its own — `IDomainContract` composes
  // `IAdtMetadataReadable` and nothing else, so unlike its siblings there
  // is no `.read()` to call at all: `read` and `readMetadata` fetched the
  // identical document even before 19 (same defect/fix as `ReadDomain`).
  // `version` is not forwarded to the call — `AdtDomain` ignores it at
  // every level — matching `ReadDomain`'s own, deliberately unfixed, echo
  // (task 11 fix round 1: "the library ignores `version` at every level
  // and the pre-existing echo is inert ... deferred to the documentation
  // task"). One call, used for the one field this tool has always
  // answered.
  return answer(
    { tool: 'GetDomain', detail: 'terse' },
    () => obj.readMetadata({ domainName }, { analyse: analyseException }),
    (metadata: AdtReading<string>) => ({
      success: true,
      domain_name: domainName,
      version,
      domain_data: metadata.raw,
    }),
  );
}
