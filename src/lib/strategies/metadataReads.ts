/**
 * Each type's metadata read, one function per type: the one request the
 * type's `Get<Type>` handler sends for its metadata, and the one every
 * other path reading that metadata sends (the function module group
 * check), so the requests cannot drift apart. Each read names its
 * version: the caller's.
 */

import {
  accessControlDocuments,
  behaviorDefinitionDocuments,
  classDocuments,
  dataElementDocuments,
  ddlDocuments,
  domainDocuments,
  enhancementDocuments,
  functionGroupDocuments,
  functionIncludeDocuments,
  functionModuleDocuments,
  includeDocuments,
  interfaceDocuments,
  messageClassDocuments,
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
import type { IServerAdtClient } from '../adtClientContract';
import type { ReadVersion } from '../handlers/readVersion';
import { resultsFor } from './resultSets';

type Client = IServerAdtClient;

/** The options of a metadata read at `version`. */
const at = (version: ReadVersion) => ({
  version,
  analyse: analyseException,
});

/** A class's metadata (`GetClass`). */
export const readClassMetadata = (
  c: Client,
  config: { className: string },
  version: ReadVersion,
) => c.getClass(resultsFor(classDocuments)).readMetadata(config, at(version));

/** An interface's metadata (`GetInterface`). */
export const readInterfaceMetadata = (
  c: Client,
  config: { interfaceName: string },
  version: ReadVersion,
) =>
  c
    .getInterface(resultsFor(interfaceDocuments))
    .readMetadata(config, at(version));

/** A program's metadata (`GetProgram`). */
export const readProgramMetadata = (
  c: Client,
  config: { programName: string },
  version: ReadVersion,
) =>
  c.getProgram(resultsFor(programDocuments)).readMetadata(config, at(version));

/**
 * A program include's metadata (`GetInclude`). Not in {@link READS}: the
 * package walk's answers stay as they are.
 */
export const readIncludeMetadata = (
  c: Client,
  config: { includeName: string },
  version: ReadVersion,
) =>
  c.getInclude(resultsFor(includeDocuments)).readMetadata(config, at(version));

/**
 * A table type's metadata (`GetTableType`, `GetTypeInfo`). Not in
 * {@link READS}: the package walk's answers stay as they are.
 */
export const readTableTypeMetadata = (
  c: Client,
  config: { tableTypeName: string },
  version: ReadVersion,
) =>
  c
    .getTableType(resultsFor(tableTypeDocuments))
    .readMetadata(config, at(version));

/** A CDS view's metadata (`GetDdl`). */
export const readDdlMetadata = (
  c: Client,
  config: { ddlName: string },
  version: ReadVersion,
) => c.getDdl(resultsFor(ddlDocuments)).readMetadata(config, at(version));

/** A metadata extension's metadata (`GetMetadataExtension`). */
export const readMetadataExtensionMetadata = (
  c: Client,
  config: { name: string },
  version: ReadVersion,
) =>
  c
    .getMetadataExtension(resultsFor(metadataExtensionDocuments))
    .readMetadata(config, at(version));

/** A domain's metadata (`GetDomain`). */
export const readDomainMetadata = (
  c: Client,
  config: { domainName: string },
  version: ReadVersion,
) => c.getDomain(resultsFor(domainDocuments)).readMetadata(config, at(version));

/** A data element's metadata (`GetDataElement`). */
export const readDataElementMetadata = (
  c: Client,
  config: { dataElementName: string },
  version: ReadVersion,
) =>
  c
    .getDataElement(resultsFor(dataElementDocuments))
    .readMetadata(config, at(version));

/** A table's metadata (`GetTable`). */
export const readTableMetadata = (
  c: Client,
  config: { tableName: string },
  version: ReadVersion,
) => c.getTable(resultsFor(tableDocuments)).readMetadata(config, at(version));

/** A structure's metadata (`GetStructure`). */
export const readStructureMetadata = (
  c: Client,
  config: { structureName: string },
  version: ReadVersion,
) =>
  c
    .getStructure(resultsFor(structureDocuments))
    .readMetadata(config, at(version));

/** A function group's metadata (`GetFunctionGroup`). */
export const readFunctionGroupMetadata = (
  c: Client,
  config: { functionGroupName: string },
  version: ReadVersion,
) =>
  c
    .getFunctionGroup(resultsFor(functionGroupDocuments))
    .readMetadata(config, at(version));

/** A function module's metadata, at its group (`GetFunctionModule`). */
export const readFunctionModuleMetadata = (
  c: Client,
  config: { functionModuleName: string; functionGroupName: string },
  version: ReadVersion,
) =>
  c
    .getFunctionModule(resultsFor(functionModuleDocuments))
    .readMetadata(config, at(version));

/** A function group include's metadata, at its group (`GetFunctionInclude`). */
export const readFunctionIncludeMetadata = (
  c: Client,
  config: { functionGroupName: string; includeName: string },
  version: ReadVersion,
) =>
  c
    .getFunctionInclude(resultsFor(functionIncludeDocuments))
    .readMetadata(config, at(version));

/** A service definition's metadata (`GetServiceDefinition`). */
export const readServiceDefinitionMetadata = (
  c: Client,
  config: { serviceDefinitionName: string },
  version: ReadVersion,
) =>
  c
    .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
    .readMetadata(config, at(version));

/** A service binding's metadata (`GetServiceBinding`). */
export const readServiceBindingMetadata = (
  c: Client,
  config: { bindingName: string },
  version: ReadVersion,
) =>
  c
    .getServiceBinding(resultsFor(serviceDocuments))
    .readMetadata(config, at(version));

/** A behavior definition's metadata (`GetBehaviorDefinition`). */
export const readBehaviorDefinitionMetadata = (
  c: Client,
  config: { name: string },
  version: ReadVersion,
) =>
  c
    .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
    .readMetadata(config, at(version));

/** A package's metadata, at `version` (`GetPackage`). */
export const readPackageMetadata = (
  c: Client,
  config: { packageName: string },
  version: ReadVersion,
) =>
  c.getPackage(resultsFor(packageDocuments)).readMetadata(config, at(version));

/** A message class's metadata (`GetMessageClass`). */
export const readMessageClassMetadata = (
  c: Client,
  config: { name: string },
  version: ReadVersion,
) =>
  c
    .getMessageClass(resultsFor(messageClassDocuments))
    .readMetadata(config, at(version));

/** A BAdI enhancement spot's metadata (`GetEnhancementSpot`). */
export const readEnhancementSpotMetadata = (
  c: Client,
  config: { enhancementName: string },
  version: ReadVersion,
) =>
  c
    .getEnhancement(enhancementDocuments)
    .readMetadata(
      { ...config, enhancementType: 'enhsxsb' as const },
      at(version),
    );

/** An access control's metadata (DCL source, `DCLS/DL`). */
export const readAccessControlMetadata = (
  c: Client,
  config: { accessControlName: string },
  version: ReadVersion,
) =>
  c
    .getAccessControl(resultsFor(accessControlDocuments))
    .readMetadata(config, at(version));
