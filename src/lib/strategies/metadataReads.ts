/**
 * Each type's metadata read, one function per type: the one request the
 * type's `Get<Type>` handler sends for its metadata, and the read the
 * batched walks send for an object's description (spec §11). Both call the
 * same function, so the two requests cannot drift apart.
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
  interfaceDocuments,
  messageClassDocuments,
  metadataExtensionDocuments,
  packageDocuments,
  programDocuments,
  serviceDefinitionDocuments,
  serviceDocuments,
  structureDocuments,
  tableDocuments,
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
import { resultsFor } from './resultSets';

type Client = IServerAdtClient;

const analysed = { analyse: analyseException };

/** A class's metadata (`GetClass`). */
export const readClassMetadata = (c: Client, config: { className: string }) =>
  c.getClass(resultsFor(classDocuments)).readMetadata(config, analysed);

/** An interface's metadata (`GetInterface`). */
export const readInterfaceMetadata = (
  c: Client,
  config: { interfaceName: string },
) =>
  c.getInterface(resultsFor(interfaceDocuments)).readMetadata(config, analysed);

/** A program's metadata (`GetProgram`). */
export const readProgramMetadata = (
  c: Client,
  config: { programName: string },
) => c.getProgram(resultsFor(programDocuments)).readMetadata(config, analysed);

/** A CDS view's metadata (`GetDdl`). */
export const readDdlMetadata = (c: Client, config: { ddlName: string }) =>
  c.getDdl(resultsFor(ddlDocuments)).readMetadata(config, analysed);

/** A metadata extension's metadata (`GetMetadataExtension`). */
export const readMetadataExtensionMetadata = (
  c: Client,
  config: { name: string },
) =>
  c
    .getMetadataExtension(resultsFor(metadataExtensionDocuments))
    .readMetadata(config, analysed);

/** A domain's metadata (`GetDomain`). */
export const readDomainMetadata = (c: Client, config: { domainName: string }) =>
  c.getDomain(resultsFor(domainDocuments)).readMetadata(config, analysed);

/** A data element's metadata (`GetDataElement`). */
export const readDataElementMetadata = (
  c: Client,
  config: { dataElementName: string },
) =>
  c
    .getDataElement(resultsFor(dataElementDocuments))
    .readMetadata(config, analysed);

/** A table's metadata (`GetTable`). */
export const readTableMetadata = (c: Client, config: { tableName: string }) =>
  c.getTable(resultsFor(tableDocuments)).readMetadata(config, analysed);

/** A structure's metadata (`GetStructure`). */
export const readStructureMetadata = (
  c: Client,
  config: { structureName: string },
) =>
  c.getStructure(resultsFor(structureDocuments)).readMetadata(config, analysed);

/** A function group's metadata (`GetFunctionGroup`). */
export const readFunctionGroupMetadata = (
  c: Client,
  config: { functionGroupName: string },
) =>
  c
    .getFunctionGroup(resultsFor(functionGroupDocuments))
    .readMetadata(config, analysed);

/** A function module's metadata, at its group (`GetFunctionModule`). */
export const readFunctionModuleMetadata = (
  c: Client,
  config: { functionModuleName: string; functionGroupName: string },
) =>
  c
    .getFunctionModule(resultsFor(functionModuleDocuments))
    .readMetadata(config, analysed);

/** A function group include's metadata, at its group (`GetFunctionInclude`). */
export const readFunctionIncludeMetadata = (
  c: Client,
  config: { functionGroupName: string; includeName: string },
) =>
  c
    .getFunctionInclude(resultsFor(functionIncludeDocuments))
    .readMetadata(config, analysed);

/** A service definition's metadata (`GetServiceDefinition`). */
export const readServiceDefinitionMetadata = (
  c: Client,
  config: { serviceDefinitionName: string },
) =>
  c
    .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
    .readMetadata(config, analysed);

/** A service binding's metadata (`GetServiceBinding`). */
export const readServiceBindingMetadata = (
  c: Client,
  config: { bindingName: string },
) =>
  c
    .getServiceBinding(resultsFor(serviceDocuments))
    .readMetadata(config, analysed);

/** A behavior definition's metadata (`GetBehaviorDefinition`). */
export const readBehaviorDefinitionMetadata = (
  c: Client,
  config: { name: string },
) =>
  c
    .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
    .readMetadata(config, analysed);

/** A package's metadata, at `version` (`GetPackage`). */
export const readPackageMetadata = (
  c: Client,
  config: { packageName: string },
  version: 'active' | 'inactive',
) =>
  c
    .getPackage(resultsFor(packageDocuments))
    .readMetadata(config, { version, analyse: analyseException });

/** A message class's metadata (`GetMessageClass`). */
export const readMessageClassMetadata = (c: Client, config: { name: string }) =>
  c
    .getMessageClass(resultsFor(messageClassDocuments))
    .readMetadata(config, analysed);

/** A BAdI enhancement spot's metadata (`GetEnhancementSpot`). */
export const readEnhancementSpotMetadata = (
  c: Client,
  config: { enhancementName: string },
) =>
  c
    .getEnhancement(enhancementDocuments)
    .readMetadata({ ...config, enhancementType: 'enhsxsb' as const }, analysed);

/** An access control's metadata (DCL source, `DCLS/DL`). */
export const readAccessControlMetadata = (
  c: Client,
  config: { accessControlName: string },
) =>
  c
    .getAccessControl(resultsFor(accessControlDocuments))
    .readMetadata(config, analysed);

/** An object whose metadata is read. */
export interface MetadataTarget {
  type: string;
  name: string;
  /** The function group of a function module or a function group include. */
  functionGroup?: string;
}

/** One object's metadata read on a client. */
export type MetadataRead = (
  client: Client,
) => Promise<IAdtResponse<unknown, IAdtError>>;

type ReadOf = (target: MetadataTarget) => MetadataRead | undefined;

/** A read that needs the group the object was found in. */
const inGroup =
  (read: (group: string, t: MetadataTarget) => MetadataRead): ReadOf =>
  (t) =>
    t.functionGroup ? read(t.functionGroup, t) : undefined;

/**
 * Each ADT type's metadata read, with what the read takes from the object:
 * its name, and for a function module or include the group it was found in.
 * A package is read active, as `GetPackage` reads it by default.
 */
const READS = {
  'CLAS/OC': (t) => (c) => readClassMetadata(c, { className: t.name }),
  'INTF/OI': (t) => (c) => readInterfaceMetadata(c, { interfaceName: t.name }),
  'PROG/P': (t) => (c) => readProgramMetadata(c, { programName: t.name }),
  'DDLS/DF': (t) => (c) => readDdlMetadata(c, { ddlName: t.name }),
  'DDLX/EX': (t) => (c) => readMetadataExtensionMetadata(c, { name: t.name }),
  'DOMA/DD': (t) => (c) => readDomainMetadata(c, { domainName: t.name }),
  'DTEL/DE': (t) => (c) =>
    readDataElementMetadata(c, { dataElementName: t.name }),
  'TABL/DT': (t) => (c) => readTableMetadata(c, { tableName: t.name }),
  'TABL/DS': (t) => (c) => readStructureMetadata(c, { structureName: t.name }),
  'FUGR/F': (t) => (c) =>
    readFunctionGroupMetadata(c, { functionGroupName: t.name }),
  'FUGR/FF': inGroup(
    (group, t) => (c) =>
      readFunctionModuleMetadata(c, {
        functionModuleName: t.name,
        functionGroupName: group,
      }),
  ),
  'FUGR/I': inGroup(
    (group, t) => (c) =>
      readFunctionIncludeMetadata(c, {
        functionGroupName: group,
        includeName: t.name,
      }),
  ),
  'SRVD/SRV': (t) => (c) =>
    readServiceDefinitionMetadata(c, { serviceDefinitionName: t.name }),
  'SRVB/SVB': (t) => (c) =>
    readServiceBindingMetadata(c, { bindingName: t.name }),
  'BDEF/BDO': (t) => (c) => readBehaviorDefinitionMetadata(c, { name: t.name }),
  'DEVC/K': (t) => (c) =>
    readPackageMetadata(c, { packageName: t.name }, 'active'),
  'MSAG/N': (t) => (c) => readMessageClassMetadata(c, { name: t.name }),
  'ENHS/XSB': (t) => (c) =>
    readEnhancementSpotMetadata(c, { enhancementName: t.name }),
  'DCLS/DL': (t) => (c) =>
    readAccessControlMetadata(c, { accessControlName: t.name }),
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
