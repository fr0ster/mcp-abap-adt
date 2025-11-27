/**
 * CreatePackage Handler - Create ABAP Package
 *
 * Uses CrudClient.createPackage from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection, logErrorSafely } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { PackageBuilderConfig } from '@mcp-abap-adt/adt-clients';

// Type matching CrudClient.createPackage signature
type CreatePackageConfig = Partial<PackageBuilderConfig> & Pick<PackageBuilderConfig, 'packageName' | 'superPackage' | 'description' | 'softwareComponent'>;

export const TOOL_DEFINITION = {
  name: "CreatePackageLow",
  description: "[low-level] Create a new ABAP package. - use CreatePackage (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions."
      },
      super_package: {
        type: "string",
        description: "Super package (parent package) name (e.g., ZOK_PACKAGE). Required."
      },
      description: {
        type: "string",
        description: "Package description."
      },
      package_type: {
        type: "string",
        description: "Package type (development/structure). Defaults to development."
      },
            software_component: {
              type: "string",
              description: "Software component (e.g., HOME, ZLOCAL). If not provided, SAP will set a default (typically ZLOCAL for local packages)."
            },
      transport_layer: {
        type: "string",
        description: "Transport layer (e.g., ZDEV). Required for transportable packages."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      application_component: {
        type: "string",
        description: "Application component (e.g., BC-ABA)."
      },
      session_id: {
        type: "string",
        description: "Session ID from GetSession. If not provided, a new session will be created."
      },
      session_state: {
        type: "object",
        description: "Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["package_name", "super_package", "description"]
  }
} as const;

interface CreatePackageArgs {
  package_name: string;
  super_package: string;
  description: string;
  package_type?: string;
  software_component?: string;
  transport_layer?: string;
  transport_request?: string;
  application_component?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreatePackage MCP tool
 *
 * Uses CrudClient.createPackage - low-level single method call
 */
export async function handleCreatePackage(args: CreatePackageArgs) {
  try {
    const {
      package_name,
      super_package,
      description,
      package_type,
      software_component,
      transport_layer,
      transport_request,
      application_component,
      session_id,
      session_state
    } = args as CreatePackageArgs;

    // Validation
    if (!package_name || !super_package || !description) {
      return return_error(new Error('package_name, super_package, and description are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const packageName = package_name.toUpperCase();
    const superPackage = super_package.toUpperCase();

    logger.info(`Starting package creation: ${packageName} in ${superPackage}`);

    try {
      // Create package - build config object with proper typing
      const createConfig: CreatePackageConfig = {
        packageName,
        superPackage,
        description,
        packageType: package_type,
        softwareComponent: software_component
      };
      // Only add optional params if explicitly provided
      if (transport_layer) {
        createConfig.transportLayer = transport_layer;
      }
      if (transport_request) {
        createConfig.transportRequest = transport_request;
      }
      if (application_component) {
        createConfig.applicationComponent = application_component;
      }

      try {
        await client.createPackage(createConfig);
      } catch (createError: any) {
        throw createError;
      }

      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for package ${packageName}`);
      }

      // Get updated session state after create
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ CreatePackage completed: ${packageName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          package_name: packageName,
          super_package: superPackage,
          description,
          package_type: package_type || 'development',
          software_component: software_component || null,
          transport_layer: transport_layer || null,
          transport_request: transport_request || null,
          application_component: application_component || null,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Package ${packageName} created successfully. Use LockPackage and UpdatePackage to modify, then UnlockPackage.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logErrorSafely(logger, `CreatePackage ${packageName}`, error);

      // Check for authentication errors (expired tokens)
      if (error.message?.includes('Refresh token has expired') ||
          error.message?.includes('JWT token has expired') ||
          error.message?.includes('Please re-authenticate')) {
        return return_error(new Error(`Authentication failed: ${error.message}. Please re-authenticate using the authentication tool or update your credentials.`));
      }

      // Check for 401/403 authentication errors
      if (error.response?.status === 401 || error.response?.status === 403) {
        const authError = error.response?.status === 401
          ? 'Unauthorized: Authentication failed. Please check your credentials and re-authenticate.'
          : 'Forbidden: Access denied. Please check your permissions.';
        return return_error(new Error(authError));
      }

      // Parse error message
      let errorMessage = `Failed to create package: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Package ${packageName} already exists.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
