/**
 * CreatePackage Handler - Create ABAP Package via ADT API
 *
 * Uses PackageBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> check
 */

import { McpError, ErrorCode, AxiosResponse } from '../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "CreatePackage",
  description: "Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.",
  inputSchema: {
    package_name: z.string().describe("Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions (start with Z or Y for customer namespace)."),
    description: z.string().optional().describe("Package description. If not provided, package_name will be used."),
    super_package: z.string().describe("Parent package name (e.g., ZOK_PACKAGE). Required for structure packages."),
    package_type: z.enum(["development", "structure"]).default("development").describe("Package type: 'development' (default) or 'structure'"),
    software_component: z.string().optional().describe("Software component (e.g., HOME, LOCAL). Default: HOME"),
    transport_layer: z.string().optional().describe("Transport layer (e.g., ZE19). Required for transportable packages."),
    transport_request: z.string().optional().describe("Transport request number (e.g., E19K905635). Required if package is transportable."),
    application_component: z.string().optional().describe("Application component (optional, e.g., BC-ABA)"),
    responsible: z.string().optional().describe("User responsible for the package (e.g., CB9980002377). If not provided, uses SAP_USERNAME or SAP_USER environment variable.")
  }
} as const;

interface CreatePackageArgs {
  package_name: string;
  description?: string;
  super_package: string;
  package_type?: string;
  software_component?: string;
  transport_layer?: string;
  transport_request?: string;
  application_component?: string;
  responsible?: string;
}


/**
 * Main handler for CreatePackage MCP tool
 *
 * Uses PackageBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreatePackage(args: any) {
  try {
    // Validate required parameters
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    if (!args?.super_package) {
      throw new McpError(ErrorCode.InvalidParams, 'Super package (parent package) is required');
    }

    const typedArgs = args as CreatePackageArgs;
    const connection = getManagedConnection();
    const packageName = typedArgs.package_name.toUpperCase();

    logger.info(`Starting package creation: ${packageName}`);

    try {
      // Create client
      const client = new CrudClient(connection);

      // Validate
      await client.validatePackage(packageName, typedArgs.super_package);

      // Create
      await client.createPackage(
        packageName,
        typedArgs.super_package,
        typedArgs.description || packageName,
        typedArgs.transport_request
      );

      // Check
      await client.checkPackage(packageName, typedArgs.super_package);

      logger.info(`✅ CreatePackage completed successfully: ${packageName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          package_name: packageName,
          description: typedArgs.description || packageName,
          super_package: typedArgs.super_package,
          package_type: typedArgs.package_type || 'development',
          software_component: typedArgs.software_component || 'HOME',
          transport_layer: typedArgs.transport_layer,
          transport_request: typedArgs.transport_request,
          uri: `/sap/bc/adt/packages/${packageName.toLowerCase()}`,
          message: `Package ${packageName} created successfully`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating package ${packageName}:`, error);

      // Check if package already exists
      if (error.message?.includes('already exists') || error.response?.status === 409) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Package ${packageName} already exists. Please delete it first or use a different name.`
        );
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create package ${packageName}: ${errorMessage}`
      );
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
