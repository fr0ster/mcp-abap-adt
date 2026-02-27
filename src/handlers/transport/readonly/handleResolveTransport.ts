/**
 * ResolveTransport Handler - Resolve transport request for an object via CTS transport checks
 *
 * Calls /sap/bc/adt/cts/transportchecks to determine:
 * - Which TR the object is already assigned to (LOCKS)
 * - Which TRs are available for the package (REQUESTS)
 * - Whether the package is local (no transport needed)
 *
 * Use this before create/update to determine the correct transport request.
 */

import { resolveTransport } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ResolveTransport',
  description:
    '[read-only] Resolve transport request for an ABAP object. Returns locked transport, available transports, and whether the package is local. Call before create/update to determine the correct transport request.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name (DEVCLASS), e.g. ZPACKAGE, $TMP, ZLOCAL.',
      },
      pgmid: {
        type: 'string',
        description: 'Program ID, e.g. R3TR. Default: R3TR.',
      },
      object_type: {
        type: 'string',
        description:
          'Object type, e.g. CLAS, PROG, DDLS, TABL, DOMA, DTEL, FUGR, INTF, DEVC, SRVD, BDEF, DDLX.',
      },
      object_name: {
        type: 'string',
        description: 'Object name, e.g. ZCL_MY_CLASS.',
      },
      object_uri: {
        type: 'string',
        description:
          'Object ADT URI, e.g. /sap/bc/adt/oo/classes/zcl_my_class. Optional.',
      },
      operation: {
        type: 'string',
        enum: ['I', 'U'],
        description: 'Operation: I = insert (create new object), U = update (modify existing). Default: I.',
      },
    },
    required: ['package_name'],
  },
} as const;

interface ResolveTransportArgs {
  package_name: string;
  pgmid?: string;
  object_type?: string;
  object_name?: string;
  object_uri?: string;
  operation?: 'I' | 'U';
}

export async function handleResolveTransport(
  context: HandlerContext,
  args: ResolveTransportArgs,
) {
  const { connection, logger } = context;
  try {
    if (!args?.package_name) {
      return return_error(new Error('package_name is required'));
    }

    logger?.debug(
      `ResolveTransport: package=${args.package_name} type=${args.object_type || '-'} name=${args.object_name || '-'} op=${args.operation || 'I'}`,
    );

    const result = await resolveTransport(connection, {
      pgmid: args.pgmid || 'R3TR',
      objectType: args.object_type,
      objectName: args.object_name,
      devclass: args.package_name,
      uri: args.object_uri,
      operation: args.operation || 'I',
    });

    logger?.info(
      `ResolveTransport: success=${result.success} local=${result.isLocal} locked=${result.lockedInTransport || '-'} available=[${result.availableTransports.join(',')}]`,
    );

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: result.success,
              package_name: args.package_name,
              is_local: result.isLocal,
              locked_in_transport: result.lockedInTransport || null,
              available_transports: result.availableTransports,
              message: result.isLocal
                ? `Package ${args.package_name} is local — no transport request needed.`
                : result.lockedInTransport
                  ? `Object is assigned to transport ${result.lockedInTransport}.`
                  : result.availableTransports.length > 0
                    ? `Available transports: ${result.availableTransports.join(', ')}.`
                    : `No transports found for package ${args.package_name}.`,
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
