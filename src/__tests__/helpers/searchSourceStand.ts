/**
 * The batch stand-in of `SearchSource`: a fake connection answering from a
 * small repository model — the node structures of the package walk, the
 * sources, the function groups' children and the package masks — envelopes
 * part by part, direct requests one by one. Real handler, real clients, real
 * `AdtBatchConnection`; only the connection is a fake.
 */
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
import { handleSearchSource } from '../../handlers/system/readonly/handleSearchSource';
import { createBatchAvailability } from '../../lib/batch/availability';
import {
  envelopeConnection,
  envelopeResponse as envelopeOf,
  type InnerRequest,
  type PartAnswer,
  type SeenEnvelope,
  statusError,
} from './batchEnvelope';
import { withinTurns } from './withinTurns';

export interface Obj {
  type: string;
  name: string;
}

export interface NodeDoc {
  objects?: Obj[];
  types?: Array<{ type: string; nodeId: string }>;
}

/** The repository the stand answers from. */
export interface Repository {
  /** Node structures, keyed by `nodeKey`. */
  nodes: Record<string, NodeDoc>;
  /** Sources, keyed `PROGRAM <name>`, `CLASS <name>`, `INCLUDE <name>`, `FM <name>`. */
  sources: Record<string, string>;
  /** A function group's children: `[objecttype, objectname]`. */
  fugrChildren: Record<string, Array<[string, string]>>;
  /** The packages each quickSearch mask finds. */
  masks: Record<string, string[]>;
}

const xmlNode = (doc: NodeDoc): string => {
  const objects = (doc.objects ?? [])
    .map(
      (o) =>
        `<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>${o.type}</OBJECT_TYPE><OBJECT_NAME>${o.name}</OBJECT_NAME><TECH_NAME>${o.name}</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/${o.name.toLowerCase()}</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>`,
    )
    .join('');
  const types = (doc.types ?? [])
    .map(
      (t) =>
        `<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>${t.type}</OBJECT_TYPE><NODE_ID>${t.nodeId}</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>${objects}</TREE_CONTENT><OBJECT_TYPES>${types}</OBJECT_TYPES></DATA></asx:values></asx:abap>`;
};

export const nodeKey = (name: string, nodeId?: string | null) => {
  const id = nodeId ?? '';
  return `NODE ${name}${id === '' || Number(id) === 0 ? '' : `#${Number(id)}`}`;
};

const structureXml = (repo: Repository, name: string) =>
  `<?xml version="1.0" encoding="utf-8"?><projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">${(
    repo.fugrChildren[name] ?? []
  )
    .map(
      ([type, child]) =>
        `<projectexplorer:node objecttype="${type}" objectname="${child}"/>`,
    )
    .join('')}</projectexplorer:objectstructure>`;

const searchXml = (names: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${names
    .map(
      (name) =>
        `<adtcore:objectReference adtcore:uri="/sap/bc/adt/packages/${name.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${name}" adtcore:packageName="${name}"/>`,
    )
    .join('')}</adtcore:objectReferences>`;

const segmentAfter = (path: string, marker: string): string => {
  const at = path.indexOf(marker);
  if (at < 0) return '';
  const rest = path.slice(at + marker.length);
  const end = rest.indexOf('/');
  return decodeURIComponent(end < 0 ? rest : rest.slice(0, end)).toUpperCase();
};

/** The key of any request the scan makes. */
export function keyOf(url: string, params?: unknown): string {
  const parsed = new URL(url, 'https://system.invalid');
  const query = new URLSearchParams(parsed.search);
  for (const [k, v] of Object.entries(
    (params ?? {}) as Record<string, unknown>,
  )) {
    query.set(k, String(v));
  }
  const path = parsed.pathname;
  if (path.endsWith('/repository/nodestructure')) {
    return nodeKey(query.get('parent_name') ?? '', query.get('node_id'));
  }
  if (path.endsWith('/informationsystem/search')) {
    return `SEARCH ${query.get('query')}`;
  }
  if (path.endsWith('/repository/objectstructure')) {
    return `STRUCTURE ${(query.get('objectname') ?? '').toUpperCase()}`;
  }
  if (path.includes('/fmodules/')) {
    return `FM ${segmentAfter(path, '/fmodules/')}`;
  }
  if (path.includes('/programs/includes/')) {
    return `INCLUDE ${segmentAfter(path, '/programs/includes/')}`;
  }
  if (path.includes('/programs/programs/')) {
    return `PROGRAM ${segmentAfter(path, '/programs/programs/')}`;
  }
  if (path.includes('/oo/classes/')) {
    return `CLASS ${segmentAfter(path, '/oo/classes/')}`;
  }
  return `OTHER ${path}`;
}

export interface Model {
  /** Requests answered with this status instead (a key of `keyOf`). */
  refuse?: Record<string, number>;
}

function answerOf(
  repo: Repository,
  model: Model,
  url: string,
  params?: unknown,
): PartAnswer {
  const key = keyOf(url, params);
  const refused = model.refuse?.[key];
  if (refused !== undefined) {
    return { status: refused, statusText: 'Refused', body: '' };
  }
  const xml = { 'content-type': 'application/xml' };
  const text = { 'content-type': 'text/plain' };
  if (key.startsWith('SEARCH ')) {
    const mask = key.slice('SEARCH '.length);
    return {
      status: 200,
      statusText: 'OK',
      headers: xml,
      body: searchXml(repo.masks[mask] ?? []),
    };
  }
  if (key.startsWith('STRUCTURE ')) {
    return {
      status: 200,
      statusText: 'OK',
      headers: xml,
      body: structureXml(repo, key.slice('STRUCTURE '.length)),
    };
  }
  const doc = repo.nodes[key];
  if (doc !== undefined) {
    return { status: 200, statusText: 'OK', headers: xml, body: xmlNode(doc) };
  }
  const source = repo.sources[key];
  if (source !== undefined) {
    return { status: 200, statusText: 'OK', headers: text, body: source };
  }
  return { status: 404, statusText: 'Not Found', body: '' };
}

export interface SystemOptions {
  envelope?: (parts: InnerRequest[]) => never;
  direct?: () => never;
  afterEnvelope?: (count: number) => void;
}

/**
 * The system: envelopes answered part by part, direct requests one by one;
 * `envelope` / `direct` replace either answer; `afterEnvelope` runs once each
 * envelope is answered (the clock moves there).
 */
export function standOn(
  repo: Repository,
  model: Model = {},
  options: SystemOptions = {},
) {
  let count = 0;
  return envelopeConnection(
    (parts: InnerRequest[]) => {
      if (options.envelope !== undefined) options.envelope(parts);
      const answered = envelopeOf(
        parts.map((p) => answerOf(repo, model, p.url)),
      );
      count += 1;
      options.afterEnvelope?.(count);
      return answered;
    },
    async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
      if (options.direct !== undefined) options.direct();
      const a = answerOf(repo, model, request.url, request.params);
      if (a.status >= 400) {
        throw statusError(a.status, a.statusText ?? '', a.body ?? '');
      }
      return {
        status: a.status,
        statusText: a.statusText ?? 'OK',
        headers: a.headers ?? {},
        data: a.body ?? '',
      } as IAdtWireResponse;
    },
  );
}

export type Fake = ReturnType<typeof standOn>;

/** A context on the fake: batch served (default) or known to be absent. */
export function contextOn(fake: Fake, batch: 'served' | 'absent' = 'served') {
  const port = createBatchAvailability();
  if (batch === 'absent') port.noteOuterStatus(404);
  return {
    connection: fake.connection,
    logger: undefined,
    batchAvailability: port,
  } as unknown as HandlerContext;
}

export const textOf = (result: unknown): string =>
  String(
    (result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '',
  );
export const payloadOf = (result: unknown) => JSON.parse(textOf(result));
export const isError = (result: unknown) =>
  (result as { isError?: boolean }).isError === true;

export const partKeys = (envelope: SeenEnvelope) =>
  envelope.parts.map((p) => keyOf(p.url));

/** `SearchSource` through the handler on the fake, bounded by event-loop turns. */
export const searchOn = (
  fake: Fake,
  args: Record<string, unknown>,
  absent = false,
  turns = 400,
) =>
  withinTurns(
    handleSearchSource(
      contextOn(fake, absent ? 'absent' : 'served'),
      args as never,
    ),
    turns,
  );

export const hitNames = (result: unknown) =>
  payloadOf(result).results.map(
    (h: { object_name: string; include: string }) =>
      `${h.object_name}/${h.include}`,
  );
