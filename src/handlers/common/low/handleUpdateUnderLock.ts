/**
 * The compact update: one write under the lock the caller holds (spec §4.6).
 *
 * The caller locked the object itself (`HandlerLock`) and passes the handle;
 * this sends the one write of its type under that handle — the `PUT` of the
 * source, the metadata document or the class include, or for a service binding
 * its one publication request — and answers SAP's result. Locking, unlocking,
 * checking and activating are the consumer's own calls.
 *
 * PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP write their metadata
 * document: `source_code` is that whole document and is sent as given — a
 * replace, so the caller reads it (`HandlerGet` part `metadata`), changes it
 * and passes all of it back.
 *
 * Arguments arrive in the compact update's names and are translated here.
 */

import {
  classDocuments,
  dataElementDocuments,
  domainDocuments,
  functionGroupDocuments,
  packageDocuments,
  serviceDefinitionDocuments,
  serviceDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  analysePublication,
} from '@mcp-abap-adt/adt-strategies';
import {
  SERVICE_BINDING_VARIANT_MAP,
  type ServiceBindingVariant,
} from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { connectionHoldingPackageLock } from '../../../lib/packageSessions';
import {
  LOCK_NOT_HELD_WORDS,
  lockHeldHere,
} from '../../../lib/state/heldLocks';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { handleUpdateBehaviorDefinition } from '../../behavior_definition/low/handleUpdateBehaviorDefinition';
import { handleUpdateClass } from '../../class/low/handleUpdateClass';
import { handleUpdateDdl } from '../../ddl/low/handleUpdateDdl';
import { handleUpdateMetadataExtension } from '../../ddlx/low/handleUpdateMetadataExtension';
import { handleUpdateFunctionModule } from '../../function/low/handleUpdateFunctionModule';
import { handleUpdateInterface } from '../../interface/low/handleUpdateInterface';
import { handleUpdateProgram } from '../../program/low/handleUpdateProgram';
import { handleUpdateStructure } from '../../structure/low/handleUpdateStructure';
import { handleUpdateTable } from '../../table/low/handleUpdateTable';

/** The object types the compact update writes, each one request under `lock_handle`. */
export const UNDER_LOCK_TYPES = [
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'FUNCTION_GROUP',
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
  'INTERFACE',
  'FUNCTION_MODULE',
  'BEHAVIOR_DEFINITION',
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
] as const;

type Args = Record<string, unknown> & {
  object_type?: string;
  lock_handle?: string;
};

/** `source_code` and the source fields some types name otherwise. */
const source = (args: Args, field: string): unknown =>
  args[field] ?? args.source_code;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const upper = (value: unknown): string => String(value ?? '').toUpperCase();

const ANSWER = { tool: 'HandlerUpdate', detail: 'terse' } as const;

/** The one write's answer, as every compact write answers it. */
const written = (call: () => Promise<never>) =>
  answer(ANSWER, call, project('terse', terseWrite));

type AdtClient = ReturnType<typeof createAdtClient>;
export type IncludeWriter = {
  update(config: object, options: object): Promise<unknown>;
};

/**
 * The class includes: the source argument each takes (beside `source_code`)
 * and the accessor that writes it, under the class's lock.
 */
export const CLASS_INCLUDES: Record<
  string,
  [string, (client: AdtClient) => IncludeWriter]
> = {
  LOCAL_TEST_CLASS: [
    'test_class_code',
    (c) => c.getLocalTestClass(resultsFor(classDocuments)),
  ],
  LOCAL_TYPES: [
    'local_types_code',
    (c) => c.getLocalTypes(resultsFor(classDocuments)),
  ],
  LOCAL_DEFINITIONS: [
    'definitions_code',
    (c) => c.getLocalDefinitions(resultsFor(classDocuments)),
  ],
  LOCAL_MACROS: [
    'macros_code',
    (c) => c.getLocalMacros(resultsFor(classDocuments)),
  ],
  UNIT_TEST: [
    'test_class_source',
    (c) => c.getLocalTestClass(resultsFor(classDocuments)),
  ],
  CDS_UNIT_TEST: [
    'test_class_source',
    (c) => c.getLocalTestClass(resultsFor(classDocuments)),
  ],
  BEHAVIOR_IMPLEMENTATION: [
    'implementation_code',
    (c) => c.getBehaviorImplementation(resultsFor(classDocuments)),
  ],
};

export async function handleUpdateUnderLock(
  context: HandlerContext,
  args: Args,
): Promise<unknown> {
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
    return return_error(new Error(LOCK_NOT_HELD_WORDS));
  }
  const { connection, logger } = context;
  const transportRequest = text(args.transport_request);
  const common = {
    lock_handle: lockHandle,
    transport_request: args.transport_request,
  } as const;
  const client = () => createAdtClient(connection, logger);
  const required = (field: string, value: unknown): Error | undefined =>
    text(value) === undefined ? new Error(`${field} is required`) : undefined;
  const transport = transportRequest ? { transportRequest } : {};

  switch (args.object_type) {
    case 'PACKAGE': {
      const missing =
        required('package_name', args.package_name) ??
        required('source_code', args.source_code);
      if (missing) return return_error(missing);
      // The package lock lives in a session of its own over RFC; the write
      // runs in that session, where the handle is valid.
      return written(
        () =>
          createAdtClient(
            connectionHoldingPackageLock(connection, lockHandle),
            logger,
          )
            .getPackage(resultsFor(packageDocuments))
            .updateMetadata(
              { packageName: upper(args.package_name), ...transport },
              {
                source: args.source_code as string,
                lockHandle,
                analyse: analyseException,
              },
            ) as Promise<never>,
      );
    }
    case 'DOMAIN': {
      const missing =
        required('domain_name', args.domain_name) ??
        required('source_code', args.source_code);
      if (missing) return return_error(missing);
      return written(
        () =>
          client()
            .getDomain(resultsFor(domainDocuments))
            .updateMetadata(
              { domainName: upper(args.domain_name), ...transport },
              {
                source: args.source_code as string,
                lockHandle,
                analyse: analyseException,
              },
            ) as Promise<never>,
      );
    }
    case 'DATA_ELEMENT': {
      const missing =
        required('data_element_name', args.data_element_name) ??
        required('source_code', args.source_code);
      if (missing) return return_error(missing);
      return written(
        () =>
          client()
            .getDataElement(resultsFor(dataElementDocuments))
            .updateMetadata(
              { dataElementName: upper(args.data_element_name), ...transport },
              {
                source: args.source_code as string,
                lockHandle,
                analyse: analyseException,
              },
            ) as Promise<never>,
      );
    }
    case 'FUNCTION_GROUP': {
      const missing =
        required('function_group_name', args.function_group_name) ??
        required('source_code', args.source_code);
      if (missing) return return_error(missing);
      return written(
        () =>
          client()
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .updateMetadata(
              {
                functionGroupName: upper(args.function_group_name),
                ...transport,
              },
              {
                source: args.source_code as string,
                lockHandle,
                analyse: analyseException,
              },
            ) as Promise<never>,
      );
    }
    case 'SERVICE_DEFINITION': {
      const missing =
        required('service_definition_name', args.service_definition_name) ??
        required('source_code', args.source_code);
      if (missing) return return_error(missing);
      return written(
        () =>
          client()
            .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
            .update(
              {
                serviceDefinitionName: upper(args.service_definition_name),
                ...transport,
              },
              {
                source: args.source_code as string,
                lockHandle,
                analyse: analyseException,
              },
            ) as Promise<never>,
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
      const variant = (
        SERVICE_BINDING_VARIANT_MAP as Record<
          string,
          { serviceType: 'odatav2' | 'odatav4' } | undefined
        >
      )[String(args.binding_variant)];
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
      return written(
        () =>
          client()
            .getServiceBinding(resultsFor(serviceDocuments))
            .update(
              // An OData V2 publication job resolves the service by name and
              // version; V4 names its target on its own.
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
                : { bindingName, desiredPublicationState: state, serviceType },
              // No timeout of the server's choosing.
              { lockHandle, timeout: 0, analyse: analysePublication },
            ) as Promise<never>,
      );
    }
    case 'LOCAL_TEST_CLASS':
    case 'LOCAL_TYPES':
    case 'LOCAL_DEFINITIONS':
    case 'LOCAL_MACROS':
    case 'UNIT_TEST':
    case 'CDS_UNIT_TEST':
    case 'BEHAVIOR_IMPLEMENTATION': {
      const [field, include] = CLASS_INCLUDES[args.object_type];
      const body = source(args, field);
      const missing =
        required('class_name', args.class_name) ?? required(field, body);
      if (missing) return return_error(missing);
      return written(
        () =>
          include(client()).update(
            { className: upper(args.class_name), ...transport },
            {
              source: body as string,
              lockHandle,
              analyse: analyseException,
            },
          ) as Promise<never>,
      );
    }
    case 'TABLE':
      return handleUpdateTable(context, {
        ...common,
        table_name: args.table_name,
        ddl_code: source(args, 'ddl_code'),
      } as never);
    case 'STRUCTURE':
      return handleUpdateStructure(context, {
        ...common,
        structure_name: args.structure_name,
        ddl_code: source(args, 'ddl_code'),
      } as never);
    case 'DDL':
      return handleUpdateDdl(context, {
        ...common,
        ddl_name: args.ddl_name,
        ddl_source: source(args, 'ddl_source'),
      } as never);
    case 'CLASS':
      return handleUpdateClass(context, {
        ...common,
        class_name: args.class_name,
        source_code: args.source_code,
      } as never);
    case 'PROGRAM':
      return handleUpdateProgram(context, {
        ...common,
        program_name: args.program_name,
        source_code: args.source_code,
      } as never);
    case 'INTERFACE':
      return handleUpdateInterface(context, {
        ...common,
        interface_name: args.interface_name,
        source_code: args.source_code,
      } as never);
    case 'FUNCTION_MODULE':
      return handleUpdateFunctionModule(context, {
        ...common,
        function_module_name: args.function_module_name,
        function_group_name: args.function_group_name,
        source_code: args.source_code,
      } as never);
    case 'BEHAVIOR_DEFINITION':
      return handleUpdateBehaviorDefinition(context, {
        ...common,
        name: args.name,
        source_code: args.source_code,
      } as never);
    case 'METADATA_EXTENSION':
      return handleUpdateMetadataExtension(context, {
        ...common,
        name: args.name,
        source_code: args.source_code,
      } as never);
    default:
      return return_error(
        new Error(
          `Unsupported update for object_type: ${String(args.object_type)}`,
        ),
      );
  }
}
