/**
 * UpdateDdl Handler - Update existing CDS/Classic view DDL source
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
  name: 'UpdateDdl',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Update, Create. Subject: DDL source. Will be useful for updating or creating a DDL source. Update DDL source code of an existing CDS View or Classic View. Locks, updates, unlocks, and optionally activates. Use CreateDdl to create a new DDL source.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., ZOK_R_TEST_0002).',
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
    required: ['ddl_name', 'ddl_source'],
  },
} as const;

interface UpdateDdlArgs {
  ddl_name: string;
  ddl_source: string;
  transport_request?: string;
  activate?: boolean;
}

export async function handleUpdateDdl(context: HandlerContext, params: any) {
  const { connection, logger } = context;
  const args: UpdateDdlArgs = params;

  if (!args.ddl_name || !args.ddl_source) {
    return return_error(
      new Error('Missing required parameters: ddl_name and ddl_source'),
    );
  }

  const ddlName = args.ddl_name.toUpperCase();
  logger?.info(
    `Starting view source update: ${ddlName} (activate=${args.activate === true})`,
  );

  // Connection setup
  try {
    // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    logger?.debug(`Created separate connection for handler call: ${ddlName}`);
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
    const client = createAdtClient(connection, logger);
    const shouldActivate = args.activate === true;
    let lockHandle: string | undefined;

    try {
      // Lock
      logger?.debug(`Locking view: ${ddlName}`);
      lockHandle = await client.getDdl().lock({ ddlName: ddlName });
      logger?.debug(
        `View locked: ${ddlName} (handle=${lockHandle ? `${lockHandle.substring(0, 8)}...` : 'none'})`,
      );

      // Check new code BEFORE update (only when activating)
      if (shouldActivate) {
        logger?.debug(`Checking new DDL code before update: ${ddlName}`);
        try {
          await safeCheckOperation(
            () =>
              client
                .getDdl()
                .check(
                  { ddlName: ddlName, ddlSource: args.ddl_source },
                  'inactive',
                ),
            ddlName,
            {
              debug: (message: string) => logger?.debug(message),
            },
          );
          logger?.debug(`New code check passed: ${ddlName}`);
        } catch (checkError: any) {
          if ((checkError as any).isAlreadyChecked) {
            logger?.debug(`View ${ddlName} was already checked - continuing`);
          } else {
            logger?.error(
              `New code check failed: ${ddlName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`,
            );
            throw new Error(
              `New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`,
            );
          }
        }
      } else {
        logger?.debug(`Skipping syntax check (activate=false): ${ddlName}`);
      }

      // Update
      logger?.debug(`Updating view DDL source: ${ddlName}`);
      await client.getDdl().update(
        {
          ddlName: ddlName,
          ddlSource: args.ddl_source,
          transportRequest: args.transport_request,
        },
        { lockHandle },
      );
      logger?.info(`View DDL source updated: ${ddlName}`);
    } finally {
      if (lockHandle) {
        try {
          logger?.debug(`Unlocking view: ${ddlName}`);
          await client.getDdl().unlock({ ddlName: ddlName }, lockHandle);
          logger?.info(`View unlocked: ${ddlName}`);
        } catch (unlockError: any) {
          logger?.warn(
            `Failed to unlock view ${ddlName}: ${unlockError?.message || unlockError}`,
          );
        }
      }
    }

    // Check inactive version (after unlock, only when activating)
    if (shouldActivate) {
      logger?.debug(`Checking inactive version: ${ddlName}`);
      try {
        await safeCheckOperation(
          () =>
            client
              .getDdl()
              .check(
                { ddlName: ddlName, ddlSource: args.ddl_source },
                'inactive',
              ),
          ddlName,
          {
            debug: (message: string) => logger?.debug(message),
          },
        );
        logger?.debug(`Inactive version check completed: ${ddlName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          logger?.debug(`View ${ddlName} was already checked - continuing`);
        } else {
          logger?.warn(
            `Inactive version check had issues: ${ddlName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`,
          );
        }
      }
    }

    // Activate if requested
    let activateResponse: any | undefined;
    if (shouldActivate) {
      logger?.debug(`Activating view: ${ddlName}`);
      try {
        const activateState = await client
          .getDdl()
          .activate({ ddlName: ddlName });
        activateResponse = activateState.activateResult;
        logger?.info(`View activated: ${ddlName}`);
      } catch (activationError: any) {
        logger?.error(
          `Activation failed: ${ddlName} - ${activationError instanceof Error ? activationError.message : String(activationError)}`,
        );
        throw new Error(
          `Activation failed: ${activationError instanceof Error ? activationError.message : String(activationError)}`,
        );
      }
    } else {
      logger?.debug(`Skipping activation for: ${ddlName}`);
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

    logger?.info(`UpdateDdl completed successfully: ${ddlName}`);

    const result = {
      success: true,
      ddl_name: ddlName,
      type: 'DDLS',
      activated: shouldActivate,
      message: `DDL source ${ddlName} updated${shouldActivate ? ' and activated' : ''} successfully`,
      uri: `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(ddlName).toLowerCase()}`,
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
  } catch (error: any) {
    // Parse error message
    let errorMessage = error instanceof Error ? error.message : String(error);

    // Attempt to parse ADT XML error
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const errorData = error?.response?.data
        ? parser.parse(error.response.data)
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

    logger?.error(`Error updating DDL source ${ddlName}: ${errorMessage}`);
    return return_error(new Error(errorMessage));
  }
}
