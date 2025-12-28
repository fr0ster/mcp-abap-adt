/**
 * CreateClass Handler - ABAP Class Creation via ADT API
 *
 * Workflow: validate -> create -> lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive) -> (activate)
 */

import type { IClassState } from '@mcp-abap-adt/adt-clients';
import { AdtClient } from '@mcp-abap-adt/adt-clients';
import { AdtObjectErrorCodes } from '@mcp-abap-adt/interfaces';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateClass',
  description:
    'Create a new ABAP class with optional activation. Manages validation, lock, check, update, unlock, and optional activation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_TEST_CLASS_001).',
      },
      description: {
        type: 'string',
        description: 'Class description (defaults to class_name).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LAB, $TMP).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
      superclass: { type: 'string', description: 'Optional superclass name.' },
      final: {
        type: 'boolean',
        description: 'Mark class as final. Default: false',
      },
      abstract: {
        type: 'boolean',
        description: 'Mark class as abstract. Default: false',
      },
      create_protected: {
        type: 'boolean',
        description: 'Protected constructor. Default: false',
      },
      source_code: {
        type: 'string',
        description:
          'Full ABAP class source code. If omitted, a minimal template is generated.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate after creation. Default: true.',
      },
    },
    required: ['class_name', 'package_name'],
  },
} as const;

interface CreateClassArgs {
  class_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  superclass?: string;
  final?: boolean;
  abstract?: boolean;
  create_protected?: boolean;
  source_code?: string;
  activate?: boolean;
}

function generateClassTemplate(className: string, description: string): string {
  return `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS: constructor.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD constructor.
    " ${description}
  ENDMETHOD.
ENDCLASS.`;
}

export async function handleCreateClass(
  context: HandlerContext,
  params: CreateClassArgs,
) {
  const args = params;
  const { connection, logger } = context;

  if (!args.class_name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: class_name and package_name'),
    );
  }

  const className = args.class_name.toUpperCase();
  logger?.info(
    `Starting class creation: ${className} (activate=${args.activate !== false})`,
  );

  try {
    const sourceCode =
      args.source_code ||
      generateClassTemplate(className, args.description || className);
    const shouldActivate = args.activate !== false; // default true
    const client = new AdtClient(connection, logger);
    const adtClass = client.getClass();

    // Use AdtClass.create() which handles the full workflow automatically:
    // validate → create → check → lock → check(inactive) → update → unlock → check → activate
    // AdtClass.create() handles cleanup (unlock) in its catch block, so we should let errors propagate
    logger?.info(`Creating class with AdtClass: ${className}`);

    let state: IClassState;
    try {
      state = await adtClass.create(
        {
          className,
          packageName: args.package_name,
          transportRequest: args.transport_request,
          description: args.description || className,
          superclass: args.superclass,
          final: args.final || false,
          abstract: args.abstract || false,
          createProtected: args.create_protected || false,
          sourceCode: sourceCode,
        },
        {
          activateOnCreate: shouldActivate,
        },
      );
    } catch (createError: any) {
      // AdtClass.create() already handles cleanup (unlock) in its catch block before throwing
      // Check if validation failed with 400 (object might already exist)
      if (
        createError.code === AdtObjectErrorCodes.VALIDATION_FAILED &&
        createError.status === 400
      ) {
        const errorText = createError.message?.toLowerCase() || '';
        const isAlreadyExists =
          errorText.includes('already exists') ||
          errorText.includes('exceptionresourcealreadyexists') ||
          errorText.includes('resourcealreadyexists');

        if (isAlreadyExists) {
          logger?.warn(
            `Class ${className} already exists - validation returned 400, checking if object exists`,
          );
          // Try to read existing class to confirm it exists
          // Note: No cleanup needed here since validation failed before object creation
          try {
            const existingState = await adtClass.read({ className }, 'active');
            if (existingState) {
              logger?.info(`Class ${className} already exists and is active`);
              return return_response({
                data: JSON.stringify(
                  {
                    success: true,
                    data: {
                      class_name: className,
                      package_name: args.package_name,
                      transport_request: args.transport_request || null,
                      activated: true,
                    },
                    class_name: className,
                    package_name: args.package_name,
                    transport_request: args.transport_request || null,
                    activated: true,
                    already_exists: true,
                    message: `Class ${className} already exists`,
                  },
                  null,
                  2,
                ),
              } as AxiosResponse);
            }
          } catch (_readError: any) {
            // Class doesn't exist or can't be read - validation error might be something else
            logger?.warn(
              `Class ${className} validation failed with 400 but object doesn't exist - treating as validation error`,
            );
            // Continue to throw original createError below
          }
        }
      }

      // Re-throw error - AdtClass.create() already handled cleanup (unlock) before throwing
      // Log error with code if available (from AdtClass error handling)
      if (createError.code) {
        logger?.error(
          `Class creation failed with code ${createError.code}: ${className} - ${createError.message || String(createError)}`,
        );
      } else {
        logger?.error(
          `Class creation failed: ${className} - ${createError.message || String(createError)}`,
        );
      }

      const errorMessage =
        createError instanceof Error
          ? createError.message
          : String(createError);
      return return_error(new Error(errorMessage));
    }

    const errorCount = state.errors?.length || 0;
    const errors =
      state.errors?.map((err) => ({
        method: err.method,
        error: err.error.message || String(err.error),
        timestamp: err.timestamp?.toISOString() || new Date().toISOString(),
      })) || [];

    if (errorCount > 0) {
      logger?.warn(
        `CreateClass completed with ${errorCount} error(s): ${className}`,
      );
      errors.forEach((err) => {
        logger?.warn(`  - [${err.method}]: ${err.error}`);
      });
    } else {
      logger?.info(`CreateClass completed successfully: ${className}`);
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          data: {
            class_name: className,
            package_name: args.package_name,
            transport_request: args.transport_request || null,
            activated: shouldActivate,
            errors: errors,
          },
          class_name: className,
          package_name: args.package_name,
          transport_request: args.transport_request || null,
          activated: shouldActivate,
          errors: errors,
          message: `Class ${className} created${shouldActivate ? ' and activated' : ''} successfully${errorCount > 0 ? ` (with ${errorCount} error(s))` : ''}`,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    // Generic outer catch for unexpected errors (e.g., connection issues)
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger?.error(
      `Unexpected error in CreateClass handler: ${className} - ${errorMessage}`,
    );
    return return_error(new Error(errorMessage));
  }
}
