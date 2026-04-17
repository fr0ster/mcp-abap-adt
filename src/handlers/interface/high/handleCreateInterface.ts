/**
 * CreateInterface Handler - ABAP Interface Creation via ADT API
 *
 * Workflow: create (object in initial state)
 * Source code is set via UpdateInterface handler.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  encodeSapObjectName,
  return_error,
  return_response,
} from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateInterface',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Create. Subject: Interface. Will be useful for creating interface. Create a new ABAP interface in SAP system. Creates the interface object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description:
          'Interface name (e.g., ZIF_TEST_INTERFACE_001). Must follow SAP naming conventions (start with Z or Y).',
      },
      description: {
        type: 'string',
        description:
          'Interface description. If not provided, interface_name will be used.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LAB, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
    },
    required: ['interface_name', 'package_name'],
  },
} as const;

interface CreateInterfaceArgs {
  interface_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
}

export async function handleCreateInterface(
  context: HandlerContext,
  args: CreateInterfaceArgs,
) {
  const { connection, logger } = context;
  try {
    // Validate required parameters
    if (!args?.interface_name) {
      return return_error(new Error('interface_name is required'));
    }
    if (!args?.package_name) {
      return return_error(new Error('package_name is required'));
    }

    // Validate transport_request: required for non-$TMP packages
    try {
      validateTransportRequest(args.package_name, args.transport_request);
    } catch (error) {
      return return_error(error as Error);
    }

    const interfaceName = args.interface_name.toUpperCase();
    const description = args.description || interfaceName;
    const packageName = args.package_name;
    const transportRequest = args.transport_request || '';

    logger?.info(`Starting interface creation: ${interfaceName}`);

    try {
      const client = createAdtClient(connection, logger);

      // Create
      await client.getInterface().create({
        interfaceName,
        description,
        packageName,
        transportRequest,
      });

      logger?.info(`Interface created: ${interfaceName}`);

      const result = {
        success: true,
        interface_name: interfaceName,
        package_name: packageName,
        transport_request: transportRequest || null,
        type: 'INTF/OI',
        message: `Interface ${interfaceName} created successfully. Use UpdateInterface to set source code.`,
        uri: `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName).toLowerCase()}`,
        steps_completed: ['create'],
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
    } catch (error: any) {
      logger?.error(
        `Interface creation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return return_error(error);
    }
  } catch (error: any) {
    logger?.error(
      `CreateInterface handler error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return return_error(error);
  }
}
