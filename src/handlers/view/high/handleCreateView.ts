/**
 * CreateView Handler - CDS/Classic View Creation via ADT API
 *
 * Workflow: validate -> create (object in initial state)
 * DDL source is set via UpdateView handler.
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
  name: 'CreateView',
  description:
    'Create CDS View or Classic View in SAP. Creates the view object in initial state. Use UpdateView to set DDL source code afterwards.',
  inputSchema: {
    type: 'object',
    properties: {
      view_name: {
        type: 'string',
        description: 'View name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LAB, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
      description: {
        type: 'string',
        description: 'Optional description (defaults to view_name).',
      },
    },
    required: ['view_name', 'package_name'],
  },
} as const;

interface CreateViewArgs {
  view_name: string;
  package_name: string;
  transport_request?: string;
  description?: string;
}

export async function handleCreateView(context: HandlerContext, params: any) {
  const { connection, logger } = context;
  const args: CreateViewArgs = params;

  if (!args.view_name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: view_name and package_name'),
    );
  }

  try {
    validateTransportRequest(args.package_name, args.transport_request);
  } catch (error) {
    return return_error(error as Error);
  }

  const viewName = args.view_name.toUpperCase();
  logger?.info(`Starting view creation: ${viewName}`);

  try {
    const client = createAdtClient(connection);

    // Validate
    logger?.debug(`Validating view: ${viewName}`);
    await client.getView().validate({
      viewName,
      packageName: args.package_name,
      description: args.description || viewName,
    });
    logger?.debug(`View validation passed: ${viewName}`);

    // Create
    logger?.debug(`Creating view: ${viewName}`);
    await client.getView().create({
      viewName,
      description: args.description || viewName,
      packageName: args.package_name,
      ddlSource: '',
      transportRequest: args.transport_request,
    });
    logger?.info(`View created: ${viewName}`);

    const result = {
      success: true,
      view_name: viewName,
      package_name: args.package_name,
      transport_request: args.transport_request || null,
      type: 'DDLS',
      message: `View ${viewName} created successfully. Use UpdateView to set DDL source code.`,
      uri: `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName).toLowerCase()}`,
      steps_completed: ['validate', 'create'],
    };

    return return_response({
      data: JSON.stringify(result, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger?.error(`Error creating view ${viewName}: ${errorMessage}`);
    return return_error(new Error(errorMessage));
  }
}
