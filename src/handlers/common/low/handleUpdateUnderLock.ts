import type {
  IAdtError,
  IAdtHeaders,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IServerAdtClient } from '../../../lib/adtClientContract';
import type { AdtReading } from '../../../lib/strategies/reading';
/**
 * The compact update: one write under the lock the caller holds (spec §4.6).
 *
 * The caller locked the object itself (`HandlerLock`) and passes the handle;
 * this sends the one write of its type under that handle — the `PUT` of the
 * source, the metadata document or the class include, or for a service binding
 * its one publication request — and answers SAP's result. Locking, unlocking,
 * checking and activating are the consumer's own calls.
 *
 * PACKAGE, DOMAIN, DATA_ELEMENT, FUNCTION_GROUP and TABLE_TYPE write their
 * metadata document, and INCLUDE does with `part: 'metadata'`: `source_code`
 * is that whole document and is sent as given — a replace, so the caller
 * reads it (`HandlerGet` part `metadata`), changes it and passes all of it
 * back. `part` is taken by INCLUDE alone; any other type given one is
 * refused before anything is sent.
 *
 * Arguments arrive in the compact update's names and are translated here.
 */

import {
  classDocuments,
  dataElementDocuments,
  domainDocuments,
  functionGroupDocuments,
  includeDocuments,
  packageDocuments,
  serviceDefinitionDocuments,
  serviceDocuments,
  tableTypeDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  analysePublication,
} from '@mcp-abap-adt/adt-strategies';
import {
  SERVICE_BINDING_VARIANT_MAP,
  type ServiceBindingVariant,
} from '@mcp-abap-adt/interfaces-adt';
import type * as z from 'zod';
import {
  type AdtObjectWith,
  adtOperation,
} from '../../../lib/adtHeaders/defaultPairs';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient, createOnPremAdtClient } from '../../../lib/clients';
import type { compactUpdateSchema } from '../../../lib/compact/compactSchemas';
import {
  defineTool,
  type HandlerContext,
  type ToolArgs,
} from '../../../lib/handlers/interfaces';
import { connectionHoldingPackageLock } from '../../../lib/packageSessions';
import { lockHeldHere, lockNotHeldWords } from '../../../lib/state/heldLocks';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import type { ToolResultLike } from '../../../lib/toolResult';
import { return_error } from '../../../lib/utils';
import {
  handleUpdateBehaviorDefinition,
  TOOL_DEFINITION as UpdateBehaviorDefinition_Tool,
} from '../../behavior_definition/low/handleUpdateBehaviorDefinition';
import {
  handleUpdateClass,
  TOOL_DEFINITION as UpdateClass_Tool,
} from '../../class/low/handleUpdateClass';
import {
  handleUpdateDdl,
  TOOL_DEFINITION as UpdateDdl_Tool,
} from '../../ddl/low/handleUpdateDdl';
import {
  handleUpdateMetadataExtension,
  TOOL_DEFINITION as UpdateMetadataExtension_Tool,
} from '../../ddlx/low/handleUpdateMetadataExtension';
import {
  handleUpdateFunctionModule,
  TOOL_DEFINITION as UpdateFunctionModule_Tool,
} from '../../function/low/handleUpdateFunctionModule';
import {
  handleUpdateInterface,
  TOOL_DEFINITION as UpdateInterface_Tool,
} from '../../interface/low/handleUpdateInterface';
import {
  handleUpdateProgram,
  TOOL_DEFINITION as UpdateProgram_Tool,
} from '../../program/low/handleUpdateProgram';
import {
  handleUpdateStructure,
  TOOL_DEFINITION as UpdateStructure_Tool,
} from '../../structure/low/handleUpdateStructure';
import {
  handleUpdateTable,
  TOOL_DEFINITION as UpdateTable_Tool,
} from '../../table/low/handleUpdateTable';

/** The object types the compact update writes, each one request under `lock_handle`. */
export const UNDER_LOCK_TYPES = [
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'FUNCTION_GROUP',
  'TABLE_TYPE',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'SERVICE_DEFINITION',
  'SERVICE_BINDING',
  'CLASS',
  'LOCAL_TEST_CLASS',
  'LOCAL_TYPES',
  'LOCAL_DEFINITIONS',
  'LOCAL_MACROS',
  'UNIT_TEST',
  'CDS_UNIT_TEST',
  'PROGRAM',
  'INCLUDE',
  'INTERFACE',
  'FUNCTION_MODULE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
] as const;

/** The types `part` is taken by: the include, its source or its metadata. */
export const PART_TYPES = ['INCLUDE'] as const;

/** The parts of an include `HandlerUpdate` writes. */
const INCLUDE_PARTS = ['source', 'metadata'] as const;

/**
 * The refusal of a `part` given where it is not taken, or of a part the
 * include has not; `undefined` when the call's part is one it takes.
 */
function partRefusal(args: Args): Error | undefined {
  if (args.part === undefined) return undefined;
  const type = String(args.object_type);
  if (!PART_TYPES.some((taker) => taker === type)) {
    return new Error(
      `part is taken only by ${PART_TYPES.join(', ')} (${INCLUDE_PARTS.join(' or ')}); leave it out for ${type}`,
    );
  }
  if (!INCLUDE_PARTS.some((part) => part === args.part)) {
    return new Error(
      `part is ${INCLUDE_PARTS.join(' or ')} for ${type}, not ${String(args.part)}`,
    );
  }
  return undefined;
}

/** HandlerUpdate's arguments, as its schema parses them. */
type Args = z.output<typeof compactUpdateSchema>;

/**
 * The writes a type delegates to: each the target tool's entry, so the
 * arguments are parsed with the target's own schema.
 */
const update = {
  BEHAVIOR_DEFINITION: defineTool(
    UpdateBehaviorDefinition_Tool,
    handleUpdateBehaviorDefinition,
  ).call,
  CLASS: defineTool(UpdateClass_Tool, handleUpdateClass).call,
  DDL: defineTool(UpdateDdl_Tool, handleUpdateDdl).call,
  METADATA_EXTENSION: defineTool(
    UpdateMetadataExtension_Tool,
    handleUpdateMetadataExtension,
  ).call,
  FUNCTION_MODULE: defineTool(
    UpdateFunctionModule_Tool,
    handleUpdateFunctionModule,
  ).call,
  INTERFACE: defineTool(UpdateInterface_Tool, handleUpdateInterface).call,
  PROGRAM: defineTool(UpdateProgram_Tool, handleUpdateProgram).call,
  STRUCTURE: defineTool(UpdateStructure_Tool, handleUpdateStructure).call,
  TABLE: defineTool(UpdateTable_Tool, handleUpdateTable).call,
} as const;

/** `source_code` and the source fields some types name otherwise. */
const source = (args: Args, field: TextField): string | undefined =>
  args[field] ?? args.source_code;

const text = (value: string | undefined): string | undefined =>
  value !== undefined && value !== '' ? value : undefined;

/** `value` when it is a non-empty string; else the error naming `field`. */
const requiredText = (
  field: string,
  value: string | undefined,
): string | Error => text(value) ?? new Error(`${field} is required`);

const upper = (value: string | undefined): string =>
  (value ?? '').toUpperCase();

const ANSWER = { tool: 'HandlerUpdate', detail: 'terse' } as const;

/** The one write's answer, as every compact write answers it. */
const written = (
  call: () => Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>,
) => answer(ANSWER, call, project('terse', terseWrite));

type AdtClient = IServerAdtClient;
export type IncludeWriter = {
  update(
    config: object,
    options: { headers: IAdtHeaders } & Record<string, unknown>,
  ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
};

/**
 * The class includes: the source argument each takes (beside `source_code`),
 * the object type of its `update`, and the accessor that writes it, under
 * the class's lock.
 */
/** The arguments of HandlerUpdate whose value is text. */
type TextField = {
  [K in keyof Args]-?: Args[K] extends string | undefined ? K : never;
}[keyof Args];

export const CLASS_INCLUDES: Record<
  string,
  [TextField, AdtObjectWith<'update'>, (client: AdtClient) => IncludeWriter]
> = {
  LOCAL_TEST_CLASS: [
    'test_class_code',
    'localTestClass',
    (c) => c.getLocalTestClass(resultsFor(classDocuments)),
  ],
  LOCAL_TYPES: [
    'local_types_code',
    'localTypes',
    (c) => c.getLocalTypes(resultsFor(classDocuments)),
  ],
  LOCAL_DEFINITIONS: [
    'definitions_code',
    'localDefinitions',
    (c) => c.getLocalDefinitions(resultsFor(classDocuments)),
  ],
  LOCAL_MACROS: [
    'macros_code',
    'localMacros',
    (c) => c.getLocalMacros(resultsFor(classDocuments)),
  ],
  UNIT_TEST: [
    'test_class_source',
    'localTestClass',
    (c) => c.getLocalTestClass(resultsFor(classDocuments)),
  ],
  CDS_UNIT_TEST: [
    'test_class_source',
    'localTestClass',
    (c) => c.getLocalTestClass(resultsFor(classDocuments)),
  ],
  BEHAVIOR_IMPLEMENTATION: [
    'implementation_code',
    'behaviorImplementation',
    (c) => c.getBehaviorImplementation(resultsFor(classDocuments)),
  ],
};

export async function handleUpdateUnderLock(
  context: HandlerContext,
  args: Args,
): Promise<ToolResultLike> {
  const partRefused = partRefusal(args);
  if (partRefused) return return_error(partRefused);
  // A service binding's lock may answer no handle (the binding open in an
  // editing session): its publication runs under the empty one.
  const emptyBindingHandle =
    args.object_type === 'SERVICE_BINDING' && args.lock_handle === '';
  const lockHandle = emptyBindingHandle ? '' : text(args.lock_handle);
  if (lockHandle === undefined) {
    return return_error(
      new Error(
        'lock_handle is required: lock the object with HandlerLock first and pass the handle it answered.',
      ),
    );
  }
  if (!emptyBindingHandle && !lockHeldHere(context.heldLocks, lockHandle)) {
    return return_error(new Error(lockNotHeldWords(context.heldLocks)));
  }
  const { connection, logger } = context;
  const transportRequest = text(args.transport_request);
  const common = {
    lock_handle: lockHandle,
    transport_request: args.transport_request,
  } as const;
  const client = () => createAdtClient(connection, logger);
  const required = (
    field: string,
    value: string | undefined,
  ): Error | undefined =>
    text(value) === undefined ? new Error(`${field} is required`) : undefined;
  const transport = transportRequest ? { transportRequest } : {};

  switch (args.object_type) {
    case 'PACKAGE': {
      const missing = required('package_name', args.package_name);
      const sourceCode = requiredText('source_code', args.source_code);
      if (missing) return return_error(missing);
      if (typeof sourceCode !== 'string') return return_error(sourceCode);
      // The package lock lives in a session of its own over RFC; the write
      // runs in that session, where the handle is valid.
      return written(() =>
        withAdtHeaders(context, 'package.updateMetadata', (headers) =>
          createAdtClient(
            connectionHoldingPackageLock(connection, lockHandle),
            logger,
          )
            .getPackage(resultsFor(packageDocuments))
            .updateMetadata(
              { packageName: upper(args.package_name), ...transport },
              {
                headers,
                source: sourceCode,
                lockHandle,
                analyse: analyseException,
              },
            ),
        ),
      );
    }
    case 'DOMAIN': {
      const missing = required('domain_name', args.domain_name);
      const sourceCode = requiredText('source_code', args.source_code);
      if (missing) return return_error(missing);
      if (typeof sourceCode !== 'string') return return_error(sourceCode);
      return written(() =>
        withAdtHeaders(context, 'domain.updateMetadata', (headers) =>
          client()
            .getDomain(resultsFor(domainDocuments))
            .updateMetadata(
              { domainName: upper(args.domain_name), ...transport },
              {
                headers,
                source: sourceCode,
                lockHandle,
                analyse: analyseException,
              },
            ),
        ),
      );
    }
    case 'DATA_ELEMENT': {
      const missing = required('data_element_name', args.data_element_name);
      const sourceCode = requiredText('source_code', args.source_code);
      if (missing) return return_error(missing);
      if (typeof sourceCode !== 'string') return return_error(sourceCode);
      return written(() =>
        withAdtHeaders(context, 'dataElement.updateMetadata', (headers) =>
          client()
            .getDataElement(resultsFor(dataElementDocuments))
            .updateMetadata(
              {
                dataElementName: upper(args.data_element_name),
                ...transport,
              },
              {
                headers,
                source: sourceCode,
                lockHandle,
                analyse: analyseException,
              },
            ),
        ),
      );
    }
    case 'FUNCTION_GROUP': {
      const missing = required('function_group_name', args.function_group_name);
      const sourceCode = requiredText('source_code', args.source_code);
      if (missing) return return_error(missing);
      if (typeof sourceCode !== 'string') return return_error(sourceCode);
      return written(() =>
        withAdtHeaders(context, 'functionGroup.updateMetadata', (headers) =>
          client()
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .updateMetadata(
              {
                functionGroupName: upper(args.function_group_name),
                ...transport,
              },
              {
                headers,
                source: sourceCode,
                lockHandle,
                analyse: analyseException,
              },
            ),
        ),
      );
    }
    case 'TABLE_TYPE': {
      const name = text(args.table_type_name);
      const document = text(args.source_code);
      if (name === undefined) {
        return return_error(new Error('table_type_name is required'));
      }
      if (document === undefined) {
        return return_error(new Error('source_code is required'));
      }
      return answer(
        ANSWER,
        () =>
          withAdtHeaders(context, 'tableType.updateMetadata', (headers) =>
            client()
              .getTableType(resultsFor(tableTypeDocuments))
              .updateMetadata(
                { tableTypeName: name.toUpperCase(), ...transport },
                {
                  headers,
                  source: document,
                  lockHandle,
                  analyse: analyseException,
                },
              ),
          ),
        project('terse', terseWrite),
      );
    }
    case 'INCLUDE': {
      const name = text(args.include_name);
      const body = text(args.source_code);
      if (name === undefined) {
        return return_error(new Error('include_name is required'));
      }
      if (body === undefined) {
        return return_error(new Error('source_code is required'));
      }
      // An include is written on premise only (`ADT_TYPES_ONPREM`).
      const include = () =>
        createOnPremAdtClient(connection, logger).getInclude(
          resultsFor(includeDocuments),
        );
      const config = { includeName: name.toUpperCase(), ...transport };
      return answer(
        ANSWER,
        () =>
          args.part === 'metadata'
            ? withAdtHeaders(context, 'include.updateMetadata', (headers) =>
                include().updateMetadata(config, {
                  headers,
                  source: body,
                  lockHandle,
                  analyse: analyseException,
                }),
              )
            : withAdtHeaders(context, 'include.update', (headers) =>
                include().update(config, {
                  headers,
                  source: body,
                  lockHandle,
                  analyse: analyseException,
                }),
              ),
        project('terse', terseWrite),
      );
    }
    case 'SERVICE_DEFINITION': {
      const missing = required(
        'service_definition_name',
        args.service_definition_name,
      );
      const sourceCode = requiredText('source_code', args.source_code);
      if (missing) return return_error(missing);
      if (typeof sourceCode !== 'string') return return_error(sourceCode);
      return written(() =>
        withAdtHeaders(context, 'serviceDefinition.update', (headers) =>
          client()
            .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
            .update(
              {
                serviceDefinitionName: upper(args.service_definition_name),
                ...transport,
              },
              {
                headers,
                source: sourceCode,
                lockHandle,
                analyse: analyseException,
              },
            ),
        ),
      );
    }
    case 'SERVICE_BINDING': {
      const missing =
        required('service_binding_name', args.service_binding_name) ??
        required('desired_publication_state', args.desired_publication_state) ??
        required('binding_variant', args.binding_variant);
      if (missing) return return_error(missing);
      const state = args.desired_publication_state;
      if (state !== 'published' && state !== 'unpublished') {
        return return_error(
          new Error('desired_publication_state is published or unpublished'),
        );
      }
      const variants: Readonly<
        Record<string, { serviceType: 'odatav2' | 'odatav4' } | undefined>
      > = SERVICE_BINDING_VARIANT_MAP;
      const variant = variants[String(args.binding_variant)];
      if (variant === undefined) {
        return return_error(
          new Error(
            `binding_variant is one of ${Object.keys(SERVICE_BINDING_VARIANT_MAP).join(', ')}`,
          ),
        );
      }
      const { serviceType } = variant;
      if (serviceType === 'odatav2') {
        const noName = required('service_name', args.service_name);
        if (noName) return return_error(noName);
      }
      const bindingName = String(args.service_binding_name)
        .trim()
        .toUpperCase();
      return written(() =>
        withAdtHeaders(context, 'serviceBinding.update', (headers) =>
          client()
            .getServiceBinding(resultsFor(serviceDocuments))
            .update(
              serviceType === 'odatav2'
                ? {
                    bindingName,
                    desiredPublicationState: state,
                    serviceType,
                    serviceName: String(args.service_name).trim().toUpperCase(),
                    serviceVersion: String(
                      args.service_version ?? '0001',
                    ).trim(),
                  }
                : {
                    bindingName,
                    desiredPublicationState: state,
                    serviceType,
                  },
              {
                headers,
                lockHandle,
                timeout: 0,
                analyse: analysePublication,
              },
            ),
        ),
      );
    }
    case 'LOCAL_TEST_CLASS':
    case 'LOCAL_TYPES':
    case 'LOCAL_DEFINITIONS':
    case 'LOCAL_MACROS':
    case 'UNIT_TEST':
    case 'CDS_UNIT_TEST':
    case 'BEHAVIOR_IMPLEMENTATION': {
      const [field, includeType, include] = CLASS_INCLUDES[args.object_type];
      const missing = required('class_name', args.class_name);
      const body = requiredText(field, source(args, field));
      if (missing) return return_error(missing);
      if (typeof body !== 'string') return return_error(body);
      return written(() =>
        withAdtHeaders(
          context,
          adtOperation(includeType, 'update'),
          (headers) =>
            include(client()).update(
              { className: upper(args.class_name), ...transport },
              {
                headers,
                source: body,
                lockHandle,
                analyse: analyseException,
              },
            ),
        ),
      );
    }
    case 'TABLE':
      return update.TABLE(context, {
        ...common,
        table_name: args.table_name,
        ddl_code: source(args, 'ddl_code'),
      });
    case 'STRUCTURE':
      return update.STRUCTURE(context, {
        ...common,
        structure_name: args.structure_name,
        ddl_code: source(args, 'ddl_code'),
      });
    case 'DDL':
      return update.DDL(context, {
        ...common,
        ddl_name: args.ddl_name,
        ddl_source: source(args, 'ddl_source'),
      });
    case 'CLASS':
      return update.CLASS(context, {
        ...common,
        class_name: args.class_name,
        source_code: args.source_code,
      });
    case 'PROGRAM':
      return update.PROGRAM(context, {
        ...common,
        program_name: args.program_name,
        source_code: args.source_code,
      });
    case 'INTERFACE':
      return update.INTERFACE(context, {
        ...common,
        interface_name: args.interface_name,
        source_code: args.source_code,
      });
    case 'FUNCTION_MODULE':
      return update.FUNCTION_MODULE(context, {
        ...common,
        function_module_name: args.function_module_name,
        function_group_name: args.function_group_name,
        source_code: args.source_code,
      });
    case 'BEHAVIOR_DEFINITION':
      return update.BEHAVIOR_DEFINITION(context, {
        ...common,
        name: args.name,
        source_code: args.source_code,
      });
    case 'METADATA_EXTENSION':
      return update.METADATA_EXTENSION(context, {
        ...common,
        name: args.name,
        source_code: args.source_code,
      });
    default:
      return return_error(
        new Error(
          `Unsupported update for object_type: ${String(args.object_type)}`,
        ),
      );
  }
}
