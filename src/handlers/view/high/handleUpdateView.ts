/**
 * UpdateView Handler - Update existing CDS/Classic view DDL source
 *
 * Workflow: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive) -> (activate)
 */

import { XMLParser } from 'fast-xml-parser';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  encodeSapObjectName,
  return_error,
  return_response,
  safeCheckOperation,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateView',
  description:
    'Update DDL source code of an existing CDS View or Classic View. Locks the view, checks new code, uploads new DDL source, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      view_name: {
        type: 'string',
        description: 'View name (e.g., ZOK_R_TEST_0002).',
      },
      ddl_source: { type: 'string', description: 'Complete DDL source code.' },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate after update. Default: false.',
      },
    },
    required: ['view_name', 'ddl_source'],
  },
} as const;

interface UpdateViewArgs {
  view_name: string;
  ddl_source: string;
  transport_request?: string;
  activate?: boolean;
}

export async function handleUpdateView(context: HandlerContext, params: any) {
  const { connection, logger } = context;
  const args: UpdateViewArgs = params;

  if (!args.view_name || !args.ddl_source) {
    return return_error(
      new Error('Missing required parameters: view_name and ddl_source'),
    );
  }

  const viewName = args.view_name.toUpperCase();
  logger?.info(
    `Starting view source update: ${viewName} (activate=${args.activate === true})`,
  );

  // Connection setup
  try {
    // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    logger?.debug(`Created separate connection for handler call: ${viewName}`);
  } catch (connectionError: any) {
    const errorMessage =
      connectionError instanceof Error
        ? connectionError.message
        : String(connectionError);
    logger?.error(`Failed to create connection: ${errorMessage}`);
    return return_error(
      new Error(`Failed to create connection: ${errorMessage}`),
    );
  }

  try {
    const client = createAdtClient(connection);
    const shouldActivate = args.activate === true;
    let lockHandle: string | undefined;

    // Lock
    logger?.debug(`Locking view: ${viewName}`);
    lockHandle = await client.getView().lock({ viewName });
    logger?.debug(
      `View locked: ${viewName} (handle=${lockHandle ? `${lockHandle.substring(0, 8)}...` : 'none'})`,
    );

    try {
      // Check new code BEFORE update
      logger?.debug(`Checking new DDL code before update: ${viewName}`);
      let checkNewCodePassed = false;
      try {
        await safeCheckOperation(
          () =>
            client
              .getView()
              .check({ viewName, ddlSource: args.ddl_source }, 'inactive'),
          viewName,
          {
            debug: (message: string) => logger?.debug(message),
          },
        );
        checkNewCodePassed = true;
        logger?.debug(`New code check passed: ${viewName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          logger?.debug(`View ${viewName} was already checked - continuing`);
          checkNewCodePassed = true;
        } else {
          logger?.error(
            `New code check failed: ${viewName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`,
          );
          throw new Error(
            `New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`,
          );
        }
      }

      // Update (only if check passed)
      if (checkNewCodePassed) {
        logger?.debug(`Updating view DDL source: ${viewName}`);
        await client.getView().update(
          {
            viewName,
            ddlSource: args.ddl_source,
            transportRequest: args.transport_request,
          },
          { lockHandle },
        );
        logger?.info(`View DDL source updated: ${viewName}`);
      } else {
        logger?.warn(`Skipping update - new code check failed: ${viewName}`);
      }

      // Unlock (MANDATORY)
      logger?.debug(`Unlocking view: ${viewName}`);
      await client.getView().unlock({ viewName }, lockHandle);
      logger?.info(`View unlocked: ${viewName}`);

      // Check inactive version (after unlock)
      logger?.debug(`Checking inactive version: ${viewName}`);
      try {
        await safeCheckOperation(
          () =>
            client
              .getView()
              .check({ viewName, ddlSource: args.ddl_source }, 'inactive'),
          viewName,
          {
            debug: (message: string) => logger?.debug(message),
          },
        );
        logger?.debug(`Inactive version check completed: ${viewName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          logger?.debug(`View ${viewName} was already checked - continuing`);
        } else {
          logger?.warn(
            `Inactive version check had issues: ${viewName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`,
          );
        }
      }

      // Activate if requested
      let activateResponse: any | undefined;
      if (shouldActivate) {
        logger?.debug(`Activating view: ${viewName}`);
        try {
          const activateState = await client.getView().activate({ viewName });
          activateResponse = activateState.activateResult;
          logger?.info(`View activated: ${viewName}`);
        } catch (activationError: any) {
          logger?.error(
            `Activation failed: ${viewName} - ${activationError instanceof Error ? activationError.message : String(activationError)}`,
          );
          throw new Error(
            `Activation failed: ${activationError instanceof Error ? activationError.message : String(activationError)}`,
          );
        }
      } else {
        logger?.debug(`Skipping activation for: ${viewName}`);
      }

      // Parse activation warnings if activation was performed
      let activationWarnings: string[] = [];
      if (shouldActivate && activateResponse) {
        if (
          typeof activateResponse.data === 'string' &&
          activateResponse.data.includes('<chkl:messages')
        ) {
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const result = parser.parse(activateResponse.data);
          const messages = result?.['chkl:messages']?.msg;
          if (messages) {
            const msgArray = Array.isArray(messages) ? messages : [messages];
            activationWarnings = msgArray.map(
              (msg: any) =>
                `${msg['@_type']}: ${msg.shortText?.txt || 'Unknown'}`,
            );
          }
        }
      }

      logger?.info(`UpdateView completed successfully: ${viewName}`);

      const result = {
        success: true,
        view_name: viewName,
        type: 'DDLS',
        activated: shouldActivate,
        message: `View ${viewName} updated${shouldActivate ? ' and activated' : ''} successfully`,
        uri: `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName).toLowerCase()}`,
        steps_completed: [
          'lock',
          'check_new_code',
          'update',
          'unlock',
          'check_inactive',
          ...(shouldActivate ? ['activate'] : []),
        ],
        activation_warnings:
          activationWarnings.length > 0 ? activationWarnings : undefined,
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      } as AxiosResponse);
    } catch (workflowError: any) {
      // On error, ensure we attempt unlock
      try {
        if (lockHandle) {
          logger?.warn(`Attempting unlock after error for view ${viewName}`);
          await client.getView().unlock({ viewName }, lockHandle);
          logger?.warn(`Unlocked view after error: ${viewName}`);
        }
      } catch (unlockError: any) {
        logger?.error(
          `Failed to unlock view after error: ${viewName} - ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`,
        );
      }

      // Parse error message
      let errorMessage =
        workflowError instanceof Error
          ? workflowError.message
          : String(workflowError);

      // Attempt to parse ADT XML error
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
        });
        const errorData = workflowError?.response?.data
          ? parser.parse(workflowError.response.data)
          : null;
        const errorMsg =
          errorData?.['exc:exception']?.message?.['#text'] ||
          errorData?.['exc:exception']?.message;
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
    logger?.error(`Error updating view ${viewName}: ${errorMessage}`);
    return return_error(new Error(errorMessage));
  }
}
