import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
/**
 * UnlockObject Handler - Unlock ABAP object after modification via ADT API
 *
 * A dispatcher: one branch runs per call, over the same family clients every
 * low-level UnlockX handler in this migration uses.
 *
 * `unlock()` takes `analyseException` too (adt-clients 23), and its success
 * value is SAP's reply, read by nothing. There is no `AdtReading` to read a status off (unlock does not
 * go through the result-set strategies at all), so the synthetic 200 below is
 * a stand-in for "the call answered ok" rather than a status read off the
 * wire — `answer()` only reaches this projection once `ok` is already `true`.
 */

import {
  behaviorDefinitionDocuments,
  classDocuments,
  dataElementDocuments,
  ddlDocuments,
  domainDocuments,
  functionGroupDocuments,
  functionModuleDocuments,
  includeDocuments,
  interfaceDocuments,
  metadataExtensionDocuments,
  packageDocuments,
  programDocuments,
  serviceDefinitionDocuments,
  serviceDocuments,
  structureDocuments,
  tableDocuments,
  tableTypeDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { UNLOCK_KINDS, type UnlockKind } from '../../../lib/adtProjections';
import { acceptedOf } from '../../../lib/adtTypeCode';
import { answer } from '../../../lib/answer';
import {
  createAdtClient,
  createOnPremAdtClient,
  variantOf,
} from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  connectionHoldingPackageLock,
  releasePackageLockSession,
} from '../../../lib/packageSessions';
import { inCheckedGroupOn } from '../../../lib/strategies/functionModuleGroup';
import { terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Unlock an ABAP object after modification, with the lock_handle the LockObject operation answered (the lock stays in the instance’s own session until then).',
  inputSchema: z.object({
    object_name: z
      .string()
      .describe('Object name. For function modules, use format GROUP|FM_NAME'),
    object_type: z
      .enum([
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
      ])
      .describe('Object type'),
    lock_handle: z.string().describe('Lock handle from LockObject operation'),
  }),
} as const;

type UnlockObjectArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The tool's boundary: `object_type` is one of the kinds the declared
 * variant serves (`UNLOCK_KINDS`), either case; past it, {@link unlockObject} takes
 * the kind typed and checks it no more.
 */
export async function handleUnlockObject(
  context: HandlerContext,
  args: UnlockObjectArgs,
) {
  if (!args.object_name || !args.object_type || !args.lock_handle) {
    return return_error(
      new Error('object_name, object_type and lock_handle are required'),
    );
  }
  const variant = variantOf(context.connection);
  const kind = acceptedOf(args.object_type, UNLOCK_KINDS[variant]);
  if (kind === undefined) {
    return return_error(
      new Error(
        `Invalid object_type. Must be one of: ${UNLOCK_KINDS[variant].join(', ')}`,
      ),
    );
  }
  return unlockObject(context, { ...args, object_type: kind });
}

/** One object of a kind checked at the tool's boundary. */
export async function unlockObject(
  context: HandlerContext,
  args: Omit<UnlockObjectArgs, 'object_type'> & { object_type: UnlockKind },
  /** Hears the unlock's failed verdict, typed, before it is answered. */
  onFailure?: (error: IAdtError) => void,
) {
  const { connection, logger } = context;
  const { object_name, object_type, lock_handle } = args;

  if (!object_name || !object_type || !lock_handle) {
    return return_error(
      new Error('object_name, object_type and lock_handle are required'),
    );
  }

  const objectType = object_type;

  // Request-shape check that stays ahead of the client call, exactly where it
  // lived before this migration: `unlock()`'s config does not itself enforce
  // it.
  // Set for a function module only, and read only for one.
  let functionGroupName = '';
  let functionModuleName = '';
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

  const objectName = object_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  const sent = () => {
    switch (objectType) {
      case 'class':
        return client
          .getClass(resultsFor(classDocuments))
          .unlock({ className: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'program':
        // A program is locked on premise only (`ADT_TYPES_ONPREM`).
        return createOnPremAdtClient(connection, logger)
          .getProgram(resultsFor(programDocuments))
          .unlock({ programName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'include':
        // An include is unlocked on premise only (`ADT_TYPES_ONPREM`).
        return createOnPremAdtClient(connection, logger)
          .getInclude(resultsFor(includeDocuments))
          .unlock({ includeName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'table_type':
        return client
          .getTableType(resultsFor(tableTypeDocuments))
          .unlock({ tableTypeName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'interface':
        return client
          .getInterface(resultsFor(interfaceDocuments))
          .unlock({ interfaceName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'function_group':
        return client
          .getFunctionGroup(resultsFor(functionGroupDocuments))
          .unlock({ functionGroupName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'function_module':
        // SAP ignores the group of the address (#2): the unlock is sent
        // after the module's metadata names the group given.
        return inCheckedGroupOn(
          client,
          functionGroupName,
          functionModuleName,
          () =>
            client
              .getFunctionModule(resultsFor(functionModuleDocuments))
              .unlock(
                {
                  functionGroupName,
                  functionModuleName,
                },
                lock_handle,
                { analyse: analyseException },
              ),
        );
      case 'table':
        return client
          .getTable(resultsFor(tableDocuments))
          .unlock({ tableName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'structure':
        return client
          .getStructure(resultsFor(structureDocuments))
          .unlock({ structureName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'ddl':
        return client
          .getDdl(resultsFor(ddlDocuments))
          .unlock({ ddlName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'domain':
        return client
          .getDomain(resultsFor(domainDocuments))
          .unlock({ domainName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'data_element':
        return client
          .getDataElement(resultsFor(dataElementDocuments))
          .unlock({ dataElementName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'package':
        // Sent on the session holding the lock, which is then released
        // whatever the unlock answered.
        return createAdtClient(
          connectionHoldingPackageLock(connection, lock_handle),
          logger,
        )
          .getPackage(resultsFor(packageDocuments))
          .unlock({ packageName: objectName }, lock_handle, {
            analyse: analyseException,
          })
          .finally(() => releasePackageLockSession(lock_handle, logger));
      case 'behavior_definition':
        return client
          .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
          .unlock({ name: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'metadata_extension':
        return client
          .getMetadataExtension(resultsFor(metadataExtensionDocuments))
          .unlock({ name: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'behavior_implementation':
        // The implementation class's own unlock, pairing the lock.
        return client
          .getBehaviorImplementation(classDocuments)
          .unlock({ className: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'service_definition':
        return client
          .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
          .unlock({ serviceDefinitionName: objectName }, lock_handle, {
            analyse: analyseException,
          });
      case 'service_binding':
        return client
          .getServiceBinding(resultsFor(serviceDocuments))
          .unlock({ bindingName: objectName }, lock_handle, {
            analyse: analyseException,
          });
    }
  };
  return answer(
    { tool: 'UnlockObjectLow', detail: 'terse' },
    async () => {
      const verdict = await sent();
      if (!verdict.ok) onFailure?.(verdict.getError());
      return verdict;
    },
    (value) => terseWrite(value, 200),
  );
}
