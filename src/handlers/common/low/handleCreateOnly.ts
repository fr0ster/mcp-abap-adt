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
 * (PACKAGE, TRANSPORT, TABLE, DDL, CLASS, PROGRAM, INCLUDE, INTERFACE,
 * FUNCTION_MODULE),
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
  tableTypeDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtResponse,
  ServiceBindingVariant,
} from '@mcp-abap-adt/interfaces-adt';
import type * as z from 'zod';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  COMPACT_CREATE_TAKES,
  type compactCreateSchema,
} from '../../../lib/compact/compactSchemas';
import {
  defineTool,
  type HandlerContext,
  type ToolArgs,
  type ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { requireSystemContextForCreate } from '../../../lib/systemContextGuard';
import type { ToolResultLike } from '../../../lib/toolResult';
import { return_error } from '../../../lib/utils';
import {
  TOOL_DEFINITION as CreateClass_Tool,
  handleCreateClass,
} from '../../class/high/handleCreateClass';
import {
  TOOL_DEFINITION as CreateDdl_Tool,
  handleCreateDdl,
} from '../../ddl/high/handleCreateDdl';
import {
  TOOL_DEFINITION as CreateFunctionModule_Tool,
  handleCreateFunctionModule,
} from '../../function/high/handleCreateFunctionModule';
import {
  TOOL_DEFINITION as CreateInclude_Tool,
  handleCreateInclude,
} from '../../include/high/handleCreateInclude';
import {
  TOOL_DEFINITION as CreateInterface_Tool,
  handleCreateInterface,
} from '../../interface/high/handleCreateInterface';
import {
  TOOL_DEFINITION as CreatePackage_Tool,
  handleCreatePackage,
} from '../../package/high/handleCreatePackage';
import {
  TOOL_DEFINITION as CreateProgram_Tool,
  handleCreateProgram,
} from '../../program/high/handleCreateProgram';
import {
  TOOL_DEFINITION as CreateTable_Tool,
  handleCreateTable,
} from '../../table/high/handleCreateTable';
import {
  TOOL_DEFINITION as CreateTransport_Tool,
  handleCreateTransport,
} from '../../transport/high/handleCreateTransport';

/** Accepted for every type: they take no part in the request. */
const ALWAYS = ['object_type', 'detail'] as const;

/**
 * Accepted for every type (the controller's ruling), and per type the
 * arguments its create request carries — measured: each string argument's
 * value found in the request sent, each boolean or enum read off the
 * adt-clients create that builds it (`COMPACT_CREATE_TAKES`, the data
 * `HandlerCreate`'s schema is projected from).
 */
const COMMON: readonly string[] = COMPACT_CREATE_TAKES.every;
const CREATE_CARRIES: Readonly<Record<string, readonly string[] | undefined>> =
  COMPACT_CREATE_TAKES.members;

/**
 * The arguments given that the type's create does not send, in the order
 * the schema declares them (the parse's): every argument present
 * (`!== undefined`) outside the type's list.
 */
function notSent(objectType: string, args: ToolArgs): string[] {
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

/** HandlerCreate's arguments, as its schema parses them. */
type Args = z.output<typeof compactCreateSchema>;

/**
 * A target tool's call over the arguments it declares. `HandlerCreate`'s
 * own schema has refused every argument it does not declare, and `notSent`
 * every one the type's create does not carry; what is left that the target
 * does not declare is `HandlerCreate`'s alone (`object_type`, an argument
 * every type accepts but this create does not send). The target's schema is
 * strict, so it is handed only its own.
 */
function delegate<S extends z.ZodObject, R extends ToolResultLike>(
  definition: ToolDefinition<S>,
  handler: (context: HandlerContext, args: z.output<S>) => Promise<R>,
): (context: HandlerContext, args: ToolArgs) => Promise<R> {
  const entry = defineTool(definition, handler);
  return (context, args) =>
    entry.call(
      context,
      Object.fromEntries(
        Object.entries(args).filter(([name]) =>
          Object.hasOwn(definition.inputSchema.shape, name),
        ),
      ),
    );
}

/**
 * The creates a type delegates to: each the target tool's entry, so the
 * arguments are parsed with the target's own schema.
 */
const create = {
  PACKAGE: delegate(CreatePackage_Tool, handleCreatePackage),
  TRANSPORT: delegate(CreateTransport_Tool, handleCreateTransport),
  TABLE: delegate(CreateTable_Tool, handleCreateTable),
  DDL: delegate(CreateDdl_Tool, handleCreateDdl),
  CLASS: delegate(CreateClass_Tool, handleCreateClass),
  PROGRAM: delegate(CreateProgram_Tool, handleCreateProgram),
  INCLUDE: delegate(CreateInclude_Tool, handleCreateInclude),
  INTERFACE: delegate(CreateInterface_Tool, handleCreateInterface),
  FUNCTION_MODULE: delegate(
    CreateFunctionModule_Tool,
    handleCreateFunctionModule,
  ),
} as const;

const text = (value: string | undefined): string | undefined =>
  value !== undefined && value.length > 0 ? value : undefined;

/** The arguments of HandlerCreate whose value is text. */
type TextField = {
  [K in keyof Args]-?: Args[K] extends string | undefined ? K : never;
}[keyof Args];

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
): Promise<ToolResultLike> {
  const detail = detailOf(args);
  return answer(
    { tool, detail },
    atStep('create', create),
    project(detail, terseWrite),
  );
}

/** `${field} is required` when `args[field]` is not a non-empty string. */
function missing(
  args: Args,
  fields: readonly TextField[],
): ToolResultLike | undefined {
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
): Promise<ToolResultLike> {
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
      return create.PACKAGE(context, args);
    case 'TRANSPORT':
      return create.TRANSPORT(context, args);
    case 'TABLE':
      return create.TABLE(context, args);
    case 'DDL':
      return create.DDL(context, args);
    case 'CLASS':
      return create.CLASS(context, args);
    case 'PROGRAM':
      return create.PROGRAM(context, args);
    case 'INCLUDE':
      // The arguments it reads, each a string or absent: they arrive from
      // outside the type system.
      return create.INCLUDE(context, {
        include_name: text(args.include_name),
        package_name: text(args.package_name),
        description: text(args.description),
        transport_request: transportRequest,
        master_language: masterLanguage,
        detail: detailOf(args),
      });
    case 'INTERFACE':
      return create.INTERFACE(context, args);
    case 'FUNCTION_MODULE':
      return create.FUNCTION_MODULE(context, args);

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
    case 'TABLE_TYPE': {
      const refused = missing(args, ['table_type_name', 'package_name']);
      if (refused) return refused;
      const tableTypeName = String(args.table_type_name).toUpperCase();
      return createAlone(args, 'CreateTableType', () =>
        withAdtHeaders(context, 'tableType.create', (headers) =>
          client()
            .getTableType(resultsFor(tableTypeDocuments))
            .create(
              {
                tableTypeName,
                description: text(args.description) || tableTypeName,
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
                bindingVariant: args.binding_variant ?? 'ODATA_V4_UI',
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
                implementationType: args.implementation_type,
                masterLanguage,
              },
              { headers, analyse: analyseException },
            ),
        ),
      );
    }
    case 'BEHAVIOR_IMPLEMENTATION': {
      // The create is the class shell; adt-clients' create config requires
      // the behavior definition it is for, so the create takes it.
      const refused = missing(args, [
        'class_name',
        'package_name',
        'behavior_definition',
      ]);
      if (refused) return refused;
      const className = String(args.class_name).toUpperCase();
      const behaviorDefinition = String(args.behavior_definition).toUpperCase();
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
                  behaviorDefinition,
                  packageName: packageName.toUpperCase(),
                  description: text(args.description) || className,
                  transportRequest,
                  responsible,
                  masterSystem,
                },
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
