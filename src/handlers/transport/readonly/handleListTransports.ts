/**
 * ListTransports Handler - List user's transport requests via ADT API
 *
 * Retrieves transport requests for the current user or specified user.
 * Uses /sap/bc/adt/cts/transportrequests endpoint with search filters.
 */

import { XMLParser } from 'fast-xml-parser';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { makeAdtRequestWithTimeout, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ListTransports',
  description:
    '[read-only] List transport requests for the current or specified user. Returns modifiable and/or released workbench and customizing requests.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description:
          'SAP user name. If not provided, returns transports for the current user.',
      },
      modifiable_only: {
        type: 'boolean',
        description:
          'Only return modifiable (not yet released) transports. Default: true.',
      },
    },
    required: [],
  },
} as const;

interface ListTransportsArgs {
  user?: string;
  modifiable_only?: boolean;
}

interface TransportEntry {
  number: string;
  description?: string;
  type?: string;
  status?: string;
  owner?: string;
  target?: string;
}

function parseTransportListXml(xmlData: string): TransportEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name) => {
      return ['tm:request', 'tm:task'].includes(name);
    },
  });

  const result = parser.parse(xmlData);

  // Response can be under different roots depending on SAP version
  const root = result['tm:root'] || result['tm:roots'] || result;

  // Extract requests
  const requests =
    root?.['tm:request'] || root?.['tm:workbench']?.['tm:request'] || [];
  const requestList = Array.isArray(requests) ? requests : [requests];

  return requestList
    .filter((req: Record<string, unknown>) => req)
    .map((req: Record<string, unknown>) => ({
      number:
        (req['tm:number'] as string) || (req['adtcore:name'] as string) || '',
      description:
        (req['tm:desc'] as string) || (req['tm:description'] as string) || '',
      type: (req['tm:type'] as string) || '',
      status: (req['tm:status'] as string) || '',
      owner: (req['tm:owner'] as string) || '',
      target: (req['tm:target'] as string) || '',
    }))
    .filter((t: TransportEntry) => t.number);
}

export async function handleListTransports(
  context: HandlerContext,
  args: ListTransportsArgs,
) {
  const { connection, logger } = context;
  try {
    const modifiableOnly = args?.modifiable_only !== false;

    // Build URL with query params
    const params: string[] = [];
    if (args?.user) {
      params.push(`user=${encodeURIComponent(args.user)}`);
    }
    if (modifiableOnly) {
      params.push('status=D'); // D = modifiable
    }

    const url = `/sap/bc/adt/cts/transportrequests${params.length > 0 ? `?${params.join('&')}` : ''}`;

    logger?.debug(`ListTransports: ${url}`);

    const response = await makeAdtRequestWithTimeout(
      connection,
      url,
      'GET',
      'default',
      undefined,
      undefined,
      {
        Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
      },
    );

    const transports = parseTransportListXml(response.data);

    logger?.info(`ListTransports: found ${transports.length} transport(s)`);

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              count: transports.length,
              transports,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return return_error(error);
  }
}
