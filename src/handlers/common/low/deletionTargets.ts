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
import type {
  IAdtError,
  IAdtResponse,
  IAnalyse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { IServerAdtClient } from '../../../lib/adtClientContract';
import { adtOperation } from '../../../lib/adtHeaders/defaultPairs';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../../../lib/adtHeaders/withAdtHeaders';
import { createAdtClient, createOnPremAdtClient } from '../../../lib/clients';
import type { DELETION_CHECK_TYPES } from '../../../lib/compact/compactSchemas';
import type {
  CheckedDeletable,
  CheckedDeletableType,
} from '../../../lib/strategies/checkedDeletion';
import { analyseDeletion } from '../../../lib/strategies/deletionRefusal';
import { inCheckedGroupOn } from '../../../lib/strategies/functionModuleGroup';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';

type AdtClient = IServerAdtClient;

/** The object's names, upper-cased; a function module also names its group. */
export interface DeletionName {
  name: string;
  group?: string;
}

/** What a deletion check or a deletion answers: a reading of the document. */
export type DeletionAnswer = Promise<
  IAdtResponse<AdtReading<unknown>, IAdtError>
>;

export interface DeletionTarget {
  /** The object type of its `checkDeletion` and `delete` (their header pairs). */
  objectType: CheckedDeletableType;
  /**
   * The deletion check of the object `name` names, sent on the variant's
   * client with the header pair of the type's `checkDeletion`.
   */
  checkDeletion(
    context: AdtHeadersContext,
    client: AdtClient,
    name: DeletionName,
    analyse: IAnalyse,
  ): DeletionAnswer;
  /**
   * The deletion of the object `name` names: on the variant's client, or on
   * the on-premise one for a type only `ADT_TYPES_ONPREM` deletes (a
   * program), which refuses a connection declared otherwise before anything
   * is sent — with the header pair of the type's `delete`, read as the type
   * reads its deletion's answer.
   */
  delete(
    context: AdtHeadersContext,
    connection: IAbapConnection,
    logger: ILogger | undefined,
    name: DeletionName,
    transportRequest: string | undefined,
  ): DeletionAnswer;
}

/** The configuration of both requests: the type's names, and the transport. */
const withConfig =
  <C>(config: (name: DeletionName) => C) =>
  (name: DeletionName, transportRequest?: string) => ({
    ...config(name),
    transportRequest,
  });

/**
 * A type whose check is sent on `checked` and whose deletion on `deleted`,
 * each with the configuration `config` builds — the object's own type,
 * bound here once for both.
 */
const boundTarget = <C, V extends AdtReading<unknown>>(
  objectType: CheckedDeletableType,
  checked: (client: AdtClient) => Pick<CheckedDeletable<C, V>, 'checkDeletion'>,
  deleted: (
    connection: IAbapConnection,
    logger: ILogger | undefined,
  ) => Pick<CheckedDeletable<C, V>, 'delete'>,
  config: (name: DeletionName, transportRequest?: string) => C,
  deleteAnalyse: IAnalyse,
): DeletionTarget => ({
  objectType,
  checkDeletion: (context, client, name, analyse) =>
    withAdtHeaders(
      context,
      adtOperation(objectType, 'checkDeletion'),
      (headers) =>
        checked(client).checkDeletion(config(name), { headers, analyse }),
    ),
  delete: (context, connection, logger, name, transportRequest) =>
    withAdtHeaders(context, adtOperation(objectType, 'delete'), (headers) =>
      deleted(connection, logger).delete(config(name, transportRequest), {
        headers,
        analyse: deleteAnalyse,
      }),
    ),
});

/** A type whose check and deletion are both sent on the variant's client. */
const target = <C, V extends AdtReading<unknown>>(
  objectType: CheckedDeletableType,
  object: (client: AdtClient) => CheckedDeletable<C, V>,
  config: (name: DeletionName) => C,
  deleteAnalyse: IAnalyse = analyseDeletion,
): DeletionTarget =>
  boundTarget(
    objectType,
    object,
    (connection, logger) => object(createAdtClient(connection, logger)),
    withConfig(config),
    deleteAnalyse,
  );

/**
 * A function module's target: SAP ignores the group of the module's address
 * (#2), so the check and the deletion are each sent only after the module's
 * metadata names the group given (`inCheckedGroupOn`).
 */
const inCheckedGroupTarget = (inner: DeletionTarget): DeletionTarget => ({
  objectType: inner.objectType,
  checkDeletion: (context, client, name, analyse) =>
    inCheckedGroupOn(client, name.group ?? '', name.name, () =>
      inner.checkDeletion(context, client, name, analyse),
    ),
  delete: (context, connection, logger, name, transportRequest) =>
    inCheckedGroupOn(
      createAdtClient(connection, logger),
      name.group ?? '',
      name.name,
      () => inner.delete(context, connection, logger, name, transportRequest),
    ),
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
  TABLE_TYPE: target(
    'tableType',
    (c) => c.getTableType(resultsFor(tableTypeDocuments)),
    ({ name }) => ({ tableTypeName: name }),
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
  PROGRAM: boundTarget(
    'program',
    (c) => c.getProgram(resultsFor(programDocuments)),
    (connection, logger) =>
      createOnPremAdtClient(connection, logger).getProgram(
        resultsFor(programDocuments),
      ),
    withConfig(({ name }) => ({ programName: name })),
    analyseDeletion,
  ),
  // An include's deletion check is served on both variants, its deletion on
  // premise only (`ADT_TYPES_CLOUD` lists no `delete` for `PROG/I`).
  INCLUDE: boundTarget(
    'include',
    (c) => c.getInclude(resultsFor(includeDocuments)),
    (connection, logger) =>
      createOnPremAdtClient(connection, logger).getInclude(
        resultsFor(includeDocuments),
      ),
    withConfig(({ name }) => ({ includeName: name })),
    analyseDeletion,
  ),
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
  FUNCTION_MODULE: inCheckedGroupTarget(
    target(
      'functionModule',
      (c) => c.getFunctionModule(resultsFor(functionModuleDocuments)),
      ({ name, group }) => ({
        functionModuleName: name,
        ...(group !== undefined && { functionGroupName: group }),
      }),
    ),
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
