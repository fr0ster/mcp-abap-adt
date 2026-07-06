/**
 * CreateDdl Handler - CDS/Classic View Creation via ADT API
 *
 * Workflow: validate -> create (object in initial state)
 * DDL source is set via UpdateDdl handler.
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
  name: 'CreateDdl',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Create. Subject: DDL source. Will be useful for creating a DDL source. Create a new CDS View or Classic View in SAP system. Creates the DDL source object in initial state. Use UpdateDdl to set DDL source code.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW).',
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
        description: 'Optional description (defaults to ddl_name).',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
    },
    required: ['ddl_name', 'package_name'],
  },
} as const;

interface CreateDdlArgs {
  ddl_name: string;
  package_name: string;
  transport_request?: string;
  description?: string;
  master_language?: string;
}

export async function handleCreateDdl(context: HandlerContext, params: any) {
  const { connection, logger } = context;
  const args: CreateDdlArgs = params;

  if (!args.ddl_name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: ddl_name and package_name'),
    );
  }

  try {
    validateTransportRequest(args.package_name, args.transport_request);
  } catch (error) {
    return return_error(error as Error);
  }

  const ddlName = args.ddl_name.toUpperCase();
  logger?.info(`Starting DDL source creation: ${ddlName}`);

  try {
    const client = createAdtClient(connection, logger);

    // Validate
    logger?.debug(`Validating DDL source: ${ddlName}`);
    await client.getDdl().validate({
      ddlName: ddlName,
      packageName: args.package_name,
      description: args.description || ddlName,
    });
    logger?.debug(`DDL source validation passed: ${ddlName}`);

    // Create
    logger?.debug(`Creating DDL source: ${ddlName}`);
    await client.getDdl().create({
      ddlName: ddlName,
      description: args.description || ddlName,
      packageName: args.package_name,
      ddlSource: '',
      transportRequest: args.transport_request,
      masterLanguage: args.master_language,
    });
    logger?.info(`DDL source created: ${ddlName}`);

    const result = {
      success: true,
      ddl_name: ddlName,
      package_name: args.package_name,
      transport_request: args.transport_request || null,
      type: 'DDLS',
      message: `DDL source ${ddlName} created successfully. Use UpdateDdl to set DDL source code.`,
      uri: `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(ddlName).toLowerCase()}`,
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
    logger?.error(`Error creating DDL source ${ddlName}: ${errorMessage}`);
    return return_error(new Error(errorMessage));
  }
}
