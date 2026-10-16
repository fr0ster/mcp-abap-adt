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
 * others call the create step of their high create here. Each type is proven
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
