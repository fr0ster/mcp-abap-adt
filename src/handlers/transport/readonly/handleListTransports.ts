/**
 * ListTransports Handler - List user's transport requests via ADT API
 *
 * Retrieves transport requests for the current user or specified user.
 * Uses AdtClient.getRequest().list() with proper Accept negotiation.
 */

import { XMLParser } from 'fast-xml-parser';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { getSystemContext } from '../../../lib/systemContext';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ListTransports',
  available_in: ['onprem', 'cloud'] as const,
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

/**
 * Status implied by the container a request sits in, used only when the request
 * node itself carries no `tm:status` attribute.
 */
const STATUS_BY_CONTAINER: Record<string, string> = {
  'tm:modifiable': 'D',
  'tm:released': 'R',
};

/** Modifiable request statuses: D = modifiable, L = modifiable/protected. */
const MODIFIABLE_STATUSES = new Set(['D', 'L']);

function collectRequestNodes(
  node: unknown,
  containerStatus: string,
  found: { req: Record<string, unknown>; containerStatus: string }[],
): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectRequestNodes(item, containerStatus, found);
    }
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'tm:request') {
      const requests = Array.isArray(value) ? value : [value];
      for (const req of requests) {
        if (req && typeof req === 'object') {
          found.push({ req: req as Record<string, unknown>, containerStatus });
        }
      }
      // Do not descend into a request: its children are tasks, not requests.
      continue;
    }
    collectRequestNodes(
      value,
      STATUS_BY_CONTAINER[key] ?? containerStatus,
      found,
    );
  }
}

/**
 * Parse the CTS transport list payload.
 *
 * The endpoint negotiates `application/vnd.sap.adt.transportorganizertree.v1+xml`,
 * a *tree*: requests sit under status containers, one level below the category —
 * `tm:root > tm:workbench > tm:modifiable > tm:request` — and `tm:workbench` may
 * repeat, once per transport target. The previous implementation looked for
 * `tm:request` only directly under the root or directly under `tm:workbench`,
 * so on a real system every lookup missed and the tool reported an empty list
 * while the user owned requests (#168).
 *
 * Requests are therefore collected from anywhere in the tree, which keeps the
 * flatter shapes working too. Duplicates (same request number reached through
 * more than one branch) are collapsed, first occurrence winning.
 */
export function parseTransportListXml(xmlData: string): TransportEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name) => {
      return ['tm:request', 'tm:task'].includes(name);
    },
  });

  const result = parser.parse(xmlData);

  const found: { req: Record<string, unknown>; containerStatus: string }[] = [];
  collectRequestNodes(result, '', found);

  const seen = new Set<string>();
  const entries: TransportEntry[] = [];

  for (const { req, containerStatus } of found) {
    const number =
      (req['tm:number'] as string) || (req['adtcore:name'] as string) || '';
    if (!number || seen.has(number)) {
      continue;
    }
    seen.add(number);
    entries.push({
      number,
      description:
        (req['tm:desc'] as string) || (req['tm:description'] as string) || '',
      type: (req['tm:type'] as string) || '',
      status: (req['tm:status'] as string) || containerStatus || '',
      owner: (req['tm:owner'] as string) || '',
      target: (req['tm:target'] as string) || '',
    });
  }

  return entries;
}

/** Unknown status is kept: never hide a request because it was not classified. */
export function isModifiableStatus(status: string | undefined): boolean {
  return !status || MODIFIABLE_STATUSES.has(status);
}

export async function handleListTransports(
  context: HandlerContext,
  args: ListTransportsArgs,
) {
  const { connection, logger } = context;
  try {
    const modifiableOnly = args?.modifiable_only !== false;
    const user =
      args?.user ||
      getSystemContext().responsible ||
      process.env.SAP_USERNAME ||
      '';

    logger?.debug(
      `ListTransports: user=${user}, modifiable_only=${modifiableOnly}`,
    );

    const client = createAdtClient(connection, logger);
    const state = await client.getRequest().list({
      user,
      status: modifiableOnly ? 'D' : undefined,
    });

    const parsed = parseTransportListXml(state.listResult?.data || '');

    // The tree representation returns both modifiable and released branches, and
    // it is not established that the endpoint honours the `status` query param
    // (#168). Filter here so `modifiable_only` holds regardless.
    const transports = modifiableOnly
      ? parsed.filter((t) => isModifiableStatus(t.status))
      : parsed;

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
