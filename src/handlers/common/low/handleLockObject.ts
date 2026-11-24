import * as z from 'zod';
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
import { LOCK_KINDS, type LockKind } from '../../../lib/adtProjections';
import { acceptedOf } from '../../../lib/adtTypeCode';
import { answer } from '../../../lib/answer';
import {
  createAdtClient,
  createOnPremAdtClient,
  variantOf,
} from '../../../lib/clients';
import {
  purpose,
  resultReturns,
  resultShape,
  toolDescription,
} from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { connectionForPackageLock } from '../../../lib/packageSessions';
import { inCheckedGroupOn } from '../../../lib/strategies/functionModuleGroup';
import {
  analyseLock,
  analysePublicationLockAnswer,
} from '../../../lib/strategies/lockAnswer';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { lockSubResource } from './subResourceLocks';

/** What a lock answers: the handle the update and the unlock take. */
export interface LockAnswer {
  readonly lock_handle: string;
}

/** What a lock answers, by its noun. */
const LOCKED = resultShape<LockAnswer>({
  lock_handle: 'the lock handle the update and the unlock take',
});

export const TOOL_DEFINITION = {
  name: 'LockObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'low-level',
    purpose: purpose(
      "Locks an ABAP object for modification in this instance's session, until it is unlocked or the instance ends.",
    ),
    returns: resultReturns(LOCKED),
  }),
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
    super_package: z
      .string()
      .optional()
      .describe(
        "Accepted for compatibility; the lock uses the package's name.",
      ),
  }),
} as const;

type LockObjectArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
/**
 * The lock request for `args`, as its object's API sends it, answering the
 * lock handle typed — or the words refusing the arguments before anything is
 * sent. `lockObject` answers it; compact `HandlerLock` answers it with the
 * instance's `state_handle`.
 */
export function lockRequest(
  context: HandlerContext,
  args: Omit<LockObjectArgs, 'object_type'> & { object_type: LockKind },
) {
  const { connection, logger } = context;
  const { object_name, object_type } = args;

  if (!object_name || !object_type) {
    return { refused: 'object_name and object_type are required' } as const;
  }

  const objectType = object_type;

  // A request-shape check that stays ahead of the client call: `lock()`'s
  // config does not itself enforce it.
  // Set for a function module only, and read only for one.
  let functionGroupName = '';
  let functionModuleName = '';
  if (objectType === 'function_module') {
    if (!object_name.toUpperCase().includes('|')) {
      return {
        refused: 'Function module name must be in format GROUP|FM_NAME',
      } as const;
    }
    [functionGroupName, functionModuleName] = object_name
      .toUpperCase()
      .split('|');
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
        // A package is locked by its name alone: SAP's lock reads no super
        // package, and a top-level package has none.
        .lock({ packageName: objectName }, { analyse: analyseLock });
      if (locked.ok) lockOn.keep(locked.getResult().value);
      else await lockOn.drop();
      return locked;
    } catch (error) {
      await lockOn.drop();
      throw error;
    }
  };

  return {
    call: () => {
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
        case 'include':
          // An include is locked on premise only (`ADT_TYPES_ONPREM`).
          return createOnPremAdtClient(connection, logger)
            .getInclude(resultsFor(includeDocuments))
            .lock({ includeName: objectName }, { analyse: analyseLock });
        case 'table_type':
          return client
            .getTableType(resultsFor(tableTypeDocuments))
            .lock({ tableTypeName: objectName }, { analyse: analyseLock });
        case 'interface':
          return client
            .getInterface(resultsFor(interfaceDocuments))
            .lock({ interfaceName: objectName }, { analyse: analyseLock });
        case 'function_group':
          return client
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .lock({ functionGroupName: objectName }, { analyse: analyseLock });
        case 'function_module':
          // SAP ignores the group of the address (#2): the lock is taken
          // after the module's metadata names the group given.
          return inCheckedGroupOn(
            client,
            functionGroupName,
            functionModuleName,
            () =>
              client
                .getFunctionModule(resultsFor(functionModuleDocuments))
                .lock(
                  {
                    functionGroupName,
                    functionModuleName,
                  },
                  { analyse: analyseLock },
                ),
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
        case 'table_settings':
        case 'program_text_elements':
        case 'function_group_text_elements':
        case 'class_text_elements':
          return lockSubResource(context, objectType, objectName);
      }
    },
  } as const;
}

/**
 * A lock answered by `tool`: the lock request, `locked` told the handle SAP
 * answered once the lock is taken, and the answer `shown` of that handle,
 * typed — never a parse of an answer already written.
 */
export async function lockObjectAnswering<A>(
  context: HandlerContext,
  args: Omit<LockObjectArgs, 'object_type'> & { object_type: LockKind },
  tool: string,
  shown: (lockHandle: string) => A,
  locked: (lockHandle: string) => void = () => undefined,
) {
  const request = lockRequest(context, args);
  if ('refused' in request) return return_error(new Error(request.refused));
  return answer(
    { tool, detail: 'terse' },
    async () => {
      const response = await request.call();
      if (response.ok) locked(response.getResult().value);
      return response;
    },
    shown,
  );
}

export async function lockObject(
  context: HandlerContext,
  args: Omit<LockObjectArgs, 'object_type'> & { object_type: LockKind },
) {
  // What the update and the unlock need, and nothing sent back: the name and
  // the type are the caller's own, and the prose said what a handle is for.
  return lockObjectAnswering(
    context,
    args,
    'LockObjectLow',
    (lockHandle): LockAnswer => ({ lock_handle: lockHandle }),
  );
}
