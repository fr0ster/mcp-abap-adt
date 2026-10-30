/**
 * The objects a deletion request removes, per compact `object_type`: the
 * adt-clients object that sends the deletion and its check, and the
 * configuration both take.
 *
 * Shared by compact's delete (`handleDeleteOnly`: the deletion request alone)
 * and its deletion check (`handleDeletionCheck`: the check request alone), so
 * the check asks about exactly the object the delete removes. The full sets'
 * `Delete<Type>` tools send the same two requests in a chain
 * (`deleteIfDeletable`).
 *
 * CDS_UNIT_TEST is its test class: the deletion removes the class
 * (`handleDeleteCdsUnitTest.ts` explains why through `getClass()`).
 * METADATA_EXTENSION's deletion is a `DELETE` on its own URL, answered by an
 * empty 2xx (`handleDeleteMetadataExtension.ts`); every other type's is the
 * deletion service's `POST`, answered by a `del:deletionResult`.
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
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAnalyse } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { IServerAdtClient } from '../../../lib/adtClientContract';
import { createAdtClient, createOnPremAdtClient } from '../../../lib/clients';
import type { DELETION_CHECK_TYPES } from '../../../lib/compact/compactSchemas';
import type {
  CheckedDeletable,
  CheckedDeletableType,
} from '../../../lib/strategies/checkedDeletion';
import { analyseDeletion } from '../../../lib/strategies/deletionRefusal';
import { resultsFor } from '../../../lib/strategies/resultSets';

type AdtClient = IServerAdtClient;

/** The object's names, upper-cased; a function module also names its group. */
export interface DeletionName {
  name: string;
  group?: string;
}

export interface DeletionTarget {
  /** The object type of its `checkDeletion` and `delete` (their header pairs). */
  objectType: CheckedDeletableType;
  /** The adt-clients object whose `checkDeletion` is sent, on the variant's client. */
  checked(client: AdtClient): Pick<CheckedDeletable<any, any>, 'checkDeletion'>;
  /**
   * The adt-clients object whose `delete` is sent: on the variant's client,
   * or on the on-premise one for a type only `ADT_TYPES_ONPREM` deletes (a
   * program), which refuses a connection declared otherwise before anything
   * is sent.
   */
  deleted(
    connection: IAbapConnection,
    logger?: ILogger,
  ): Pick<CheckedDeletable<any, any>, 'delete'>;
  /** The configuration of both requests. */
  config(name: DeletionName, transportRequest?: string): object;
  /** How the deletion's own answer is read. */
  deleteAnalyse: IAnalyse<any>;
}

const withConfig =
  (config: (name: DeletionName) => object) =>
  (name: DeletionName, transportRequest?: string) => ({
    ...config(name),
    transportRequest,
  });

/** A type whose check and deletion are both sent on the variant's client. */
const target = (
  objectType: CheckedDeletableType,
  object: (client: AdtClient) => CheckedDeletable<any, any>,
  config: (name: DeletionName) => object,
  deleteAnalyse: IAnalyse<any> = analyseDeletion,
): DeletionTarget => ({
  objectType,
  checked: object,
  deleted: (connection, logger) => object(createAdtClient(connection, logger)),
  config: withConfig(config),
  deleteAnalyse,
});

const asClass = (c: AdtClient) => c.getClass(resultsFor(classDocuments));

/** One target per type the deletion check takes: the compiler holds the two lists equal. */
export const DELETION_TARGETS: Readonly<
  Record<(typeof DELETION_CHECK_TYPES)[number], DeletionTarget>
> = {
  PACKAGE: target(
    'package',
    (c) => c.getPackage(resultsFor(packageDocuments)),
    ({ name }) => ({ packageName: name }),
  ),
  DOMAIN: target(
    'domain',
    (c) => c.getDomain(resultsFor(domainDocuments)),
    ({ name }) => ({ domainName: name }),
  ),
  DATA_ELEMENT: target(
    'dataElement',
    (c) => c.getDataElement(resultsFor(dataElementDocuments)),
    ({ name }) => ({ dataElementName: name }),
  ),
  TABLE: target(
    'table',
    (c) => c.getTable(resultsFor(tableDocuments)),
    ({ name }) => ({ tableName: name }),
  ),
  STRUCTURE: target(
    'structure',
    (c) => c.getStructure(resultsFor(structureDocuments)),
    ({ name }) => ({ structureName: name }),
  ),
  DDL: target(
    'ddl',
    (c) => c.getDdl(resultsFor(ddlDocuments)),
    ({ name }) => ({ ddlName: name }),
  ),
  SERVICE_DEFINITION: target(
    'serviceDefinition',
    (c) => c.getServiceDefinition(resultsFor(serviceDefinitionDocuments)),
    ({ name }) => ({ serviceDefinitionName: name }),
  ),
  SERVICE_BINDING: target(
    'serviceBinding',
    (c) => c.getServiceBinding(resultsFor(serviceDocuments)),
    ({ name }) => ({ bindingName: name }),
  ),
  CLASS: target('class', asClass, ({ name }) => ({ className: name })),
  CDS_UNIT_TEST: target('class', asClass, ({ name }) => ({ className: name })),
  // A program's deletion check is served on both variants, its deletion on
  // premise only (`ADT_TYPES_CLOUD` lists no `delete` for `PROG/P`).
  PROGRAM: {
    objectType: 'program',
    checked: (c) => c.getProgram(resultsFor(programDocuments)),
    deleted: (connection, logger) =>
      createOnPremAdtClient(connection, logger).getProgram(
        resultsFor(programDocuments),
      ),
    config: withConfig(({ name }) => ({ programName: name })),
    deleteAnalyse: analyseDeletion,
  },
  INTERFACE: target(
    'interface',
    (c) => c.getInterface(resultsFor(interfaceDocuments)),
    ({ name }) => ({ interfaceName: name }),
  ),
  FUNCTION_GROUP: target(
    'functionGroup',
    (c) => c.getFunctionGroup(resultsFor(functionGroupDocuments)),
    ({ name }) => ({ functionGroupName: name }),
  ),
  FUNCTION_MODULE: target(
    'functionModule',
    (c) => c.getFunctionModule(resultsFor(functionModuleDocuments)),
    ({ name, group }) => ({
      functionModuleName: name,
      functionGroupName: group,
    }),
  ),
  BEHAVIOR_DEFINITION: target(
    'behaviorDefinition',
    (c) => c.getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments)),
    ({ name }) => ({ name }),
  ),
  BEHAVIOR_IMPLEMENTATION: target(
    'behaviorImplementation',
    (c) => c.getBehaviorImplementation(resultsFor(classDocuments)),
    ({ name }) => ({ className: name }),
  ),
  METADATA_EXTENSION: target(
    'metadataExtension',
    (c) => c.getMetadataExtension(resultsFor(metadataExtensionDocuments)),
    ({ name }) => ({ name }),
    analyseException,
  ),
};

/** The object types a deletion request removes. */
export const DELETION_TYPES = Object.keys(DELETION_TARGETS);
