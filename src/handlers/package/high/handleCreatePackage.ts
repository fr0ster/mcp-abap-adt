/**
 * CreatePackage Handler - Create ABAP Package via ADT API
 *
 * Uses PackageBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> check
 */

import { McpError, ErrorCode, AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, logErrorSafely } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { AbapConnection } from '@mcp-abap-adt/connection';
import type { PackageBuilderConfig } from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';
export const TOOL_DEFINITION = {
  name: "CreatePackage",
  description: "Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.",
  inputSchema: {
    package_name: z.string().describe("Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions (start with Z or Y for customer namespace)."),
    description: z.string().optional().describe("Package description. If not provided, package_name will be used."),
    super_package: z.string().describe("Parent package name (e.g., ZOK_PACKAGE). Required for structure packages."),
    package_type: z.enum(["development", "structure"]).default("development").describe("Package type: 'development' (default) or 'structure'"),
    software_component: z.string().optional().describe("Software component (e.g., HOME, ZLOCAL). If not provided, SAP will set a default (typically ZLOCAL for local packages)."),
    transport_layer: z.string().optional().describe("Transport layer (e.g., ZE19). Required for transportable packages."),
    transport_request: z.string().optional().describe("Transport request number (e.g., E19K905635). Required if package is transportable."),
    application_component: z.string().optional().describe("Application component (optional, e.g., BC-ABA)")
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
}


/**
 * Main handler for CreatePackage MCP tool
 *
 * Uses PackageBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreatePackage(connection: AbapConnection, args: CreatePackageArgs) {
  try {
    // Validate required parameters
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    if (!args?.super_package) {
      throw new McpError(ErrorCode.InvalidParams, 'Super package (parent package) is required');
    }

    const typedArgs = args;

    // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
        const packageName = typedArgs.package_name.toUpperCase();
    const handlerLogger = getHandlerLogger(
      'handleCreatePackage',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting package creation: ${packageName}`);

    try {
      const client = new CrudClient(connection);

      // Validate
      await client.validatePackage({
        packageName: packageName,
        superPackage: typedArgs.super_package,
        description: ''
      });

      // Create - build config object with proper typing
      const createConfig: Partial<PackageBuilderConfig> & Pick<PackageBuilderConfig, 'packageName' | 'superPackage' | 'description' | 'softwareComponent'> = {
        packageName,
        superPackage: typedArgs.super_package,
        description: typedArgs.description || packageName,
        packageType: typedArgs.package_type,
        softwareComponent: typedArgs.software_component
      };

      // Only add optional params if explicitly provided
      if (typedArgs.transport_layer) {
        createConfig.transportLayer = typedArgs.transport_layer;
      }
      if (typedArgs.transport_request) {
        createConfig.transportRequest = typedArgs.transport_request;
      }
      if (typedArgs.application_component) {
        createConfig.applicationComponent = typedArgs.application_component;
      }

      // DEBUG: Log softwareComponent at each step
      handlerLogger.debug(`[CreatePackage] software_component in args: ${typedArgs.software_component || 'undefined'}`);
      handlerLogger.debug(`[CreatePackage] softwareComponent in config: ${createConfig.softwareComponent || 'undefined'}`);

      await client.createPackage(createConfig);

      // Check
      await client.checkPackage({ packageName: packageName, superPackage: typedArgs.super_package });

      handlerLogger.info(`✅ CreatePackage completed successfully: ${packageName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          package_name: packageName,
          description: typedArgs.description || packageName,
          super_package: typedArgs.super_package,
          package_type: typedArgs.package_type || 'development',
          software_component: typedArgs.software_component || null,
          transport_layer: typedArgs.transport_layer || null,
          transport_request: typedArgs.transport_request || null,
          uri: `/sap/bc/adt/packages/${packageName.toLowerCase()}`,
          message: `Package ${packageName} created successfully`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logErrorSafely(baseLogger, `CreatePackage ${packageName}`, error);

      // Check for authentication errors (expired tokens)
      if (error.message?.includes('Refresh token has expired') ||
          error.message?.includes('JWT token has expired') ||
          error.message?.includes('Please re-authenticate')) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Authentication failed: ${error.message}. Please re-authenticate using the authentication tool or update your credentials.`
        );
      }

      // Check if package already exists
      const errorMessageLower = error.message?.toLowerCase() || '';
      const errorDataLower = typeof error.response?.data === 'string' ? error.response.data.toLowerCase() : '';
      if (errorMessageLower.includes('already exists') ||
          errorMessageLower.includes('does already exist') ||
          errorDataLower.includes('already exists') ||
          errorDataLower.includes('does already exist') ||
          errorDataLower.includes('exceptionresourcealreadyexists') ||
          error.response?.status === 409) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Package ${packageName} already exists. Please delete it first or use a different name.`
        );
      }

      // Check for 401/403 authentication errors
      if (error.response?.status === 401 || error.response?.status === 403) {
        const authError = error.response?.status === 401
          ? 'Unauthorized: Authentication failed. Please check your credentials and re-authenticate.'
          : 'Forbidden: Access denied. Please check your permissions.';
        throw new McpError(
          ErrorCode.InvalidRequest,
          authError
        );
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create package ${packageName}: ${errorMessage}`
      );
    } finally {
      try {
        connection.reset();
        handlerLogger.debug('Reset package connection after use');
      } catch (resetError: any) {
        handlerLogger.error(`Failed to reset package connection: ${resetError?.message || resetError}`);
      }
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
