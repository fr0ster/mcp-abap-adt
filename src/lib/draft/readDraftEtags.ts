/**
 * The draft tool's reads (spec §5): for each part of the object, its active,
 * inactive and working (`workingArea`) versions, each through a client built
 * with the `wireItself` reading, so the answer's `ETag` is read as it came.
 * The reads depend on nothing and are sent together: in batch mode they are
 * recorded in one batch (a `$batch` part keeps its `ETag`, measured).
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
  programDocuments,
  serviceDefinitionDocuments,
  structureDocuments,
  tableDocuments,
  tableTypeDocuments,
  wireItself,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IServerAdtClient } from '../adtClientContract';
import type { ProjectionVariant } from '../adtProjections';
import type { DraftEtags } from './draftOf';
import {
  type DraftObjectType,
  type DraftPart,
  draftPartsOf,
} from './draftTypes';

/** The object the draft tool reads. */
export interface DraftObject {
  readonly type: DraftObjectType;
  /** Upper-cased. */
  readonly name: string;
  /** A function module's group; `undefined` for every other type. */
  readonly functionGroup: string | undefined;
}

/** A version the reads ask for. */
export type DraftVersion = 'active' | 'inactive' | 'workingArea';

const VERSIONS = ['active', 'inactive', 'workingArea'] as const;

type WireRead = Promise<IAdtResponse<IAdtWireResponse, IAdtError>>;

const options = { analyse: analyseException };

/** One part's read at `version`. */
function readOf(
  client: IServerAdtClient,
  object: DraftObject,
  part: DraftPart,
  version: DraftVersion,
): WireRead {
  const name = object.name;
  const at = { ...options, version };
  switch (part) {
    case 'implementations':
      return client
        .getLocalTypes({ ...classDocuments, source: wireItself })
        .read({ className: name }, version, options);
    case 'definitions':
      return client
        .getLocalDefinitions({ ...classDocuments, source: wireItself })
        .read({ className: name }, version, options);
    case 'testclasses':
      return client
        .getLocalTestClass({ ...classDocuments, source: wireItself })
        .read({ className: name }, version, options);
    case 'macros':
      return client
        .getLocalMacros({ ...classDocuments, source: wireItself })
        .read({ className: name }, version, options);
    case 'main':
      break;
  }
  switch (object.type) {
    case 'PROGRAM':
      return client
        .getProgram({ ...programDocuments, source: wireItself })
        .read({ programName: name }, version, options);
    case 'INCLUDE':
      return client
        .getInclude({ ...includeDocuments, source: wireItself })
        .read({ includeName: name }, version, options);
    case 'INTERFACE':
      return client
        .getInterface({ ...interfaceDocuments, source: wireItself })
        .read({ interfaceName: name }, version, options);
    case 'CLASS':
    case 'BEHAVIOR_IMPLEMENTATION':
      return client
        .getClass({ ...classDocuments, source: wireItself })
        .read({ className: name }, version, options);
    case 'FUNCTION_MODULE':
      return client
        .getFunctionModule({ ...functionModuleDocuments, source: wireItself })
        .read(
          {
            functionModuleName: name,
            functionGroupName: object.functionGroup ?? '',
          },
          version,
          options,
        );
    case 'FUNCTION_GROUP':
      return client
        .getFunctionGroup({ ...functionGroupDocuments, metadata: wireItself })
        .readMetadata({ functionGroupName: name }, at);
    case 'DDL':
      return client
        .getDdl({ ...ddlDocuments, source: wireItself })
        .read({ ddlName: name }, version, options);
    case 'BEHAVIOR_DEFINITION':
      return client
        .getBehaviorDefinition({
          ...behaviorDefinitionDocuments,
          source: wireItself,
        })
        .read({ name }, version, options);
    case 'METADATA_EXTENSION':
      return client
        .getMetadataExtension({
          ...metadataExtensionDocuments,
          source: wireItself,
        })
        .read({ name }, version, options);
    case 'SERVICE_DEFINITION':
      return client
        .getServiceDefinition({
          ...serviceDefinitionDocuments,
          source: wireItself,
        })
        .read({ serviceDefinitionName: name }, version, options);
    case 'TABLE':
      return client
        .getTable({ ...tableDocuments, source: wireItself })
        .read({ tableName: name }, version, options);
    case 'STRUCTURE':
      return client
        .getStructure({ ...structureDocuments, source: wireItself })
        .read({ structureName: name }, version, options);
    case 'DOMAIN':
      return client
        .getDomain({ ...domainDocuments, metadata: wireItself })
        .readMetadata({ domainName: name }, at);
    case 'DATA_ELEMENT':
      return client
        .getDataElement({ ...dataElementDocuments, metadata: wireItself })
        .readMetadata({ dataElementName: name }, at);
    case 'TABLE_TYPE':
      return client
        .getTableType({ ...tableTypeDocuments, metadata: wireItself })
        .readMetadata({ tableTypeName: name }, at);
  }
}

/** An answer's `ETag`; `null` when it carried none. */
function etagOf(wire: IAdtWireResponse): string | null {
  for (const [key, value] of Object.entries(wire.headers)) {
    if (key.toLowerCase() !== 'etag') continue;
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return null;
  }
  return null;
}

/** What one read came to. */
type VersionRead =
  | { readonly kind: 'read'; readonly etag: string | null }
  | {
      readonly kind: 'absent';
      readonly failure: IAdtResponse<IAdtWireResponse, IAdtError>;
    }
  | {
      readonly kind: 'failed';
      readonly failure: IAdtResponse<IAdtWireResponse, IAdtError>;
    }
  | { readonly kind: 'threw'; readonly thrown: unknown };

async function settle(read: () => WireRead): Promise<VersionRead> {
  try {
    const answer = await read();
    if (answer.ok)
      return { kind: 'read', etag: etagOf(answer.getResult().value) };
    return answer.getError().response?.status === 404
      ? { kind: 'absent', failure: answer }
      : { kind: 'failed', failure: answer };
  } catch (thrown) {
    return { kind: 'threw', thrown };
  }
}

/** One part's ETags. */
export interface PartEtags {
  readonly part: DraftPart;
  readonly etags: DraftEtags;
}

/** The reads' outcome: every part's ETags, or the failure the tool answers. */
export type DraftReads =
  | { readonly ok: true; readonly parts: readonly PartEtags[] }
  | {
      readonly ok: false;
      readonly failure:
        | {
            readonly kind: 'answer';
            readonly response: IAdtResponse<IAdtWireResponse, IAdtError>;
          }
        | { readonly kind: 'threw'; readonly thrown: unknown };
    };

/**
 * Every part's three reads, sent together. A failed read is the tool's
 * answer, as its reads answer today (a `404` of the main part included: an
 * object that exists only inactive has no active version). An include whose
 * three reads all answer `404` does not exist and has no entry; one `404`
 * among an include's reads is that version's ETag `null`; when no part
 * answers at all, the object does not exist and its `404` is the answer.
 */
export async function readDraftEtags(
  client: IServerAdtClient,
  object: DraftObject,
  variant: ProjectionVariant,
): Promise<DraftReads> {
  const parts = draftPartsOf(object.type, variant);
  const reads = await Promise.all(
    parts.map((part) =>
      Promise.all(
        VERSIONS.map((version) =>
          settle(() => readOf(client, object, part, version)),
        ),
      ),
    ),
  );
  const answered: PartEtags[] = [];
  // The first `404` of an include whose three reads all answered it: the
  // answer when no part of the object answers at all.
  let absent: IAdtResponse<IAdtWireResponse, IAdtError> | undefined;
  for (const [index, part] of parts.entries()) {
    const [active, inactive, working] = reads[index] ?? [];
    if (
      active === undefined ||
      inactive === undefined ||
      working === undefined
    ) {
      continue;
    }
    const three = [active, inactive, working];
    for (const read of three) {
      if (read.kind === 'threw') {
        return { ok: false, failure: { kind: 'threw', thrown: read.thrown } };
      }
      if (
        read.kind === 'failed' ||
        (read.kind === 'absent' && part === 'main')
      ) {
        return {
          ok: false,
          failure: { kind: 'answer', response: read.failure },
        };
      }
    }
    if (three.every((read) => read.kind === 'absent')) {
      if (active.kind === 'absent') absent ??= active.failure;
      continue;
    }
    const etag = (read: VersionRead) =>
      read.kind === 'read' ? read.etag : null;
    answered.push({
      part,
      etags: {
        active: etag(active),
        inactive: etag(inactive),
        workspace: etag(working),
      },
    });
  }
  // No part answered — every include answered `404`: the object does not
  // exist, and the read's failure is the answer (on premise a class is read
  // by its includes alone).
  if (answered.length === 0 && absent !== undefined) {
    return { ok: false, failure: { kind: 'answer', response: absent } };
  }
  return { ok: true, parts: answered };
}
