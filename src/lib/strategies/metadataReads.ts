/**
 * Each type's metadata read, one function per type: the one request the
 * type's `Get<Type>` handler sends for its metadata, and the read the
 * batched walks send for an object's description (spec §11). Both call the
 * same function, so the two requests cannot drift apart. Each read names its
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
import type {
  AdtTypeCode,
  AdtTypeCodeWith,
  IAdtError,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IServerAdtClient } from '../adtClientContract';
import { tableCodeOf } from '../adtTypeCode';
import type { ReadVersion } from '../handlers/readVersion';
import type { AdtReading } from './reading';
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

/**
 * The versions the walks read an object's description at: the request 22.0.x
 * sent, now stated. adt-clients 39 sent `active` for a metadata read without
 * a version of a service definition, a behavior definition, a function group
 * include, a package and an access control, and none for every other type —
 * ADT's working area, so an object that exists only inactive keeps its
 * description.
 */
const ACTIVE: ReadVersion = 'active';
const WORKING_AREA: ReadVersion = 'workingArea';

/** An object whose metadata is read. */
export interface MetadataTarget {
  type: string;
  name: string;
  /** The function group of a function module or a function group include. */
  functionGroup?: string;
}

/**
 * One object's metadata read on a client: the document as a verbatim
 * reading answers it (`AdtReading.raw`), or the document itself where the
 * type's read answers it whole (an enhancement spot's).
 */
export type MetadataRead = (
  client: Client,
) => Promise<IAdtResponse<AdtReading<string> | string, IAdtError>>;

type ReadOf = (target: MetadataTarget) => MetadataRead | undefined;

/** A read that needs the group the object was found in. */
const inGroup =
  (read: (group: string, t: MetadataTarget) => MetadataRead): ReadOf =>
  (t) =>
    t.functionGroup ? read(t.functionGroup, t) : undefined;

/**
 * Each ADT type's metadata read, with what the read takes from the object:
 * its name, and for a function module or include the group it was found in.
 * Each is read at the version 22.0.x read it (`ACTIVE`, `WORKING_AREA`).
 */
const READS = {
  'CLAS/OC': (t) => (c) =>
    readClassMetadata(c, { className: t.name }, WORKING_AREA),
  'INTF/OI': (t) => (c) =>
    readInterfaceMetadata(c, { interfaceName: t.name }, WORKING_AREA),
  'PROG/P': (t) => (c) =>
    readProgramMetadata(c, { programName: t.name }, WORKING_AREA),
  'DDLS/DF': (t) => (c) =>
    readDdlMetadata(c, { ddlName: t.name }, WORKING_AREA),
  'DDLX/EX': (t) => (c) =>
    readMetadataExtensionMetadata(c, { name: t.name }, WORKING_AREA),
  'DOMA/DD': (t) => (c) =>
    readDomainMetadata(c, { domainName: t.name }, WORKING_AREA),
  'DTEL/DE': (t) => (c) =>
    readDataElementMetadata(c, { dataElementName: t.name }, WORKING_AREA),
  'TABL/DT': (t) => (c) =>
    readTableMetadata(c, { tableName: t.name }, WORKING_AREA),
  'TABL/DS': (t) => (c) =>
    readStructureMetadata(c, { structureName: t.name }, WORKING_AREA),
  'FUGR/F': (t) => (c) =>
    readFunctionGroupMetadata(c, { functionGroupName: t.name }, WORKING_AREA),
  'FUGR/FF': inGroup(
    (group, t) => (c) =>
      readFunctionModuleMetadata(
        c,
        {
          functionModuleName: t.name,
          functionGroupName: group,
        },
        WORKING_AREA,
      ),
  ),
  'FUGR/I': inGroup(
    (group, t) => (c) =>
      readFunctionIncludeMetadata(
        c,
        {
          functionGroupName: group,
          includeName: t.name,
        },
        ACTIVE,
      ),
  ),
  'SRVD/SRV': (t) => (c) =>
    readServiceDefinitionMetadata(c, { serviceDefinitionName: t.name }, ACTIVE),
  'SRVB/SVB': (t) => (c) =>
    readServiceBindingMetadata(c, { bindingName: t.name }, WORKING_AREA),
  'BDEF/BDO': (t) => (c) =>
    readBehaviorDefinitionMetadata(c, { name: t.name }, ACTIVE),
  'DEVC/K': (t) => (c) =>
    readPackageMetadata(c, { packageName: t.name }, ACTIVE),
  'MSAG/N': (t) => (c) =>
    readMessageClassMetadata(c, { name: t.name }, WORKING_AREA),
  'ENHS/XSB': (t) => (c) =>
    readEnhancementSpotMetadata(c, { enhancementName: t.name }, WORKING_AREA),
  'DCLS/DL': (t) => (c) =>
    readAccessControlMetadata(c, { accessControlName: t.name }, ACTIVE),
} satisfies { readonly [C in MetadataCode]?: ReadOf };

/**
 * A code whose metadata a table reads (`readMetadata`), on premise or on
 * ABAP cloud: a key of {@link READS} outside them does not compile.
 */
type MetadataCode = AdtTypeCodeWith<'onprem' | 'cloud', 'readMetadata'>;

/** {@link READS}, read by any code of the tables. */
const READ_BY_CODE: Readonly<Partial<Record<AdtTypeCode, ReadOf>>> = READS;

/** The ADT types whose metadata is read. */
export const METADATA_READ_TYPES: readonly string[] = Object.keys(READS);

/**
 * `target`'s metadata read; `undefined` for a type with none. The type is
 * what SAP answered (a package listing), looked up against the tables.
 */
export function metadataReadOf(
  target: MetadataTarget,
): MetadataRead | undefined {
  const code = tableCodeOf(target.type);
  return code === undefined ? undefined : READ_BY_CODE[code]?.(target);
}

/**
 * The key of `target`'s metadata read — one read per key — or `undefined`
 * when its type has no metadata read here.
 */
export function metadataKeyOf(target: MetadataTarget): string | undefined {
  if (metadataReadOf(target) === undefined) return undefined;
  return [
    target.type.toUpperCase(),
    target.name.toUpperCase(),
    (target.functionGroup ?? '').toUpperCase(),
  ].join('|');
}
