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
import type { createAdtClient } from '../../../lib/clients';
import type { CheckedDeletable } from '../../../lib/strategies/checkedDeletion';
import { analyseDeletion } from '../../../lib/strategies/deletionRefusal';
import { resultsFor } from '../../../lib/strategies/resultSets';

type AdtClient = ReturnType<typeof createAdtClient>;

/** The object's names, upper-cased; a function module also names its group. */
export interface DeletionName {
  name: string;
  group?: string;
}

export interface DeletionTarget {
  /** The adt-clients object whose `checkDeletion` and `delete` are sent. */
  object(client: AdtClient): CheckedDeletable<any, any>;
  /** The configuration of both requests. */
  config(name: DeletionName, transportRequest?: string): object;
  /** How the deletion's own answer is read. */
  deleteAnalyse: IAnalyse<any>;
}

const target = (
  object: (client: AdtClient) => unknown,
  config: (name: DeletionName) => object,
  deleteAnalyse: IAnalyse<any> = analyseDeletion,
): DeletionTarget => ({
  object: object as DeletionTarget['object'],
  config: (name, transportRequest) => ({
    ...config(name),
    transportRequest,
  }),
  deleteAnalyse,
});

const asClass = (c: AdtClient) => c.getClass(resultsFor(classDocuments));

export const DELETION_TARGETS: Readonly<Record<string, DeletionTarget>> = {
  PACKAGE: target(
    (c) => c.getPackage(resultsFor(packageDocuments)),
    ({ name }) => ({ packageName: name }),
  ),
  DOMAIN: target(
    (c) => c.getDomain(resultsFor(domainDocuments)),
    ({ name }) => ({ domainName: name }),
  ),
  DATA_ELEMENT: target(
    (c) => c.getDataElement(resultsFor(dataElementDocuments)),
    ({ name }) => ({ dataElementName: name }),
  ),
  TABLE: target(
    (c) => c.getTable(resultsFor(tableDocuments)),
    ({ name }) => ({ tableName: name }),
  ),
  STRUCTURE: target(
    (c) => c.getStructure(resultsFor(structureDocuments)),
    ({ name }) => ({ structureName: name }),
  ),
  DDL: target(
    (c) => c.getDdl(resultsFor(ddlDocuments)),
    ({ name }) => ({ ddlName: name }),
  ),
  SERVICE_DEFINITION: target(
    (c) => c.getServiceDefinition(resultsFor(serviceDefinitionDocuments)),
    ({ name }) => ({ serviceDefinitionName: name }),
  ),
  SERVICE_BINDING: target(
    (c) => c.getServiceBinding(resultsFor(serviceDocuments)),
    ({ name }) => ({ bindingName: name }),
  ),
  CLASS: target(asClass, ({ name }) => ({ className: name })),
  CDS_UNIT_TEST: target(asClass, ({ name }) => ({ className: name })),
  PROGRAM: target(
    (c) => c.getProgram(resultsFor(programDocuments)),
    ({ name }) => ({ programName: name }),
  ),
  INTERFACE: target(
    (c) => c.getInterface(resultsFor(interfaceDocuments)),
    ({ name }) => ({ interfaceName: name }),
  ),
  FUNCTION_GROUP: target(
    (c) => c.getFunctionGroup(resultsFor(functionGroupDocuments)),
    ({ name }) => ({ functionGroupName: name }),
  ),
  FUNCTION_MODULE: target(
    (c) => c.getFunctionModule(resultsFor(functionModuleDocuments)),
    ({ name, group }) => ({
      functionModuleName: name,
      functionGroupName: group,
    }),
  ),
  BEHAVIOR_DEFINITION: target(
    (c) => c.getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments)),
    ({ name }) => ({ name }),
  ),
  BEHAVIOR_IMPLEMENTATION: target(
    (c) => c.getBehaviorImplementation(resultsFor(classDocuments)),
    ({ name }) => ({ className: name }),
  ),
  METADATA_EXTENSION: target(
    (c) => c.getMetadataExtension(resultsFor(metadataExtensionDocuments)),
    ({ name }) => ({ name }),
    analyseException,
  ),
};

/** The object types a deletion request removes. */
export const DELETION_TYPES = Object.keys(DELETION_TARGETS);
