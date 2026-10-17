/**
 * An object's metadata read, as this repository's `Get<Type>` handler reads
 * it: the same client member (`get<Type>().readMetadata(…)` with
 * `analyseException`), so the same URL and the same Accept header. The
 * batched walks read their objects' descriptions through these (spec §11).
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
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { createAdtClient } from '../clients';
import { resultsFor } from './resultSets';

type Client = ReturnType<typeof createAdtClient>;

/** An object whose metadata is read. */
export interface MetadataTarget {
  type: string;
  name: string;
  /** The function group of a function module. */
  functionGroup?: string;
}

type Read = (
  client: Client,
  target: MetadataTarget,
) => Promise<IAdtResponse<unknown, IAdtError>>;

const analyse = { analyse: analyseException };

/** Each ADT type's metadata read, as its `Get<Type>` handler sends it. */
const READS: Record<string, Read> = {
  'CLAS/OC': (c, t) =>
    c
      .getClass(resultsFor(classDocuments))
      .readMetadata({ className: t.name }, analyse),
  'INTF/OI': (c, t) =>
    c
      .getInterface(resultsFor(interfaceDocuments))
      .readMetadata({ interfaceName: t.name }, analyse),
  'PROG/P': (c, t) =>
    c
      .getProgram(resultsFor(programDocuments))
      .readMetadata({ programName: t.name }, analyse),
  'DDLS/DF': (c, t) =>
    c
      .getDdl(resultsFor(ddlDocuments))
      .readMetadata({ ddlName: t.name }, analyse),
  'DDLX/EX': (c, t) =>
    c
      .getMetadataExtension(resultsFor(metadataExtensionDocuments))
      .readMetadata({ name: t.name }, analyse),
  'DOMA/DD': (c, t) =>
    c
      .getDomain(resultsFor(domainDocuments))
      .readMetadata({ domainName: t.name }, analyse),
  'DTEL/DE': (c, t) =>
    c
      .getDataElement(resultsFor(dataElementDocuments))
      .readMetadata({ dataElementName: t.name }, analyse),
  'TABL/DT': (c, t) =>
    c
      .getTable(resultsFor(tableDocuments))
      .readMetadata({ tableName: t.name }, analyse),
  'TABL/DS': (c, t) =>
    c
      .getStructure(resultsFor(structureDocuments))
      .readMetadata({ structureName: t.name }, analyse),
  'FUGR/F': (c, t) =>
    c
      .getFunctionGroup(resultsFor(functionGroupDocuments))
      .readMetadata({ functionGroupName: t.name }, analyse),
  'FUGR/FF': (c, t) =>
    c.getFunctionModule(resultsFor(functionModuleDocuments)).readMetadata(
      {
        functionModuleName: t.name,
        functionGroupName: t.functionGroup as string,
      },
      analyse,
    ),
  'SRVD/SRV': (c, t) =>
    c
      .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
      .readMetadata({ serviceDefinitionName: t.name }, analyse),
  'SRVB/SVB': (c, t) =>
    c
      .getServiceBinding(resultsFor(serviceDocuments))
      .readMetadata({ bindingName: t.name }, analyse),
  'BDEF/BDO': (c, t) =>
    c
      .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
      .readMetadata({ name: t.name }, analyse),
  'DEVC/K': (c, t) =>
    c
      .getPackage(resultsFor(packageDocuments))
      .readMetadata({ packageName: t.name }, analyse),
  'MSAG/N': (c, t) =>
    c
      .getMessageClass(resultsFor(messageClassDocuments))
      .readMetadata({ name: t.name }, analyse),
} as unknown as Record<string, Read>;

/** The ADT types whose metadata is read. */
export const METADATA_READ_TYPES: readonly string[] = Object.keys(READS);

/** The read of `target`'s type; `undefined` for a type with none. */
function readOf(target: MetadataTarget): Read | undefined {
  const type = target.type.toUpperCase();
  if (type === 'FUGR/FF' && !target.functionGroup) return undefined;
  return READS[type];
}

/**
 * The key of `target`'s metadata read — one read per key — or `undefined`
 * when its type has no metadata read here.
 */
export function metadataKeyOf(target: MetadataTarget): string | undefined {
  if (readOf(target) === undefined) return undefined;
  return [
    target.type.toUpperCase(),
    target.name.toUpperCase(),
    (target.functionGroup ?? '').toUpperCase(),
  ].join('|');
}

/** `target`'s metadata read on `client`, as its `Get<Type>` handler sends it. */
export function readObjectMetadata(
  client: Client,
  target: MetadataTarget,
): Promise<IAdtResponse<unknown, IAdtError>> {
  const read = readOf(target);
  if (read === undefined) {
    return Promise.reject(
      new Error(`no metadata read for the type ${target.type}`),
    );
  }
  return read(client, target);
}
