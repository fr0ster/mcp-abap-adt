/**
 * Compact `HandlerCreate`: the create request alone, one `POST`, for every
 * type (spec §4.6; the owner's rule — compact is one ADT request per tool
 * call, the consumer chains lock, update, unlock and activate as calls of
 * their own). The full sets' `Create<Type>` keep their chains.
 *
 * Only the create of the type's adt-clients `create()` is sent, with the
 * arguments the full create maps for its own create step: nothing validated,
 * locked, written, checked or activated, no service-group read for a service
 * binding, no read-back after a function group's `400` — the object is
 * created inactive with what the create carries. One request, none of which
 * waits for another's answer, so it can be recorded in batch mode.
 *
 * Where the full create already sends that one request and nothing else
 * (PACKAGE, TRANSPORT, TABLE, DDL, CLASS, PROGRAM, INTERFACE, FUNCTION_MODULE),
 * it is that handler, so the two cannot drift; the others call the create step
 * of their full create here — a behavior definition without its root entity
 * and a behavior implementation without its behavior definition, which their
 * creates do not send.
 *
 * **An argument the create does not send is refused, not dropped**: present
 * (`!== undefined`) — `false`, `0` and `''` included — before any request,
 * naming it: every argument outside the type's `CREATE_CARRIES` list
 * (`activate` among them). Each list is what that type's create request was
 * measured to send, plus `transport_request`, `package_name` and
 * `description`, which every type accepts. Over MCP the SDK drops an
 * argument the schema does not declare before the handler runs, as for every
 * tool; this refusal guards a direct caller (an embedder calling the handler).
 * Each type is proven to send
 * exactly one request (`compact-modify/src/__tests__/createSingleCall.test.ts`).
 *
 * UNIT_TEST and CDS_UNIT_TEST have no create of one request — their create is
 * the test classes' lock, write, unlock and activation (a CDS unit test also
 * checks the view and creates the class first) — and are refused before
 * anything is sent, pointing to the full set's `CreateUnitTest` /
 * `CreateCdsUnitTest`.
 */

import {
  behaviorDefinitionDocuments,
  classDocuments,
  dataElementDocuments,
  domainDocuments,
  functionGroupDocuments,
  metadataExtensionDocuments,
  serviceDefinitionDocuments,
  serviceDocuments,
  structureDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtResponse,
  ServiceBindingVariant,
} from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { requireSystemContextForCreate } from '../../../lib/systemContextGuard';
import { return_error } from '../../../lib/utils';
import { handleCreateClass } from '../../class/high/handleCreateClass';
import { handleCreateDdl } from '../../ddl/high/handleCreateDdl';
import { handleCreateFunctionModule } from '../../function/high/handleCreateFunctionModule';
import { handleCreateInterface } from '../../interface/high/handleCreateInterface';
import { handleCreatePackage } from '../../package/high/handleCreatePackage';
import { handleCreateProgram } from '../../program/high/handleCreateProgram';
import { handleCreateTable } from '../../table/high/handleCreateTable';
import { handleCreateTransport } from '../../transport/high/handleCreateTransport';

/** Accepted for every type: they take no part in the request. */
const ALWAYS = ['object_type', 'detail'] as const;

/** Accepted for every type (the controller's ruling). */
const COMMON = ['transport_request', 'package_name', 'description'] as const;

/**
 * Per type, the arguments its create request carries — measured: each string
 * argument's value found in the request sent, each boolean or enum read off
 * the adt-clients create that builds it.
 */
const CREATE_CARRIES: Readonly<Record<string, readonly string[]>> = {
  PACKAGE: [
    'package_name',
    'super_package',
    'package_type',
    'software_component',
    'transport_layer',
    'record_changes',
    'application_component',
    'master_language',
  ],
  DOMAIN: ['domain_name', 'master_language'],
  DATA_ELEMENT: ['data_element_name', 'master_language'],
  TRANSPORT: ['transport_type', 'target_system', 'owner'],
  TABLE: ['table_name', 'master_language'],
  STRUCTURE: ['structure_name', 'master_language'],
  DDL: ['ddl_name', 'master_language'],
  SERVICE_DEFINITION: ['service_definition_name', 'master_language'],
  SERVICE_BINDING: [
    'service_binding_name',
    'service_definition_name',
    'service_name',
    'service_version',
    'binding_variant',
    'master_language',
  ],
  CLASS: [
    'class_name',
    'superclass',
    'final',
    'create_protected',
    'master_language',
  ],
  PROGRAM: ['program_name', 'program_type', 'application', 'master_language'],
  INTERFACE: ['interface_name', 'master_language'],
  FUNCTION_GROUP: ['function_group_name', 'master_language'],
  FUNCTION_MODULE: ['function_module_name', 'function_group_name'],
  BEHAVIOR_DEFINITION: ['name', 'implementation_type', 'master_language'],
  BEHAVIOR_IMPLEMENTATION: ['class_name'],
  METADATA_EXTENSION: ['name', 'master_language'],
};

/**
 * The arguments given that the type's create does not send, in the order
 * given: every argument present (`!== undefined`) outside the type's list.
 */
function notSent(objectType: string, args: Args): string[] {
  const carried = new Set<string>([
    ...ALWAYS,
    ...COMMON,
    ...(CREATE_CARRIES[objectType] ?? []),
  ]);
  return Object.keys(args).filter((key) => {
    if (args[key] === undefined) return false;
    return !carried.has(key);
  });
}

/** The refusal of arguments the create request does not send. */
function notSentRefusal(names: string[]) {
  const named =
    names.length === 1
      ? `${names[0]} is not sent`
      : `${names.join(', ')} are not sent`;
  return return_error(
    new Error(
      `HandlerCreate sends the create request alone: ${named} — leave it out; then HandlerLock, HandlerUpdate with the lock_handle, HandlerUnlock and HandlerActivate`,
    ),
  );
}

type Args = Record<string, unknown> & { object_type?: string };

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** The types whose create is a chain, each with the full set's tool that runs it. */
const CHAIN_CREATES: Readonly<Record<string, string>> = {
  UNIT_TEST: 'CreateUnitTest',
  CDS_UNIT_TEST: 'CreateCdsUnitTest',
};

/**
 * The refusal of a type whose create is a chain of requests (naming the full
 * set's tool that creates it), or `undefined` for any other type.
 */
export function chainCreateRefusal(objectType: string) {
  return Object.hasOwn(CHAIN_CREATES, objectType)
    ? chainRefusal(objectType, CHAIN_CREATES[objectType])
    : undefined;
}

/** A type with no create: the words the create route answers it with. */
function unsupportedCreate(objectType: string) {
  return return_error(
    new Error(`Unsupported create for object_type: ${objectType}`),
  );
}

/** The refusal of a type whose create is a chain of requests. */
function chainRefusal(objectType: string, fullTool: string) {
  return return_error(
    new Error(
      `HandlerCreate does not create ${objectType}: its create is a chain of requests, not one — use ${fullTool} of the full set`,
    ),
  );
}

/**
 * The create step alone, answered as the full create answers it — under its
 * step, `create`, as the full create's failure of that step reads.
 */
function createAlone(
  args: Args,
  tool: string,
  create: () => Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>,
): Promise<unknown> {
  const detail = detailOf(args);
  return answer(
    { tool, detail },
    atStep('create', create),
    project(detail, terseWrite),
  );
}

/** `${field} is required` when `args[field]` is not a non-empty string. */
function missing(args: Args, fields: string[]): unknown | undefined {
  for (const field of fields) {
    if (!text(args[field])) {
      return return_error(new Error(`${field} is required`));
    }
  }
  return undefined;
}

export async function handleCreateOnly(
  context: HandlerContext,
  args: Args,
): Promise<unknown> {
  const { connection, logger } = context;
  const client = () => createAdtClient(connection, logger);
  const packageName = text(args.package_name) ?? '';
  const transportRequest = text(args.transport_request);
  const masterLanguage = text(args.master_language);

  const objectType = String(args.object_type);
  // Own keys only: an object_type such as `constructor` names no create.
  if (Object.hasOwn(CHAIN_CREATES, objectType)) {
    return chainRefusal(objectType, CHAIN_CREATES[objectType]);
  }
  if (!Object.hasOwn(CREATE_CARRIES, objectType)) {
    // No create at all: the create route's own words.
    return unsupportedCreate(objectType);
  }
  const ignored = notSent(objectType, args);
  if (ignored.length > 0) return notSentRefusal(ignored);

  switch (args.object_type) {
    case 'PACKAGE':
      return handleCreatePackage(context, args as never);
    case 'TRANSPORT':
      return handleCreateTransport(context, args as never);
    case 'TABLE':
      return handleCreateTable(context, args as never);
    case 'DDL':
      return handleCreateDdl(context, args as never);
    case 'CLASS':
      return handleCreateClass(context, args as never);
    case 'PROGRAM':
      return handleCreateProgram(context, args as never);
    case 'INTERFACE':
      return handleCreateInterface(context, args as never);
    case 'FUNCTION_MODULE':
      return handleCreateFunctionModule(context, args as never);

    case 'DOMAIN': {
      const refused = missing(args, ['domain_name', 'package_name']);
      if (refused) return refused;
      const domainName = String(args.domain_name).toUpperCase();
      return createAlone(args, 'CreateDomain', () =>
        withAdtHeaders(context, 'domain.create', (headers) =>
          client()
            .getDomain(resultsFor(domainDocuments))
            .create(
              {
                domainName,
                description: text(args.description) || domainName,
                packageName,
                transportRequest,
                masterLanguage,
              },
              { headers, analyse: analyseException },
            ),
        ),
      );
    }
    case 'DATA_ELEMENT': {
      const refused = missing(args, ['data_element_name', 'package_name']);
      if (refused) return refused;
      const dataElementName = String(args.data_element_name).toUpperCase();
      return createAlone(args, 'CreateDataElement', () =>
        withAdtHeaders(context, 'dataElement.create', (headers) =>
          client()
            .getDataElement(resultsFor(dataElementDocuments))
            .create(
              {
                dataElementName,
                description: text(args.description) || dataElementName,
                packageName,
                transportRequest,
                masterLanguage,
              },
              { headers, analyse: analyseException },
            ),
        ),
      );
    }
    case 'STRUCTURE': {
      const refused = missing(args, ['structure_name', 'package_name']);
      if (refused) return refused;
      const structureName = String(args.structure_name).toUpperCase();
      return createAlone(args, 'CreateStructure', () =>
        withAdtHeaders(context, 'structure.create', (headers) =>
          client()
            .getStructure(resultsFor(structureDocuments))
            .create(
              {
                structureName,
                description: text(args.description) || structureName,
                packageName,
                transportRequest,
                masterLanguage,
              },
              { headers, analyse: analyseException },
            ),
        ),
      );
    }
    case 'SERVICE_DEFINITION': {
      const refused = missing(args, [
        'service_definition_name',
        'package_name',
      ]);
      if (refused) return refused;
      const serviceDefinitionName = String(
        args.service_definition_name,
      ).toUpperCase();
      return createAlone(args, 'CreateServiceDefinition', () =>
        withAdtHeaders(context, 'serviceDefinition.create', (headers) =>
          client()
            .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
            .create(
              {
                serviceDefinitionName,
                description: text(args.description) || serviceDefinitionName,
                packageName: packageName.toUpperCase(),
                transportRequest,
                masterLanguage,
              },
              { headers, analyse: analyseException },
            ),
        ),
      );
    }
    case 'SERVICE_BINDING': {
      const refused = missing(args, [
        'service_binding_name',
        'service_definition_name',
        'package_name',
      ]);
      if (refused) return refused;
      const serviceBindingName = String(args.service_binding_name)
        .trim()
        .toUpperCase();
      return createAlone(args, 'CreateServiceBinding', () =>
        withAdtHeaders(context, 'serviceBinding.create', (headers) =>
          client()
            .getServiceBinding(resultsFor(serviceDocuments))
            .create(
              {
                bindingName: serviceBindingName,
                packageName: packageName.trim().toUpperCase(),
                description: (
                  text(args.description) || serviceBindingName
                ).trim(),
                serviceDefinitionName: String(args.service_definition_name)
                  .trim()
                  .toUpperCase(),
                serviceName: (text(args.service_name) || serviceBindingName)
                  .trim()
                  .toUpperCase(),
                serviceVersion: (text(args.service_version) || '0001').trim(),
                bindingVariant:
                  (args.binding_variant as ServiceBindingVariant | undefined) ??
                  'ODATA_V4_UI',
                transportRequest,
                masterLanguage,
              },
              { headers, analyse: analyseException },
            ),
        ),
      );
    }
    case 'FUNCTION_GROUP': {
      const refused = missing(args, ['function_group_name', 'package_name']);
      if (refused) return refused;
      const functionGroupName = String(args.function_group_name).toUpperCase();
      return createAlone(args, 'CreateFunctionGroup', () =>
        withAdtHeaders(context, 'functionGroup.create', (headers) =>
          client()
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .create(
              {
                functionGroupName,
                description: text(args.description) || functionGroupName,
                packageName,
                transportRequest,
                masterLanguage,
              },
              { headers, analyse: analyseException },
            ),
        ),
      );
    }
    case 'BEHAVIOR_DEFINITION': {
      const refused = missing(args, [
        'name',
        'package_name',
        'implementation_type',
      ]);
      if (refused) return refused;
      const name = String(args.name).toUpperCase();
      return createAlone(args, 'CreateBehaviorDefinition', () =>
        withAdtHeaders(context, 'behaviorDefinition.create', (headers) =>
          client()
            .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
            .create(
              {
                name,
                description: text(args.description) || name,
                packageName,
                transportRequest,
                implementationType: args.implementation_type as never,
                masterLanguage,
              },
              { headers, analyse: analyseException },
            ),
        ),
      );
    }
    case 'BEHAVIOR_IMPLEMENTATION': {
      // The create is the class shell: the behavior definition is named in
      // the implementation's source, written afterwards, never in this
      // request — so the create neither needs nor takes it.
      const refused = missing(args, ['class_name', 'package_name']);
      if (refused) return refused;
      const className = String(args.class_name).toUpperCase();
      return createAlone(args, 'CreateBehaviorImplementation', async () => {
        // adt-clients builds the inner class with an empty system context:
        // the responsible and the master system go in the config.
        const { responsible, masterSystem } = requireSystemContextForCreate();
        return withAdtHeaders(
          context,
          'behaviorImplementation.create',
          (headers) =>
            client()
              .getBehaviorImplementation(resultsFor(classDocuments))
              .create(
                {
                  className,
                  packageName: packageName.toUpperCase(),
                  description: text(args.description) || className,
                  transportRequest,
                  responsible,
                  masterSystem,
                } as never,
                { headers, analyse: analyseException },
              ),
        );
      });
    }
    case 'METADATA_EXTENSION': {
      const refused = missing(args, ['name', 'package_name']);
      if (refused) return refused;
      const name = String(args.name).toUpperCase();
      return createAlone(args, 'CreateMetadataExtension', () =>
        withAdtHeaders(context, 'metadataExtension.create', (headers) =>
          client()
            .getMetadataExtension(resultsFor(metadataExtensionDocuments))
            .create(
              {
                name,
                description: text(args.description) || name,
                packageName,
                transportRequest,
                masterLanguage,
              },
              { headers, analyse: analyseException },
            ),
        ),
      );
    }
    default:
      return unsupportedCreate(objectType);
  }
}
