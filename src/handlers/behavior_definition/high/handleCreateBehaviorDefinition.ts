/**
 * CreateBehaviorDefinition Handler - ABAP Behavior Definition Creation via ADT API
 */

import { return_error, return_response, logger as baseLogger, getManagedConnection } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorDefinitionBuilderConfig, BehaviorDefinitionImplementationType } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
    name: "CreateBehaviorDefinition",
    description: "Create a new ABAP Behavior Definition (BDEF) in SAP system.",
    inputSchema: {
        type: "object",
        properties: {
            name: {
                type: "string",
                description: "Behavior Definition name (usually same as Root Entity name)"
            },
            description: {
                type: "string",
                description: "Description"
            },
            package_name: {
                type: "string",
                description: "Package name"
            },
            transport_request: {
                type: "string",
                description: "Transport request number"
            },
            root_entity: {
                type: "string",
                description: "Root Entity name (CDS View name)"
            },
            implementation_type: {
                type: "string",
                description: "Implementation type: 'Managed', 'Unmanaged', 'Abstract', 'Projection'",
                enum: ["Managed", "Unmanaged", "Abstract", "Projection"]
            },
            activate: {
                type: "boolean",
                description: "Activate after creation. Default: true"
            }
        },
        required: ["name", "package_name", "root_entity", "implementation_type"]
    }
} as const;

interface CreateBehaviorDefinitionArgs {
    name: string;
    description?: string;
    package_name: string;
    transport_request?: string;
    root_entity: string;
    implementation_type: BehaviorDefinitionImplementationType;
    activate?: boolean;
}

export async function handleCreateBehaviorDefinition(params: any) {
    const args: CreateBehaviorDefinitionArgs = params;

    if (!args.name || !args.package_name || !args.root_entity || !args.implementation_type) {
        return return_error(new Error("Missing required parameters"));
    }

   try {
       validateTransportRequest(args.package_name, args.transport_request);
   } catch (error) {
       return return_error(error as Error);
   }

   const name = args.name.toUpperCase();
   const connection = getManagedConnection();
   const handlerLogger = getHandlerLogger(
     'handleCreateBehaviorDefinition',
     process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
   );

   handlerLogger.info(`Starting BDEF creation: ${name}`);

    try {
        const client = new CrudClient(connection);
        const shouldActivate = args.activate !== false;

        // Create - using types from adt-clients
        const createConfig: Pick<BehaviorDefinitionBuilderConfig, 'name' | 'description' | 'packageName' | 'transportRequest' | 'rootEntity' | 'implementationType'> = {
            name,
            description: args.description || name,
            packageName: args.package_name,
            transportRequest: args.transport_request || '',
            rootEntity: args.root_entity,
            implementationType: args.implementation_type
        };
        await client.createBehaviorDefinition(createConfig);

        // Lock - using types from adt-clients
        const lockConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = { name };
        await client.lockBehaviorDefinition(lockConfig);
        const lockHandle = client.getLockHandle();

        try {
          // Check (optional, but good practice) - using types from adt-clients
          const checkConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = { name };
          await client.checkBehaviorDefinition(checkConfig);

          // Unlock - using types from adt-clients
          const unlockConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = { name };
          await client.unlockBehaviorDefinition(unlockConfig, lockHandle);

          // Activate if requested - using types from adt-clients
          if (shouldActivate) {
              const activateConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = { name };
              await client.activateBehaviorDefinition(activateConfig);
          }
        } catch (error) {
          // Unlock on error (principle 1: if lock was done, unlock is mandatory)
          try {
            const unlockConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = { name };
            await client.unlockBehaviorDefinition(unlockConfig, lockHandle);
          } catch (unlockError) {
            handlerLogger.error(`Failed to unlock behavior definition after error: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
          }
          // Principle 2: first error and exit
          throw error;
        }

        const result = {
            success: true,
            name: name,
            package_name: args.package_name,
            type: 'BDEF',
            message: shouldActivate
                ? `Behavior Definition ${name} created and activated successfully`
                : `Behavior Definition ${name} created successfully`
        };
        handlerLogger.info(`✅ CreateBehaviorDefinition completed successfully: ${name}`);

        return return_response({
            data: JSON.stringify(result, null, 2),
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {} as any
        });

    } catch (error: any) {
        handlerLogger.error(`Error creating BDEF ${name}: ${error?.message || error}`);
        return return_error(error);
    }
}
