/**
 * LockObject Handler - Lock ABAP object for modification via ADT API
 *
 * A dispatcher: one branch runs per call, over the same family clients every
 * low-level LockX handler in this migration uses.
 *
 * `lock()` takes `analyseLock` in every branch below, as every single-family
 * LockXLow handler does: a 2xx naming no handle is a refusal, with SAP's
 * answer beside it (`lib/strategies/lockAnswer.ts`). Its answer is the lock handle itself, and the projection
 * is the envelope the tool already returned: nothing about `lock` varies with
 * `detail`, so the parameter is not added to this tool's surface.
 */

import {
  behaviorDefinitionDocuments,
  classDocuments,
  dataElementDocuments,
  ddlDocuments,
  domainDocuments,
  functionGroupDocuments,
  functionModuleDocuments,
  interfaceDocuments,
  metadataExtensionDocuments,
  packageDocuments,
  programDocuments,
  serviceDefinitionDocuments,
  serviceDocuments,
  structureDocuments,
  tableDocuments,
} from '@mcp-abap-adt/adt-clients';
import { LOCK_KINDS, type LockKind } from '../../../lib/adtProjections';
import { acceptedOf } from '../../../lib/adtTypeCode';
import { answer } from '../../../lib/answer';
import {
  createAdtClient,
  createOnPremAdtClient,
  variantOf,
} from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { connectionForPackageLock } from '../../../lib/packageSessions';
import {
  analyseLock,
  analysePublicationLockAnswer,
} from '../../../lib/strategies/lockAnswer';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'LockObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock an ABAP object for modification. Returns the lock handle the update and the unlock take; the lock stays in the instance’s session until the unlock or the instance’s end.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description:
          'Object name. For function modules, use format GROUP|FM_NAME',
      },
      object_type: {
        type: 'string',
        description: 'Object type',
        enum: [
          'class',
          'program',
          'interface',
          'function_group',
          'function_module',
          'table',
          'structure',
          'ddl',
          'domain',
          'data_element',
          'package',
          'behavior_definition',
          'behavior_implementation',
          'metadata_extension',
          'service_definition',
          'service_binding',
        ],
      },
      super_package: {
        type: 'string',
        description: 'Super package (required for package locking)',
      },
    },
    required: ['object_name', 'object_type'],
  },
} as const;

interface LockObjectArgs {
  object_name: string;
  object_type: string;
  super_package?: string;
}

/**
 * The tool's boundary: `object_type` is one of the kinds the declared
 * variant serves (`LOCK_KINDS`), either case; past it, {@link lockObject} takes
 * the kind typed and checks it no more.
 */
export async function handleLockObject(
  context: HandlerContext,
  args: LockObjectArgs,
) {
  if (!args.object_name || !args.object_type) {
    return return_error(new Error('object_name and object_type are required'));
  }
  const variant = variantOf(context.connection);
  const kind = acceptedOf(args.object_type, LOCK_KINDS[variant]);
  if (kind === undefined) {
    return return_error(
      new Error(
        `Invalid object_type. Must be one of: ${LOCK_KINDS[variant].join(', ')}`,
      ),
    );
  }
  return lockObject(context, { ...args, object_type: kind });
}

/** One object of a kind checked at the tool's boundary. */
export async function lockObject(
  context: HandlerContext,
  args: Omit<LockObjectArgs, 'object_type'> & { object_type: LockKind },
) {
  const { connection, logger } = context;
  const { object_name, object_type, super_package } = args;

  if (!object_name || !object_type) {
    return return_error(new Error('object_name and object_type are required'));
  }

  const objectType = object_type;

  // Two request-shape checks that stay ahead of the client call, exactly
  // where they lived before this migration: `lock()`'s config does not
  // itself enforce either.
  let functionGroupName: string | undefined;
  let functionModuleName: string | undefined;
  if (objectType === 'function_module') {
    if (!object_name.toUpperCase().includes('|')) {
      return return_error(
        new Error('Function module name must be in format GROUP|FM_NAME'),
      );
    }
    [functionGroupName, functionModuleName] = object_name
      .toUpperCase()
      .split('|');
  }
  if (objectType === 'package' && !super_package) {
    return return_error(
      new Error('super_package is required for package locking.'),
    );
  }

  const objectName = object_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  // A package lock is held in a session of its own over RFC (a package can be
  // saved only once per ABAP session), kept under its handle until the
  // unlock; over HTTP the caller's connection serves.
  const lockPackage = async () => {
    const lockOn = await connectionForPackageLock(connection, logger);
    try {
      const locked = await createAdtClient(lockOn.connection, logger)
        .getPackage(resultsFor(packageDocuments))
        .lock(
          {
            packageName: objectName,
            superPackage: (super_package as string).toUpperCase(),
          },
          { analyse: analyseLock },
        );
      if (locked.ok) lockOn.keep(locked.getResult().value);
      else await lockOn.drop();
      return locked;
    } catch (error) {
      await lockOn.drop();
      throw error;
    }
  };

  return answer(
    { tool: 'LockObjectLow', detail: 'terse' },
    () => {
      switch (objectType) {
        case 'class':
          return client
            .getClass(resultsFor(classDocuments))
            .lock({ className: objectName }, { analyse: analyseLock });
        case 'program':
          // A program is locked on premise only (`ADT_TYPES_ONPREM`).
          return createOnPremAdtClient(connection, logger)
            .getProgram(resultsFor(programDocuments))
            .lock({ programName: objectName }, { analyse: analyseLock });
        case 'interface':
          return client
            .getInterface(resultsFor(interfaceDocuments))
            .lock({ interfaceName: objectName }, { analyse: analyseLock });
        case 'function_group':
          return client
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .lock({ functionGroupName: objectName }, { analyse: analyseLock });
        case 'function_module':
          return client
            .getFunctionModule(resultsFor(functionModuleDocuments))
            .lock(
              {
                functionGroupName: functionGroupName as string,
                functionModuleName: functionModuleName as string,
              },
              { analyse: analyseLock },
            );
        case 'table':
          return client
            .getTable(resultsFor(tableDocuments))
            .lock({ tableName: objectName }, { analyse: analyseLock });
        case 'structure':
          return client
            .getStructure(resultsFor(structureDocuments))
            .lock({ structureName: objectName }, { analyse: analyseLock });
        case 'ddl':
          return client
            .getDdl(resultsFor(ddlDocuments))
            .lock({ ddlName: objectName }, { analyse: analyseLock });
        case 'domain':
          return client
            .getDomain(resultsFor(domainDocuments))
            .lock({ domainName: objectName }, { analyse: analyseLock });
        case 'data_element':
          return client
            .getDataElement(resultsFor(dataElementDocuments))
            .lock({ dataElementName: objectName }, { analyse: analyseLock });
        case 'behavior_definition':
          return client
            .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
            .lock({ name: objectName }, { analyse: analyseLock });
        case 'metadata_extension':
          return client
            .getMetadataExtension(resultsFor(metadataExtensionDocuments))
            .lock({ name: objectName }, { analyse: analyseLock });
        case 'behavior_implementation':
          // The implementation class's own lock, as the low tool sent it.
          return client
            .getBehaviorImplementation(classDocuments)
            .lock({ className: objectName }, { analyse: analyseLock });
        case 'service_definition':
          return client
            .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
            .lock(
              { serviceDefinitionName: objectName },
              { analyse: analyseLock },
            );
        case 'service_binding':
          // The binding's own LOCK, read as the publication reads it: a `403`
          // (the binding open in an editing session) is a lock without a
          // handle, and the publication runs without one.
          return client
            .getServiceBinding(resultsFor(serviceDocuments))
            .lock(
              { bindingName: objectName },
              { analyse: analysePublicationLockAnswer },
            );
        case 'package':
          return lockPackage();
      }
    },
    (lockHandle: string) => ({
      success: true,
      object_name: objectName,
      object_type: objectType,
      lock_handle: lockHandle,
      message: `Object ${objectName} locked successfully. Use this lock_handle for the update and the unlock.`,
    }),
  );
}
