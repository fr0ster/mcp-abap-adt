/**
 * CreateView Handler - CDS/Classic View Creation via ADT API
 *
 * Workflow: validate -> create -> lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive) -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import {
  return_error,
  return_response,
  encodeSapObjectName,
  logger as baseLogger,
  safeCheckOperation
} from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

import { getManagedConnection } from '../../../lib/utils.js';
export const TOOL_DEFINITION = {
  name: "CreateView",
  description: "Create CDS View or Classic View in SAP using DDL syntax. Both types use the same API workflow, differing only in DDL content (CDS has @AbapCatalog.sqlViewName and other annotations).",
  inputSchema: {
    type: "object",
    properties: {
      view_name: { type: "string", description: "View name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW)." },
      ddl_source: { type: "string", description: "Complete DDL source code." },
      package_name: { type: "string", description: "Package name (e.g., ZOK_LAB, $TMP for local objects)" },
      transport_request: { type: "string", description: "Transport request number (required for transportable packages)." },
      description: { type: "string", description: "Optional description (defaults to view_name)." },
      activate: { type: "boolean", description: "Activate after creation. Default: true." }
    },
    required: ["view_name", "ddl_source", "package_name"]
  }
} as const;

interface CreateViewArgs {
  view_name: string;
  ddl_source: string;
  package_name: string;
  transport_request?: string;
  description?: string;
  activate?: boolean;
}

export async function handleCreateView(params: any) {
  const args: CreateViewArgs = params;

  if (!args.view_name || !args.ddl_source || !args.package_name) {
    return return_error(new Error("Missing required parameters: view_name, ddl_source, and package_name"));
  }

  try {
    validateTransportRequest(args.package_name, args.transport_request);
  } catch (error) {
    return return_error(error as Error);
  }

  const viewName = args.view_name.toUpperCase();
  const handlerLogger = getHandlerLogger(
    'handleCreateView',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  handlerLogger.info(`Starting view creation: ${viewName} (activate=${args.activate !== false})`);

  // Connection setup
  let connection: any = null;
  try {
            // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    connection = getManagedConnection();
    handlerLogger.debug(`Created separate connection for handler call: ${viewName}`);
  } catch (connectionError: any) {
    const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
    handlerLogger.error(`Failed to create connection: ${errorMessage}`);
    return return_error(new Error(`Failed to create connection: ${errorMessage}`));
  }

  try {
    const client = new CrudClient(connection);
    const shouldActivate = args.activate !== false; // default true

    // Validate
    handlerLogger.debug(`Validating view: ${viewName}`);
    await client.validateView({
      viewName,
      packageName: args.package_name,
      description: args.description || viewName
    });
    handlerLogger.debug(`View validation passed: ${viewName}`);

    // Create
    handlerLogger.debug(`Creating view: ${viewName}`);
    await client.createView({
      viewName,
      description: args.description || viewName,
      packageName: args.package_name,
      ddlSource: args.ddl_source || '',
      transportRequest: args.transport_request
    });
    handlerLogger.info(`View created: ${viewName}`);

    // Lock
    handlerLogger.debug(`Locking view: ${viewName}`);
    await client.lockView({ viewName });
    const lockHandle = client.getLockHandle();
    handlerLogger.debug(`View locked: ${viewName} (handle=${lockHandle ? lockHandle.substring(0, 8) + '...' : 'none'})`);

    try {
      // Check new code BEFORE update
      handlerLogger.debug(`Checking new DDL code before update: ${viewName}`);
      let checkNewCodePassed = false;
      try {
        await safeCheckOperation(
          () => client.checkView({ viewName }, args.ddl_source, 'inactive'),
          viewName,
          {
            debug: (message: string) => handlerLogger.debug(message)
          }
        );
        checkNewCodePassed = true;
        handlerLogger.debug(`New code check passed: ${viewName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          handlerLogger.debug(`View ${viewName} was already checked - continuing`);
          checkNewCodePassed = true;
        } else {
          handlerLogger.error(`New code check failed: ${viewName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
        }
      }

      // Update (only if check passed)
      if (checkNewCodePassed) {
        handlerLogger.debug(`Updating view DDL source: ${viewName}`);
        await client.updateView({ viewName, ddlSource: args.ddl_source }, lockHandle);
        handlerLogger.info(`View DDL source updated: ${viewName}`);
      } else {
        handlerLogger.warn(`Skipping update - new code check failed: ${viewName}`);
      }

      // Unlock (MANDATORY)
      handlerLogger.debug(`Unlocking view: ${viewName}`);
      await client.unlockView({ viewName }, lockHandle);
      handlerLogger.info(`View unlocked: ${viewName}`);

      // Check inactive version (after unlock)
      handlerLogger.debug(`Checking inactive version: ${viewName}`);
      try {
        await safeCheckOperation(
          () => client.checkView({ viewName }, undefined, 'inactive'),
          viewName,
          {
            debug: (message: string) => handlerLogger.debug(message)
          }
        );
        handlerLogger.debug(`Inactive version check completed: ${viewName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          handlerLogger.debug(`View ${viewName} was already checked - continuing`);
        } else {
          handlerLogger.warn(`Inactive version check had issues: ${viewName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
        }
      }

      // Activate if requested
      if (shouldActivate) {
        handlerLogger.debug(`Activating view: ${viewName}`);
        try {
          await client.activateView({ viewName });
          handlerLogger.info(`View activated: ${viewName}`);
        } catch (activationError: any) {
          handlerLogger.error(`Activation failed: ${viewName} - ${activationError instanceof Error ? activationError.message : String(activationError)}`);
          throw new Error(`Activation failed: ${activationError instanceof Error ? activationError.message : String(activationError)}`);
        }
      } else {
        handlerLogger.debug(`Skipping activation for: ${viewName}`);
      }

      // Parse activation warnings if activation was performed
      let activationWarnings: string[] = [];
      if (shouldActivate && client.getActivateResult()) {
        const activateResponse = client.getActivateResult()!;
        if (typeof activateResponse.data === 'string' && activateResponse.data.includes('<chkl:messages')) {
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const result = parser.parse(activateResponse.data);
          const messages = result?.['chkl:messages']?.['msg'];
          if (messages) {
            const msgArray = Array.isArray(messages) ? messages : [messages];
            activationWarnings = msgArray.map((msg: any) =>
              `${msg['@_type']}: ${msg['shortText']?.['txt'] || 'Unknown'}`
            );
          }
        }
      }

      handlerLogger.info(`CreateView completed successfully: ${viewName}`);

      const result = {
        success: true,
        view_name: viewName,
        package_name: args.package_name,
        transport_request: args.transport_request || null,
        type: 'DDLS',
        message: `View ${viewName} created${shouldActivate ? ' and activated' : ''} successfully`,
        uri: `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName).toLowerCase()}`,
        steps_completed: ['validate', 'create', 'lock', 'check_new_code', 'update', 'unlock', 'check_inactive', ...(shouldActivate ? ['activate'] : [])],
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (workflowError: any) {
      // On error, ensure we attempt unlock
      try {
        const lockHandle = client.getLockHandle();
        if (lockHandle) {
          handlerLogger.warn(`Attempting unlock after error for view ${viewName}`);
          await client.unlockView({ viewName }, lockHandle);
          handlerLogger.warn(`Unlocked view after error: ${viewName}`);
        }
      } catch (unlockError: any) {
        handlerLogger.error(`Failed to unlock view after error: ${viewName} - ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
      }

      // Parse error message
      let errorMessage = workflowError instanceof Error ? workflowError.message : String(workflowError);

      // Attempt to parse ADT XML error
      try {
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
        const errorData = workflowError?.response?.data ? parser.parse(workflowError.response.data) : null;
        const errorMsg = errorData?.['exc:exception']?.message?.['#text'] || errorData?.['exc:exception']?.message;
        if (errorMsg) {
          errorMessage = `SAP Error: ${errorMsg}`;
        }
      } catch {
        // ignore parse errors
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    handlerLogger.error(`Error creating view ${viewName}: ${errorMessage}`);
    return return_error(new Error(errorMessage));
  } finally {
    try {
      connection?.reset?.();
    } catch {
      // ignore
    }
  }
}
