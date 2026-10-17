/**
 * A create that sends the create request alone: the compact create's
 * `create_only`.
 *
 * `HandlerCreate` without it runs the high create — for most types validate,
 * create, lock, write, unlock, check and activate, each request built after
 * the previous one answered. With `create_only` only the create of the type's
 * adt-clients `create()` is sent, with the arguments the high create maps for
 * its own create step: nothing validated, locked, written, checked or
 * activated, and the object is created inactive with what the create carries.
 * One request, none of which waits for another's answer, so it can be recorded
 * in batch mode (spec §4.6); outside batch mode it is the same one request.
 *
 * Where the high create already sends that one request and nothing else
 * (PACKAGE, TRANSPORT, TABLE, DDL, CLASS, PROGRAM, INTERFACE, FUNCTION_MODULE,
 * BEHAVIOR_IMPLEMENTATION), it is that handler, so the two cannot drift; the
 * others call the create step of their high create here.
 *
 * **An argument the create does not send is refused, not dropped** (the
 * controller's ruling, the principle the owner set for `document` beside the
 * flat fields): present (`!== undefined`) beside `create_only`, before any
 * request — `activate` unless it is `false`, and every argument outside the
 * type's `CREATE_CARRIES` list. Each list is what that type's create request
 * was measured to carry and what its `create()` takes in its config (a
 * behavior definition's `rootEntity`, a behavior implementation's
 * `behaviorDefinition`, a class's `abstract` — taken, not on the wire), plus
 * `transport_request`, `package_name` and `description`, which every type
 * accepts. Each type is proven
 * to send exactly one request (`compact-modify/src/__tests__/createOnly.test.ts`).
 *
 * UNIT_TEST and CDS_UNIT_TEST have no create of one request — their create is
 * the test classes' lock, write, unlock and activation — and refuse
 * `create_only` before anything is sent.
 */

import {
  behaviorDefinitionDocuments,
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
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { handleCreateBehaviorImplementation } from '../../behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleCreateClass } from '../../class/high/handleCreateClass';
import { handleCreateDdl } from '../../ddl/high/handleCreateDdl';
import { handleCreateFunctionModule } from '../../function/high/handleCreateFunctionModule';
import { handleCreateInterface } from '../../interface/high/handleCreateInterface';
import { handleCreatePackage } from '../../package/high/handleCreatePackage';
import { handleCreateProgram } from '../../program/high/handleCreateProgram';
import { handleCreateTable } from '../../table/high/handleCreateTable';
import { handleCreateTransport } from '../../transport/high/handleCreateTransport';

/** Accepted beside `create_only` for every type: they take no part in the request. */
const ALWAYS = ['object_type', 'create_only', 'detail'] as const;

/** Accepted for every offered type (the controller's ruling). */
const COMMON = ['transport_request', 'package_name', 'description'] as const;

/**
 * Per type, the arguments its create request carries — measured: each string
 * argument's value found in the request sent, each boolean or enum read off
 * the adt-clients create that builds it — and what its `create()` takes.
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
    'abstract',
    'create_protected',
    'master_language',
  ],
  PROGRAM: ['program_name', 'program_type', 'application', 'master_language'],
  INTERFACE: ['interface_name', 'master_language'],
  FUNCTION_GROUP: ['function_group_name', 'master_language'],
  FUNCTION_MODULE: ['function_module_name', 'function_group_name'],
  BEHAVIOR_DEFINITION: [
    'name',
    'root_entity',
    'implementation_type',
    'master_language',
  ],
  BEHAVIOR_IMPLEMENTATION: ['class_name', 'behavior_definition'],
  METADATA_EXTENSION: ['name', 'master_language'],
};

/**
 * The arguments given beside `create_only` that the type's create does not
 * send, in the order given: `activate` unless `false`, and every argument
 * outside the type's list.
 */
function notSent(objectType: string, args: Args): string[] {
  const carried = new Set<string>([
    ...ALWAYS,
    ...COMMON,
    ...(CREATE_CARRIES[objectType] ?? []),
  ]);
  return Object.keys(args).filter((key) => {
    if (args[key] === undefined) return false;
    if (key === 'activate') return args[key] !== false;
    return !carried.has(key);
  });
}

/** The refusal of arguments the create alone does not send. */
function notSentRefusal(names: string[]) {
  const named =
    names.length === 1
      ? `${names[0]} is not sent`
      : `${names.join(', ')} are not sent`;
  return return_error(
    new Error(
      `create_only sends the create alone: ${named} — leave it out, or create without create_only`,
    ),
  );
}

type Args = Record<string, unknown> & { object_type?: string };

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** The refusal of a type whose create sends more than one request. */
function createOnlyRefusal(objectType: string) {
  return return_error(
    new Error(
      `create_only is not available for ${objectType}: its create sends more than one request`,
    ),
  );
}

/**
 * The create step alone, answered as the high create answers it — under its
 * step, `create`, as the high create's failure of that step reads.
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
  if (CREATE_CARRIES[objectType] === undefined) {
    return createOnlyRefusal(objectType);
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
    case 'BEHAVIOR_IMPLEMENTATION':
      return handleCreateBehaviorImplementation(context, args as never);

    case 'DOMAIN': {
      const refused = missing(args, ['domain_name', 'package_name']);
      if (refused) return refused;
      const domainName = String(args.domain_name).toUpperCase();
      return createAlone(args, 'CreateDomain', () =>
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
            { analyse: analyseException },
          ),
      );
    }
    case 'DATA_ELEMENT': {
      const refused = missing(args, ['data_element_name', 'package_name']);
      if (refused) return refused;
      const dataElementName = String(args.data_element_name).toUpperCase();
      return createAlone(args, 'CreateDataElement', () =>
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
            { analyse: analyseException },
          ),
      );
    }
    case 'STRUCTURE': {
      const refused = missing(args, ['structure_name', 'package_name']);
      if (refused) return refused;
      const structureName = String(args.structure_name).toUpperCase();
      return createAlone(args, 'CreateStructure', () =>
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
            { analyse: analyseException },
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
            { analyse: analyseException },
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
            { analyse: analyseException },
          ),
      );
    }
    case 'FUNCTION_GROUP': {
      const refused = missing(args, ['function_group_name', 'package_name']);
      if (refused) return refused;
      const functionGroupName = String(args.function_group_name).toUpperCase();
      return createAlone(args, 'CreateFunctionGroup', () =>
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
            { analyse: analyseException },
          ),
      );
    }
    case 'BEHAVIOR_DEFINITION': {
      const refused = missing(args, [
        'name',
        'package_name',
        'root_entity',
        'implementation_type',
      ]);
      if (refused) return refused;
      const name = String(args.name).toUpperCase();
      return createAlone(args, 'CreateBehaviorDefinition', () =>
        client()
          .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
          .create(
            {
              name,
              description: text(args.description) || name,
              packageName,
              transportRequest,
              rootEntity: args.root_entity as string,
              implementationType: args.implementation_type as never,
              masterLanguage,
            },
            { analyse: analyseException },
          ),
      );
    }
    case 'METADATA_EXTENSION': {
      const refused = missing(args, ['name', 'package_name']);
      if (refused) return refused;
      const name = String(args.name).toUpperCase();
      return createAlone(args, 'CreateMetadataExtension', () =>
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
            { analyse: analyseException },
          ),
      );
    }
    default:
      return createOnlyRefusal(String(args.object_type));
  }
}
