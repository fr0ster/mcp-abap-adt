/**
 * The package walks on internal batches (spec §11, rows `GetPackageContents`
 * / `HandlerGet` part `contents`, `GetPackageTree`, `GetObjectsList`,
 * `GetObjectInfo`): each level's independent requests go in one envelope,
 * the answer is the sequential version's, several roots share the envelopes,
 * a part's failure is its root's, a credential refusal ends the call as it
 * came, and a destination with no communication batch runs the sequential
 * reads.
 *
 * Real handlers, real clients, real `AdtBatchConnection`; only the connection
 * is a fake, answering from a small repository model (its node structure
 * documents written as the captured `read-object-tree-structure` fixtures
 * write them) and, for the single-package cases, from that corpus itself.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleHandlerGet } from '../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import type { HandlerContext } from '../../../handlers/interfaces';
import {
  TOOL_DEFINITION as GetPackageContents,
  handleGetPackageContents as handleGetPackageContentsOf,
} from '../../../handlers/package/readonly/handleGetPackageContents';
import {
  TOOL_DEFINITION as GetObjectsList,
  handleGetObjectsList as handleGetObjectsListOf,
} from '../../../handlers/search/readonly/handleGetObjectsList';
import {
  TOOL_DEFINITION as GetPackageTree,
  handleGetPackageTree as handleGetPackageTreeOf,
} from '../../../handlers/system/high/handleGetPackageTree';
import { handleGetObjectInfo } from '../../../handlers/system/readonly/handleGetObjectInfo';
import { createBatchAvailability } from '../../../lib/batch/availability';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import { NODE_READ_CONCURRENCY } from '../../../lib/strategies/packageWalk';
import { corpusBody, corpusSidecar } from '../../helpers/adtCorpus';
import { assertMatchObject } from '../../helpers/assertions';
import {
  envelopeConnection,
  envelopeResponse as envelopeOf,
  type InnerRequest,
  type PartAnswer,
  type SeenEnvelope,
  statusError,
} from '../../helpers/batchEnvelope';
import { schemaWords } from '../../helpers/schemaWords';
import { withinTurns } from '../../helpers/withinTurns';

/** handleGetObjectsList at `detail: 'full'`, the answer before `detail` these cases compare (terse answers, step 3). */
const handleGetObjectsList = (
  context: Parameters<typeof handleGetObjectsListOf>[0],
  args: Parameters<typeof handleGetObjectsListOf>[1],
) => handleGetObjectsListOf(context, { detail: 'full', ...args });

/** handleGetPackageTree at `detail: 'full'`, the answer before `detail` these cases compare (terse answers, step 3). */
const handleGetPackageTree = (
  context: Parameters<typeof handleGetPackageTreeOf>[0],
  args: Parameters<typeof handleGetPackageTreeOf>[1],
) => handleGetPackageTreeOf(context, { detail: 'full', ...args });

/** handleGetPackageContents at `detail: 'full'`, the answer before `detail` these cases compare (terse answers, step 3). */
const handleGetPackageContents = (
  context: Parameters<typeof handleGetPackageContentsOf>[0],
  args: Parameters<typeof handleGetPackageContentsOf>[1],
) => handleGetPackageContentsOf(context, { detail: 'full', ...args });

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

// ---------------------------------------------------------------------------
// The repository model
// ---------------------------------------------------------------------------

interface Obj {
  type: string;
  name: string;
  description?: string;
}

interface NodeDoc {
  objects?: Obj[];
  types?: Array<{ type: string; nodeId: string }>;
}

const xmlNode = (doc: NodeDoc): string => {
  const objects = (doc.objects ?? [])
    .map(
      (o) =>
        `<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>${o.type}</OBJECT_TYPE><OBJECT_NAME>${o.name}</OBJECT_NAME><TECH_NAME>${o.name}</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/${o.name.toLowerCase()}</OBJECT_URI>${o.description ? `<DESCRIPTION>${o.description}</DESCRIPTION>` : ''}</SEU_ADT_REPOSITORY_OBJ_NODE>`,
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

/** The key of a node structure request: parent type, name, node id (root: ''). */
const nodeKey = (type: string, name: string, nodeId?: string | null) => {
  const id = nodeId ?? '';
  return `${type}|${name}|${id === '' || Number(id) === 0 ? '' : String(Number(id))}`;
};

/**
 * Two root packages, each with one subpackage; two programs whose node
 * structures nest three levels deep.
 */
const NODES: Record<string, NodeDoc> = {
  [nodeKey('DEVC/K', 'ZROOT_A')]: {
    types: [
      { type: 'DEVC/K', nodeId: '000010' },
      { type: 'CLAS/OC', nodeId: '000020' },
    ],
  },
  [nodeKey('DEVC/K', 'ZROOT_A', '10')]: {
    objects: [{ type: 'DEVC/K', name: 'ZSUB_A', description: 'Sub A' }],
  },
  [nodeKey('DEVC/K', 'ZROOT_A', '20')]: {
    objects: [{ type: 'CLAS/OC', name: 'ZCL_A', description: 'Class A' }],
  },
  [nodeKey('DEVC/K', 'ZSUB_A')]: {
    types: [{ type: 'PROG/P', nodeId: '000030' }],
  },
  [nodeKey('DEVC/K', 'ZSUB_A', '30')]: {
    objects: [{ type: 'PROG/P', name: 'ZPROG_A', description: 'Program A' }],
  },
  [nodeKey('DEVC/K', 'ZROOT_B')]: {
    types: [
      { type: 'DEVC/K', nodeId: '000010' },
      { type: 'INTF/OI', nodeId: '000040' },
    ],
  },
  [nodeKey('DEVC/K', 'ZROOT_B', '10')]: {
    objects: [{ type: 'DEVC/K', name: 'ZSUB_B' }],
  },
  [nodeKey('DEVC/K', 'ZROOT_B', '40')]: {
    objects: [{ type: 'INTF/OI', name: 'ZIF_B', description: 'Interface B' }],
  },
  [nodeKey('DEVC/K', 'ZSUB_B')]: {
    types: [{ type: 'PROG/P', nodeId: '000030' }],
  },
  [nodeKey('DEVC/K', 'ZSUB_B', '30')]: {
    objects: [{ type: 'PROG/P', name: 'ZPROG_B' }],
  },
  [nodeKey('PROG/P', 'ZPROG_X')]: {
    types: [
      { type: 'PROG/I', nodeId: '000101' },
      { type: 'PROG/PX', nodeId: '000102' },
    ],
  },
  [nodeKey('PROG/P', 'ZPROG_X', '101')]: {
    objects: [{ type: 'PROG/I', name: 'ZINCL_X1', description: 'Include X1' }],
    types: [{ type: 'PROG/PY', nodeId: '000103' }],
  },
  [nodeKey('PROG/P', 'ZPROG_X', '102')]: {
    objects: [{ type: 'PROG/PX', name: 'ZEVENT_X', description: 'Event X' }],
  },
  [nodeKey('PROG/P', 'ZPROG_X', '103')]: {
    objects: [{ type: 'PROG/PY', name: 'ZFORM_X', description: 'Form X' }],
  },
  [nodeKey('PROG/P', 'ZPROG_Y')]: {
    types: [{ type: 'PROG/I', nodeId: '000101' }],
  },
  [nodeKey('PROG/P', 'ZPROG_Y', '101')]: {
    objects: [{ type: 'PROG/I', name: 'ZINCL_Y1', description: 'Include Y1' }],
    types: [{ type: 'PROG/PY', nodeId: '000103' }],
  },
  [nodeKey('PROG/P', 'ZPROG_Y', '103')]: {
    objects: [{ type: 'PROG/PY', name: 'ZFORM_Y', description: 'Form Y' }],
  },
};

/** The corpus package: its root and one level per object type. */
function corpusNodes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 1; i <= 8; i++) {
    const file = `read-object-tree-structure--0${i}-nodestructure`;
    const params = corpusSidecar(file).request.params ?? {};
    out[nodeKey(params.parent_type, params.parent_name, params.node_id)] =
      corpusBody(file);
  }
  return out;
}
const CORPUS = corpusNodes();

/**
 * What each object's metadata says of it, read from the node structure
 * documents the system answers to a request sent alone: every object by its
 * `OBJECT_URI` and by its name (the last segment of its metadata address —
 * the model's objects carry no real address), with its description.
 */
function metadataIndex(): {
  known: Set<string>;
  byUri: Map<string, string | undefined>;
  byName: Map<string, string>;
} {
  const known = new Set<string>();
  const byUri = new Map<string, string | undefined>();
  const byName = new Map<string, string>();
  const bodies = [
    ...Object.values(CORPUS),
    ...Object.values(NODES).map(xmlNode),
  ];
  for (const body of bodies) {
    for (const node of body.matchAll(
      /<SEU_ADT_REPOSITORY_OBJ_NODE>([\s\S]*?)<\/SEU_ADT_REPOSITORY_OBJ_NODE>/g,
    )) {
      const field = (name: string) =>
        new RegExp(`<${name}>([^<]*)</${name}>`).exec(node[1] ?? '')?.[1];
      const name = field('OBJECT_NAME') ?? '';
      known.add(name);
      const description = field('DESCRIPTION');
      const uri = field('OBJECT_URI');
      if (uri !== undefined) byUri.set(uri, description);
      if (description !== undefined) byName.set(name, description);
    }
  }
  return { known, byUri, byName };
}
const METADATA = metadataIndex();

const described = (description: string | undefined) =>
  description === undefined
    ? ''
    : ` adtcore:description="${description.replaceAll('"', '&quot;')}"`;

const PACKAGE_XML = (name: string) =>
  `<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${name}" adtcore:type="DEVC/K"${described(METADATA.byName.get(name))}/>`;

/** An object's metadata document: its root element and its description. */
const OBJECT_XML = (path: string, name: string) =>
  `<?xml version="1.0" encoding="utf-8"?><adtcore:mainObject xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${name}"${described(METADATA.byUri.has(path) ? METADATA.byUri.get(path) : METADATA.byName.get(name))}/>`;

/** The object a metadata address names: its last segment, upper case. */
const nameAt = (path: string) =>
  decodeURIComponent(path.split('/').pop() ?? '').toUpperCase();

const SEARCH_XML = (name: string, type: string) =>
  `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/x/${name.toLowerCase()}" adtcore:type="${type}" adtcore:name="${name}" adtcore:packageName="ZPARENT" adtcore:description="Found ${name}"/></adtcore:objectReferences>`;

interface Model {
  /** Requests answered with this status instead (a key of `keyOf`). */
  refuse?: Record<string, number>;
  /** The body a refused request is answered with (default: none). */
  refuseBody?: Record<string, string>;
}

/** The key of any request: a node structure's, else `METHOD path`. */
function keyOf(method: string, url: string, params?: unknown): string {
  const parsed = new URL(url, 'https://system.invalid');
  const query = new URLSearchParams(parsed.search);
  for (const [k, v] of Object.entries(
    (params ?? {}) as Record<string, unknown>,
  )) {
    query.set(k, String(v));
  }
  if (parsed.pathname.endsWith('/repository/nodestructure')) {
    return nodeKey(
      query.get('parent_type') ?? '',
      query.get('parent_name') ?? '',
      query.get('node_id'),
    );
  }
  if (parsed.pathname.endsWith('/informationsystem/search')) {
    return `SEARCH|${query.get('query')}`;
  }
  return `${method} ${parsed.pathname}`;
}

function answerOf(
  model: Model,
  method: string,
  url: string,
  params?: unknown,
): PartAnswer {
  const key = keyOf(method, url, params);
  const refused = model.refuse?.[key];
  if (refused !== undefined) {
    return {
      status: refused,
      statusText: 'Refused',
      body: model.refuseBody?.[key] ?? '',
    };
  }
  const xml = { 'content-type': 'application/xml' };
  if (key.startsWith('SEARCH|')) {
    const name = key.slice('SEARCH|'.length);
    return {
      status: 200,
      statusText: 'OK',
      headers: xml,
      body: SEARCH_XML(name, 'DEVC/K'),
    };
  }
  if (key.startsWith('GET /sap/bc/adt/packages/')) {
    const name = decodeURIComponent(key.split('/').pop() ?? '').toUpperCase();
    return {
      status: 200,
      statusText: 'OK',
      headers: xml,
      body: PACKAGE_XML(name),
    };
  }
  const path = key.startsWith('GET ') ? key.slice('GET '.length) : '';
  if (
    path !== '' &&
    (METADATA.byUri.has(path) || METADATA.known.has(nameAt(path)))
  ) {
    return {
      status: 200,
      statusText: 'OK',
      headers: xml,
      body: OBJECT_XML(path, nameAt(path)),
    };
  }
  const corpus = CORPUS[key];
  if (corpus !== undefined) {
    return { status: 200, statusText: 'OK', headers: xml, body: corpus };
  }
  const doc = NODES[key];
  if (doc !== undefined) {
    return { status: 200, statusText: 'OK', headers: xml, body: xmlNode(doc) };
  }
  return { status: 404, statusText: 'Not Found', body: '' };
}

/**
 * A node structure request sent alone with `withShortDescriptions: false` is
 * answered without `DESCRIPTION`; inside an envelope SAP ignores the flag
 * (measured, 2026-10-18), so an envelope part keeps them.
 */
function alone(request: IAbapRequestOptions, body: string): string {
  const flag = (
    request.params as { withShortDescriptions?: unknown } | undefined
  )?.withShortDescriptions;
  return request.url.includes('/repository/nodestructure') && flag === false
    ? body.replace(/<DESCRIPTION>[^<]*<\/DESCRIPTION>|<DESCRIPTION\/>/g, '')
    : body;
}

/**
 * The system: envelopes answered part by part, direct requests one by one;
 * `envelope` / `direct` replace either answer (a refusal thrown).
 */
function system(
  model: Model = {},
  envelope?: () => never,
  direct?: () => never,
) {
  return envelopeConnection(
    envelope ??
      ((parts: InnerRequest[]) => {
        const answered = parts.map((p) => answerOf(model, p.method, p.url));
        return envelopeOf(answered);
      }),
    async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
      if (direct !== undefined) direct();
      const a = answerOf(model, request.method, request.url, request.params);
      if (a.status >= 400) {
        throw statusError(a.status, a.statusText ?? '', a.body ?? '');
      }
      return {
        status: a.status,
        statusText: a.statusText ?? 'OK',
        headers: a.headers ?? {},
        data: alone(request, a.body ?? ''),
      } as IAdtWireResponse;
    },
  );
}

type Fake = ReturnType<typeof system>;

/** A context on the fake: batch served (default) or known to be absent. */
function contextOn(fake: Fake, batch: 'served' | 'absent' = 'served') {
  const port = createBatchAvailability();
  if (batch === 'absent') port.noteOuterStatus(404);
  return {
    connection: fake.connection,
    logger: undefined,
    batchAvailability: port,
  } as unknown as HandlerContext;
}

const textOf = (result: unknown): string =>
  String(
    (result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '',
  );
const payloadOf = (result: unknown) => JSON.parse(textOf(result));

/** The node structure keys an envelope asked. */
const partKeys = (envelope: SeenEnvelope) =>
  envelope.parts.map((p) => keyOf(p.method, p.url));

/**
 * Whether every part of every envelope was known before that envelope was
 * sent: asked by the caller (`roots`), or named by an answer of an earlier
 * envelope — a type node, a child node, a subpackage. A part named only by
 * an answer of its own envelope needed another part's answer.
 */
function eachPartKnownBefore(
  envelopes: SeenEnvelope[],
  roots: string[],
  model: Model = {},
): void {
  const known = new Set(roots);
  for (const envelope of envelopes) {
    for (const key of partKeys(envelope)) {
      if (key.startsWith('SEARCH|') || key.startsWith('GET ')) continue;
      assert.deepStrictEqual(
        { key, known: known.has(key) },
        { key, known: true },
      );
    }
    for (const part of envelope.parts) {
      const key = keyOf(part.method, part.url);
      const [type = '', name = ''] = key.split('|');
      const answered = answerOf(model, part.method, part.url);
      const body = answered.body ?? '';
      for (const m of body.matchAll(/<NODE_ID>(\d+)<\/NODE_ID>/g)) {
        known.add(nodeKey(type, name, m[1]));
      }
      for (const m of body.matchAll(
        /<OBJECT_TYPE>DEVC\/K<\/OBJECT_TYPE><OBJECT_NAME>([^<]+)<\/OBJECT_NAME>/g,
      )) {
        known.add(nodeKey('DEVC/K', m[1] ?? ''));
      }
    }
  }
}

/** The connection's refusal of the credential, before SAP was asked. */
const credential = () =>
  new AuthRefusedError(
    authError['credential-refused']({ credential: 'token' }),
    'request',
  );

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

describe('GetPackageContents', () => {
  const walk = {
    include_subpackages: true,
    max_depth: 2,
  };

  it('same answer as the sequential version', async () => {
    const batched = system();
    const sequential = system();
    const a = await withinTurns(
      handleGetPackageContents(contextOn(batched), {
        package_name: 'ZROOT_A',
        ...walk,
      }),
    );
    const b = await withinTurns(
      handleGetPackageContents(contextOn(sequential, 'absent'), {
        package_name: 'ZROOT_A',
        ...walk,
      }),
    );
    assert.equal(textOf(a), textOf(b));
    assert.deepStrictEqual(
      payloadOf(a).map((i: { name: string }) => i.name),
      ['ZSUB_A', 'ZCL_A', 'ZPROG_A'],
    );
    // The corpus package answers the same both ways too.
    const c = await withinTurns(
      handleGetPackageContents(contextOn(system()), {
        package_name: 'ZMCP_SHR_PKG',
      }),
    );
    const d = await withinTurns(
      handleGetPackageContents(contextOn(system(), 'absent'), {
        package_name: 'ZMCP_SHR_PKG',
      }),
    );
    assert.equal(textOf(c), textOf(d));
    assert.ok(payloadOf(c).length > 20);
  });

  it("envelopes per spec §11's row (per level: roots, then type nodes)", async () => {
    const fake = system();
    await withinTurns(
      handleGetPackageContents(contextOn(fake), {
        package_name: 'ZROOT_A',
        ...walk,
      }),
    );
    assert.deepStrictEqual(fake.envelopes.map(partKeys), [
      [nodeKey('DEVC/K', 'ZROOT_A')],
      [nodeKey('DEVC/K', 'ZROOT_A', '10'), nodeKey('DEVC/K', 'ZROOT_A', '20')],
      [nodeKey('DEVC/K', 'ZSUB_A')],
      [nodeKey('DEVC/K', 'ZSUB_A', '30')],
    ]);
    assert.equal(fake.directs.length, 0);
  });

  it('no envelope holds a request needing another of its parts', async () => {
    const fake = system();
    await withinTurns(
      handleGetPackageContents(contextOn(fake), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        ...walk,
      }),
    );
    eachPartKnownBefore(fake.envelopes, [
      nodeKey('DEVC/K', 'ZROOT_A'),
      nodeKey('DEVC/K', 'ZROOT_B'),
    ]);
  });

  it('several roots: the envelope count does not grow with their number', async () => {
    const one = system();
    const two = system();
    await withinTurns(
      handleGetPackageContents(contextOn(one), {
        package_names: ['ZROOT_A'],
        ...walk,
      }),
    );
    const result = await withinTurns(
      handleGetPackageContents(contextOn(two), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        ...walk,
      }),
    );
    assert.equal(two.envelopes.length, one.envelopes.length);
    assert.equal(two.envelopes.length, 4);
    const entries = payloadOf(result);
    assert.deepStrictEqual(
      entries.map((e: { package_name: string }) => e.package_name),
      ['ZROOT_A', 'ZROOT_B'],
    );
    assert.deepStrictEqual(
      entries[1].objects.map((i: { name: string }) => i.name),
      ['ZSUB_B', 'ZIF_B', 'ZPROG_B'],
    );
  });

  it("a part failure is that item's", async () => {
    const model = { refuse: { [nodeKey('DEVC/K', 'ZSUB_B', '30')]: 500 } };
    const result = await withinTurns(
      handleGetPackageContents(contextOn(system(model)), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        ...walk,
      }),
    );
    assert.equal((result as { isError?: boolean }).isError, false);
    const [a, b] = payloadOf(result);
    assert.equal(a.objects.length, 3);
    assert.equal(b.package_name, 'ZROOT_B');
    assert.equal(b.objects, undefined);
    assertMatchObject(b.error, {
      status: 500,
      step: 'read package node structure',
    });
  });

  it('credential refusal ends the call as it came', async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetPackageContents(contextOn(fake), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        ...walk,
      }),
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
    assert.equal(fake.envelopes.length, 1);
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetPackageContents(contextOn(fake, 'absent'), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        ...walk,
      }),
    );
    assert.equal(fake.envelopes.length, 0);
    assert.equal(fake.directs.length, 10);
    assert.equal(payloadOf(result).length, 2);
  });

  it('credential refusal on the sequential path ends the call as it came', async () => {
    const fake = system({}, undefined, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetPackageContents(contextOn(fake, 'absent'), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        ...walk,
      }),
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
    assert.equal(fake.directs.length, 1);
  });

  it('a missing single argument keeps its words; both given is refused, by the schema', () => {
    assert.ok(
      schemaWords(GetPackageContents, {
        package_name: 'ZROOT_A',
        package_names: ['ZROOT_B'],
      }).includes('Give exactly one of package_name or package_names'),
    );
    assert.ok(
      schemaWords(GetPackageContents, {}).includes('Package name is required'),
    );
  });
});

describe('HandlerGet part contents', () => {
  const contents = (extra: Record<string, unknown>) => ({
    object_type: 'PACKAGE' as const,
    part: 'contents' as const,
    ...extra,
  });

  it('same answer as the sequential version', async () => {
    const a = await withinTurns(
      handleHandlerGet(
        contextOn(system()),
        contents({ package_name: 'ZMCP_SHR_PKG' }),
      ) as Promise<unknown>,
    );
    const b = await withinTurns(
      handleHandlerGet(
        contextOn(system(), 'absent'),
        contents({ package_name: 'ZMCP_SHR_PKG' }),
      ) as Promise<unknown>,
    );
    assert.equal(textOf(a), textOf(b));
    // GetPackageContents' terse answer (compact parity).
    assert.equal(
      textOf(a).startsWith('type\tname\ttech_name\turi\n# package '),
      true,
    );
  });

  it("envelopes per spec §11's row (per level: roots, then type nodes)", async () => {
    const fake = system();
    await withinTurns(
      handleHandlerGet(
        contextOn(fake),
        contents({ package_name: 'ZROOT_A' }),
      ) as Promise<unknown>,
    );
    assert.deepStrictEqual(fake.envelopes.map(partKeys), [
      [nodeKey('DEVC/K', 'ZROOT_A')],
      [nodeKey('DEVC/K', 'ZROOT_A', '10'), nodeKey('DEVC/K', 'ZROOT_A', '20')],
    ]);
  });

  it('no envelope holds a request needing another of its parts', async () => {
    const fake = system();
    await withinTurns(
      handleHandlerGet(
        contextOn(fake),
        contents({ package_names: ['ZROOT_A', 'ZROOT_B'] }),
      ) as Promise<unknown>,
    );
    eachPartKnownBefore(fake.envelopes, [
      nodeKey('DEVC/K', 'ZROOT_A'),
      nodeKey('DEVC/K', 'ZROOT_B'),
    ]);
  });

  it('several roots: the envelope count does not grow with their number', async () => {
    const fake = system();
    const result = await withinTurns(
      handleHandlerGet(
        contextOn(fake),
        contents({ package_names: ['ZROOT_A', 'ZROOT_B'] }),
      ) as Promise<unknown>,
    );
    assert.equal(fake.envelopes.length, 2);
    // GetPackageContents' terse answer for several packages (compact parity).
    assert.equal(
      textOf(result),
      [
        '# asked ZROOT_A',
        'type\tname\ttech_name\turi',
        '# package ZROOT_A',
        'DEVC/K\tZSUB_A\t\t',
        'CLAS/OC\tZCL_A\t\t',
        '# asked ZROOT_B',
        'type\tname\ttech_name\turi',
        '# package ZROOT_B',
        'DEVC/K\tZSUB_B\t\t',
        'INTF/OI\tZIF_B\t\t',
      ].join('\n'),
    );
  });

  it("a part failure is that item's", async () => {
    const model = { refuse: { [nodeKey('DEVC/K', 'ZROOT_B', '40')]: 403 } };
    const result = await withinTurns(
      handleHandlerGet(
        contextOn(system(model)),
        contents({ package_names: ['ZROOT_A', 'ZROOT_B'] }),
      ) as Promise<unknown>,
    );
    const [a = '', b = ''] = textOf(result).split('# asked ZROOT_B');
    assert.ok(a.includes('CLAS/OC\tZCL_A'));
    const failure = b.split('\n').find((line) => line.startsWith('# error '));
    assertMatchObject(JSON.parse(failure?.slice('# error '.length) ?? '{}'), {
      status: 403,
      step: 'read package node structure',
    });
  });

  it('credential refusal ends the call as it came', async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleHandlerGet(
        contextOn(fake),
        contents({ package_names: ['ZROOT_A', 'ZROOT_B'] }),
      ) as Promise<unknown>,
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    await withinTurns(
      handleHandlerGet(
        contextOn(fake, 'absent'),
        contents({ package_names: ['ZROOT_A', 'ZROOT_B'] }),
      ) as Promise<unknown>,
    );
    assert.equal(fake.envelopes.length, 0);
    assert.equal(fake.directs.length, 6);
  });
});

describe('GetPackageTree', () => {
  // Codex round 9: several packages at terse, each tree its own section
  // under its own root — never incomplete_answer — on both paths.
  for (const path of ['batched', 'sequential'] as const) {
    it(`terse, two packages answered (${path}): each tree as full holds it`, async () => {
      const on = () =>
        path === 'batched'
          ? contextOn(system())
          : contextOn(system(), 'absent');
      const terse = await withinTurns(
        handleGetPackageTreeOf(on(), {
          package_names: ['ZROOT_A', 'ZROOT_B'],
          detail: 'terse',
          background: false,
        }),
      );
      assert.notEqual(
        (terse as { isError?: boolean }).isError,
        true,
        textOf(terse),
      );
      const full = payloadOf(
        await withinTurns(
          handleGetPackageTree(on(), {
            package_names: ['ZROOT_A', 'ZROOT_B'],
            background: false,
          }),
        ),
      );
      const names = (node: {
        name: string;
        children?: unknown[];
      }): string[] => [
        node.name,
        ...(
          (node.children ?? []) as Array<{ name: string; children?: unknown[] }>
        ).flatMap(names),
      ];
      const expected = (full as Array<{ tree: { name: string } }>).flatMap(
        (entry) => names(entry.tree),
      );
      const written = textOf(terse)
        .split('\n')
        .filter((line) => !line.startsWith('#'))
        .map((line) => line.trim().split('\t')[1] ?? line.trim());
      assert.deepStrictEqual(written, expected, textOf(terse));
    });
  }

  // Codex round 9: a row's description is part of what the guard compares —
  // terse with descriptions writes each item's own.
  it("terse with descriptions: each row carries its own item's description", async () => {
    const terse = await withinTurns(
      handleGetPackageTreeOf(contextOn(system()), {
        package_name: 'ZROOT_A',
        include_descriptions: true,
        detail: 'terse',
        background: false,
      }),
    );
    const text = textOf(terse);
    assert.notEqual((terse as { isError?: boolean }).isError, true, text);
    const rows = text
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split('\t'));
    assert.deepStrictEqual(
      rows.map((cells) => [cells[1], cells.at(-1)]),
      [
        ['ZSUB_A', 'Sub A'],
        ['ZPROG_A', 'Program A'],
        ['ZCL_A', 'Class A'],
      ],
      text,
    );
  });

  it('terse, one package answered and one refused', async () => {
    const model = { refuse: { [nodeKey('DEVC/K', 'ZROOT_B', '40')]: 403 } };
    const terse = await withinTurns(
      handleGetPackageTreeOf(contextOn(system(model)), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        detail: 'terse',
        background: false,
      }),
    );
    const text = textOf(terse);
    assert.notEqual((terse as { isError?: boolean }).isError, true, text);
    const lines = text.split('\n');
    assert.equal(lines[0], '# asked ZROOT_A');
    assert.ok(lines.includes('# asked ZROOT_B'), text);
    assert.equal(
      lines.filter((line) => line.startsWith('# error ')).length,
      1,
      text,
    );
  });

  it('same answer as the sequential version', async () => {
    const a = await withinTurns(
      handleGetPackageTree(contextOn(system()), { package_name: 'ZROOT_A' }),
    );
    const b = await withinTurns(
      handleGetPackageTree(contextOn(system(), 'absent'), {
        package_name: 'ZROOT_A',
      }),
    );
    assert.equal(textOf(a), textOf(b));
    const tree = payloadOf(a).tree;
    assert.deepStrictEqual(
      tree.children.map((c: { name: string }) => c.name),
      ['ZSUB_A', 'ZCL_A'],
    );
    assert.equal(tree.children[0].children[0].name, 'ZPROG_A');
  });

  it("envelopes per spec §11's row (metadata and root, then the walk's levels)", async () => {
    const fake = system();
    await withinTurns(
      handleGetPackageTree(contextOn(fake), { package_name: 'ZROOT_A' }),
    );
    assert.deepStrictEqual(fake.envelopes.map(partKeys), [
      ['GET /sap/bc/adt/packages/zroot_a', nodeKey('DEVC/K', 'ZROOT_A')],
      [nodeKey('DEVC/K', 'ZROOT_A', '10'), nodeKey('DEVC/K', 'ZROOT_A', '20')],
      [nodeKey('DEVC/K', 'ZSUB_A')],
      [nodeKey('DEVC/K', 'ZSUB_A', '30')],
    ]);
  });

  it('no envelope holds a request needing another of its parts', async () => {
    const fake = system();
    await withinTurns(
      handleGetPackageTree(contextOn(fake), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
      }),
    );
    eachPartKnownBefore(fake.envelopes, [
      nodeKey('DEVC/K', 'ZROOT_A'),
      nodeKey('DEVC/K', 'ZROOT_B'),
    ]);
  });

  it('several roots: the envelope count does not grow with their number', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetPackageTree(contextOn(fake), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
      }),
    );
    assert.equal(fake.envelopes.length, 4);
    const entries = payloadOf(result);
    assert.deepStrictEqual(
      entries.map((e: { package_name: string }) => e.package_name),
      ['ZROOT_A', 'ZROOT_B'],
    );
    assert.equal(entries[1].tree.children[0].children[0].name, 'ZPROG_B');
  });

  it("a part failure is that item's", async () => {
    const model = {
      refuse: { 'GET /sap/bc/adt/packages/zroot_b': 404 },
    };
    const fake = system(model);
    const result = await withinTurns(
      handleGetPackageTree(contextOn(fake), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
      }),
    );
    const [a, b] = payloadOf(result);
    assert.equal(a.tree.children.length, 2);
    assert.equal(b.tree, undefined);
    assertMatchObject(b.error, {
      status: 404,
      step: 'read package metadata',
    });
    // Nothing more of the package whose metadata failed is read.
    assert.equal(
      fake.envelopes
        .slice(1)
        .flatMap(partKeys)
        .some((k) => k.includes('ZROOT_B') || k.includes('ZSUB_B')),
      false,
    );
  });

  it('credential refusal ends the call as it came', async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetPackageTree(contextOn(fake), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
      }),
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    await withinTurns(
      handleGetPackageTree(contextOn(fake, 'absent'), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
      }),
    );
    assert.equal(fake.envelopes.length, 0);
    assert.equal(fake.directs.length, 12);
  });
});

describe('GetObjectsList', () => {
  const single = {
    parent_type: 'PROG/P',
    parent_name: 'ZPROG_X',
    parent_tech_name: 'ZPROG_X',
  };

  it('same answer as the sequential version', async () => {
    const a = await withinTurns(
      handleGetObjectsList(contextOn(system()), single),
    );
    const b = await withinTurns(
      handleGetObjectsList(contextOn(system(), 'absent'), single),
    );
    assert.equal(textOf(a), textOf(b));
    assert.deepStrictEqual(
      payloadOf(a).objects.map((o: { OBJECT_NAME: string }) => o.OBJECT_NAME),
      ['ZINCL_X1', 'ZFORM_X', 'ZEVENT_X'],
    );
  });

  // The owner's decision: pass 1 reads the node structures in batch for the
  // identities alone; terse (the default) makes no second batch.
  it("terse: envelopes per spec §11's row (per level: every node of the level), and no second batch", async () => {
    const fake = system();
    await withinTurns(
      handleGetObjectsListOf(contextOn(fake), { ...single, detail: 'terse' }),
    );
    assert.deepStrictEqual(fake.envelopes.map(partKeys), [
      [nodeKey('PROG/P', 'ZPROG_X')],
      [
        nodeKey('PROG/P', 'ZPROG_X', '101'),
        nodeKey('PROG/P', 'ZPROG_X', '102'),
      ],
      [nodeKey('PROG/P', 'ZPROG_X', '103')],
    ]);
  });

  // Medium reads each object's own metadata in a second batch: one
  // envelope of independent GETs after the node structures'.
  it("medium: the node structures, then one envelope of the objects' metadata reads", async () => {
    const fake = system();
    await withinTurns(
      handleGetObjectsListOf(contextOn(fake), { ...single, detail: 'medium' }),
    );
    const envelopes = fake.envelopes.map(partKeys);
    assert.equal(envelopes.length, 4);
    const second = envelopes[3] ?? [];
    assert.ok(second.length > 0);
    assert.ok(
      second.every((key) => key.startsWith('GET ')),
      second.join('\n'),
    );
  });
  // Codex review P1: the metadata envelope answered with an outer 404 is
  // the envelope's failure, which reaches every part: no part is an object
  // SAP answered 404 for. With the endpoint served by the envelopes before
  // it, it fails the call as before — never a listing of metadata errors.
  it('the metadata envelope answered with an outer 404 is no object 404: the call fails as before', async () => {
    const fake = system();
    let batches = 0;
    fake.answerRequests(async (request, previous) => {
      if (request.url.endsWith('/batch')) {
        batches += 1;
        // The node structures' three envelopes, then the metadata's.
        if (batches === 4) throw statusError(404, 'Not Found');
      }
      return previous(request);
    });
    const outer = await withinTurns(
      handleGetObjectsListOf(contextOn(fake), { ...single, detail: 'medium' }),
    );
    assert.equal(batches, 4);
    assert.equal((outer as { isError?: boolean }).isError, true, textOf(outer));
    assert.ok(!textOf(outer).includes('metadata_error'), textOf(outer));
    assert.equal(payloadOf(outer).step, 'read object metadata', textOf(outer));
  });

  // Onprem live rerun: SAP answers 400 "Accept header missing" to a GET
  // without one (measured, GET-only, an enhancement's URI: 404 with
  // Accept */*). A direct request has axios' default Accept, an envelope
  // part only the headers its read gives: every metadata part states one.
  it('medium: every metadata part of the envelope states its Accept', async () => {
    const fake = system();
    await withinTurns(
      handleGetObjectsListOf(contextOn(fake), { ...single, detail: 'medium' }),
    );
    const parts = fake.envelopes[3]?.parts ?? [];
    assert.ok(parts.length > 0);
    for (const part of parts) {
      const accept = Object.entries(part.headers).find(
        ([name]) => name.toLowerCase() === 'accept',
      )?.[1];
      assert.ok(accept !== undefined && accept !== '', JSON.stringify(part));
    }
  });

  // Onprem live rerun: in an envelope, a metadata part SAP answers 404 (an
  // object it lists and serves no metadata for) is that object's, as on the
  // sequential path: listed with SAP's error, the call answered on both paths.
  it('a metadata part answered 404 inside an envelope: the object listed with it, as on the sequential path', async () => {
    const probe = system();
    await withinTurns(
      handleGetObjectsListOf(contextOn(probe), { ...single, detail: 'medium' }),
    );
    const metadataKey = (probe.envelopes.map(partKeys)[3] ?? [])[0] ?? '';
    assert.ok(metadataKey.startsWith('GET '), metadataKey);
    const model = {
      refuse: { [metadataKey]: 404 },
      refuseBody: {
        [metadataKey]:
          '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">Resource PROG ZX does not exist.</message></exc:exception>',
      },
    };
    const recorded: unknown[] = [];
    const answers: unknown[] = [];
    for (const batch of ['served', 'absent'] as const) {
      const result = await withinTurns(
        handleGetObjectsListOf(contextOn(system(model), batch), {
          ...single,
          detail: 'medium',
        }),
      );
      const text = textOf(result);
      assert.equal((result as { isError?: boolean }).isError, false, text);
      const gone = payloadOf(result).objects.filter(
        (o: { metadata_error?: { status?: number } }) =>
          o.metadata_error !== undefined,
      );
      assert.equal(gone.length, 1, text);
      assert.equal(gone[0].metadata_error.status, 404, text);
      assert.equal(gone[0].metadata_error.step, 'read object metadata', text);
      recorded.push(gone[0].metadata_error);
      answers.push(payloadOf(result));
    }
    // The whole answers alike: every row, and which object failed.
    assert.deepStrictEqual(answers[0], answers[1]);
    // The same 404 recorded the same way on both paths: SAP's status and
    // SAP's message as it came, nothing of the path that carried it.
    assert.deepStrictEqual(recorded[0], recorded[1]);
    assert.deepStrictEqual(recorded[0], {
      status: 404,
      message: 'Resource PROG ZX does not exist.',
      step: 'read object metadata',
    });
  });

  // Codex round 8: a part's own status is that read's answer. A metadata
  // part answering 500 inside an envelope SAP answered 200 is a failed read:
  // full answers the error, and raw the same error, never a success.
  it('a metadata part refused inside an answered envelope: full and raw the same error', async () => {
    const probe = system();
    await withinTurns(
      handleGetObjectsListOf(contextOn(probe), { ...single, detail: 'medium' }),
    );
    const metadataKey = (probe.envelopes.map(partKeys)[3] ?? [])[0] ?? '';
    assert.ok(metadataKey.startsWith('GET '), metadataKey);
    const model = { refuse: { [metadataKey]: 500 } };
    const full = await withinTurns(
      handleGetObjectsListOf(contextOn(system(model)), {
        ...single,
        detail: 'full',
      }),
    );
    const raw = await withinTurns(
      handleGetObjectsListOf(contextOn(system(model)), {
        ...single,
        detail: 'raw',
      }),
    );
    assert.equal((full as { isError?: boolean }).isError, true);
    assert.deepStrictEqual(raw, full);
  });

  it('no envelope holds a request needing another of its parts', async () => {
    const fake = system();
    await withinTurns(
      handleGetObjectsList(contextOn(fake), {
        objects: [
          { parent_type: 'PROG/P', parent_name: 'ZPROG_X' },
          { parent_type: 'PROG/P', parent_name: 'ZPROG_Y' },
        ],
      }),
    );
    eachPartKnownBefore(fake.envelopes, [
      nodeKey('PROG/P', 'ZPROG_X'),
      nodeKey('PROG/P', 'ZPROG_Y'),
    ]);
  });

  it('several roots: the envelope count does not grow with their number', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetObjectsList(contextOn(fake), {
        objects: [
          { parent_type: 'PROG/P', parent_name: 'ZPROG_X' },
          { parent_type: 'PROG/P', parent_name: 'ZPROG_Y' },
        ],
      }),
    );
    // The node structures' three levels, and one envelope of metadata reads
    // (full reads each object's description from its metadata).
    assert.equal(fake.envelopes.length, 4);
    const [x, y] = payloadOf(result);
    assertMatchObject(x, {
      parent_type: 'PROG/P',
      parent_name: 'ZPROG_X',
      total_objects: 3,
    });
    assert.deepStrictEqual(
      y.objects.map((o: { OBJECT_NAME: string }) => o.OBJECT_NAME),
      ['ZINCL_Y1', 'ZFORM_Y'],
    );
  });

  it("a part failure is that item's", async () => {
    const model = { refuse: { [nodeKey('PROG/P', 'ZPROG_Y', '103')]: 500 } };
    const result = await withinTurns(
      handleGetObjectsList(contextOn(system(model)), {
        objects: [
          { parent_type: 'PROG/P', parent_name: 'ZPROG_X' },
          { parent_type: 'PROG/P', parent_name: 'ZPROG_Y' },
        ],
      }),
    );
    const [x, y] = payloadOf(result);
    assert.equal(x.total_objects, 3);
    assert.equal(y.objects, undefined);
    assertMatchObject(y.error, { status: 500, step: 'read node structure' });
  });

  it('credential refusal ends the call as it came', async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetObjectsList(contextOn(fake), {
        objects: [
          { parent_type: 'PROG/P', parent_name: 'ZPROG_X' },
          { parent_type: 'PROG/P', parent_name: 'ZPROG_Y' },
        ],
      }),
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    await withinTurns(handleGetObjectsList(contextOn(fake, 'absent'), single));
    assert.equal(fake.envelopes.length, 0);
    // Four node structures, and the three objects' metadata reads (full).
    assert.equal(fake.directs.length, 7);
  });
});

describe('GetObjectInfo', () => {
  const single = {
    parent_type: 'DEVC/K',
    parent_name: 'ZROOT_A',
    maxDepth: 2,
  };

  it('same answer as the sequential version', async () => {
    const a = await withinTurns(
      handleGetObjectInfo(contextOn(system()), single),
    );
    const b = await withinTurns(
      handleGetObjectInfo(contextOn(system(), 'absent'), single),
    );
    assert.equal(textOf(a), textOf(b));
    const tree = payloadOf(a);
    assertMatchObject(tree, {
      OBJECT_NAME: 'ZROOT_A',
      OBJECT_PACKAGE: 'ZPARENT',
      OBJECT_DESCRIPTION: 'Found ZROOT_A',
    });
    assertMatchObject(tree.CHILDREN[0], {
      OBJECT_NAME: 'ZSUB_A',
      OBJECT_DESCRIPTION: 'Found ZSUB_A',
    });
    assert.equal(tree.CHILDREN[0].CHILDREN[0].OBJECT_NAME, 'ZPROG_A');
  });

  it('the structure as single requests, no node structure in an envelope; the searches last, in one', async () => {
    const fake = system();
    await withinTurns(handleGetObjectInfo(contextOn(fake), single));
    assert.deepStrictEqual(fake.envelopes.map(partKeys), [
      ['SEARCH|ZROOT_A', 'SEARCH|ZSUB_A'],
    ]);
    assert.equal(nodeReads(fake).length, 5);
  });

  it('no envelope holds a request needing another of its parts', async () => {
    const fake = system();
    await withinTurns(
      handleGetObjectInfo(contextOn(fake), {
        objects: [
          { object_type: 'DEVC/K', object_name: 'ZROOT_A' },
          { object_type: 'DEVC/K', object_name: 'ZROOT_B' },
        ],
        maxDepth: 2,
      }),
    );
    eachPartKnownBefore(fake.envelopes, [
      nodeKey('DEVC/K', 'ZROOT_A'),
      nodeKey('DEVC/K', 'ZROOT_B'),
    ]);
  });

  it('several roots: the envelope count does not grow with their number', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetObjectInfo(contextOn(fake), {
        objects: [
          { object_type: 'DEVC/K', object_name: 'ZROOT_A' },
          { object_type: 'DEVC/K', object_name: 'ZROOT_B' },
        ],
        maxDepth: 2,
      }),
    );
    // The node structures go alone; one envelope holds every search.
    assert.equal(fake.envelopes.length, 1);
    const [a, b] = payloadOf(result);
    assert.equal(a.OBJECT_NAME, 'ZROOT_A');
    assert.equal(b.CHILDREN[0].CHILDREN[0].OBJECT_NAME, 'ZPROG_B');
  });

  it("a part failure is that item's", async () => {
    const model = { refuse: { [nodeKey('DEVC/K', 'ZSUB_B')]: 500 } };
    const result = await withinTurns(
      handleGetObjectInfo(contextOn(system(model)), {
        objects: [
          { object_type: 'DEVC/K', object_name: 'ZROOT_A' },
          { object_type: 'DEVC/K', object_name: 'ZROOT_B' },
        ],
        maxDepth: 2,
      }),
    );
    const [a, b] = payloadOf(result);
    assert.equal(a.CHILDREN.length, 2);
    assertMatchObject(b, {
      OBJECT_TYPE: 'DEVC/K',
      OBJECT_NAME: 'ZROOT_B',
      error: { status: 500, step: 'read node structure' },
    });
  });

  it('credential refusal ends the call as it came', async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetObjectInfo(contextOn(fake), single),
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    await withinTurns(handleGetObjectInfo(contextOn(fake, 'absent'), single));
    assert.equal(fake.envelopes.length, 0);
    assert.equal(fake.directs.length, 7);
  });
});

// ---------------------------------------------------------------------------
// Fix round 1: credential refusals in list calls, envelope failures, the
// sequential path, the cache, the single arguments' words
// ---------------------------------------------------------------------------

type Call = (context: HandlerContext) => Promise<unknown>;

/** Every list call of the four walks, over two roots. */
const LIST_CALLS: Array<{ tool: string; call: Call; refused: string }> = [
  {
    tool: 'GetPackageContents',
    call: (c) =>
      handleGetPackageContents(c, {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        include_subpackages: true,
        max_depth: 2,
      }),
    refused: nodeKey('DEVC/K', 'ZROOT_B', '40'),
  },
  {
    tool: 'GetPackageTree',
    call: (c) =>
      handleGetPackageTree(c, { package_names: ['ZROOT_A', 'ZROOT_B'] }),
    refused: nodeKey('DEVC/K', 'ZROOT_B', '40'),
  },
  {
    tool: 'GetObjectsList',
    call: (c) =>
      handleGetObjectsList(c, {
        objects: [
          { parent_type: 'PROG/P', parent_name: 'ZPROG_X' },
          { parent_type: 'PROG/P', parent_name: 'ZPROG_Y' },
        ],
      }),
    refused: nodeKey('PROG/P', 'ZPROG_Y', '103'),
  },
  {
    tool: 'GetObjectInfo',
    call: (c) =>
      handleGetObjectInfo(c, {
        objects: [
          { object_type: 'DEVC/K', object_name: 'ZROOT_A' },
          { object_type: 'DEVC/K', object_name: 'ZROOT_B' },
        ],
        maxDepth: 2,
      }),
    refused: nodeKey('DEVC/K', 'ZSUB_B'),
  },
];

for (const { tool, call, refused } of LIST_CALLS) {
  describe(`${tool}: a 401 SAP answered to one root of a list`, () => {
    it('batched: ends the call as it came; no envelope after it', async () => {
      const fake = system({ refuse: { [refused]: 401 } });
      const result = await withinTurns(call(contextOn(fake)));
      assert.equal((result as { isError?: boolean }).isError, true);
      assert.ok(textOf(result).includes('401'));
      if (tool === 'GetObjectInfo') {
        // Its structure is read as single requests: none in an envelope.
        assert.equal(fake.envelopes.length, 0);
        assert.ok(
          fake.directs.some(
            (r) => keyOf(r.method, r.url, r.params) === refused,
          ),
        );
        return;
      }
      const at = fake.envelopes.findIndex((e) => partKeys(e).includes(refused));
      assert.ok(at >= 0);
      assert.equal(fake.envelopes.length, at + 1);
    });

    it('sequential: ends the call as it came; nothing is read after it', async () => {
      const fake = system({ refuse: { [refused]: 401 } });
      const result = await withinTurns(call(contextOn(fake, 'absent')));
      assert.equal((result as { isError?: boolean }).isError, true);
      assert.ok(textOf(result).includes('401'));
      const last = fake.directs[fake.directs.length - 1] as IAbapRequestOptions;
      assert.equal(keyOf(last.method, last.url, last.params), refused);
    });
  });
}

// GetObjectInfo reads its structure as single requests; its envelopes are
// the metadata phase's and the searches' (their failures: below).
for (const { tool, call } of LIST_CALLS.filter(
  (c) => c.tool !== 'GetObjectInfo',
)) {
  describe(`${tool}: an envelope failure`, () => {
    it("is every item of that phase's failure, the envelope's error with its step", async () => {
      const fake = system({}, () => {
        throw statusError(500, 'Internal Server Error', 'placeholder');
      });
      const result = await withinTurns(call(contextOn(fake)));
      assert.equal(fake.envelopes.length, 1);
      const entries = payloadOf(result) as Array<{ error?: unknown }>;
      assert.equal(entries.length, 2);
      const step =
        tool === 'GetPackageTree'
          ? 'read package metadata'
          : tool === 'GetPackageContents'
            ? 'read package node structure'
            : 'read node structure';
      for (const entry of entries) {
        assertMatchObject(entry.error, {
          message: 'Request failed with status code 500',
          step,
        });
      }
    });
  });
}

describe('GetObjectInfo: a credential refusal of the searches', () => {
  const two = {
    objects: [
      { object_type: 'DEVC/K', object_name: 'ZROOT_A' },
      { object_type: 'DEVC/K', object_name: 'ZROOT_B' },
    ],
    maxDepth: 2,
  };

  it('sequential: the first refused search ends the call; nothing is read after it', async () => {
    const fake = system({ refuse: { 'SEARCH|ZROOT_A': 401 } });
    const result = await withinTurns(
      handleGetObjectInfo(contextOn(fake, 'absent'), two),
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assertMatchObject(payloadOf(result), { status: 401 });
    assert.equal(fake.directs.length, 1);
  });

  it('batched: a refused search envelope ends the call as it came', async () => {
    const fake = envelopeConnection((parts) => {
      if (parts.some((p) => keyOf(p.method, p.url).startsWith('SEARCH|'))) {
        throw credential();
      }
      return envelopeOf(parts.map((p) => answerOf({}, p.method, p.url)));
    });
    const result = await withinTurns(
      handleGetObjectInfo(contextOn(fake as unknown as Fake), two),
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
    assert.equal(fake.envelopes.length, 1);
  });
});

describe('GetObjectsList: the cache', () => {
  it('a list call leaves it as it was; a single call writes it', async () => {
    const before = {
      objects: [{ OBJECT_TYPE: 'PROG/P', OBJECT_NAME: 'BEFORE' }],
    };
    objectsListCache.setCache(before);
    await withinTurns(
      handleGetObjectsList(contextOn(system()), {
        objects: [{ parent_type: 'PROG/P', parent_name: 'ZPROG_X' }],
      }),
    );
    assert.equal(objectsListCache.getCache(), before);
    await withinTurns(
      handleGetObjectsList(contextOn(system()), {
        parent_type: 'PROG/P',
        parent_name: 'ZPROG_X',
        parent_tech_name: 'ZPROG_X',
      }),
    );
    assertMatchObject(objectsListCache.getCache(), {
      parent_name: 'ZPROG_X',
      total_objects: 3,
    });
  });
});

describe('the single arguments keep their words', () => {
  it('GetPackageTree without a package: its schema', () => {
    assert.ok(
      schemaWords(GetPackageTree, { package_name: '' }).includes(
        'package_name is required',
      ),
    );
  });

  it('GetObjectsList: objects beside a single parent field is refused by its schema', () => {
    for (const field of ['parent_name', 'parent_type', 'parent_tech_name']) {
      assert.ok(
        schemaWords(GetObjectsList, {
          objects: [{ parent_type: 'PROG/P', parent_name: 'ZPROG_X' }],
          [field]: 'ZPROG_X',
        }).includes(
          'Give exactly one of parent_name, parent_tech_name and parent_type, or objects',
        ),
      );
    }
  });
});

describe('GetPackageTree with descriptions: a metadata read SAP answered 401', () => {
  it('ends the call as it came; nothing is walked', async () => {
    const fake = system({
      refuse: { 'GET /sap/bc/adt/packages/zroot_a': 401 },
    });
    const result = await withinTurns(
      handleGetPackageTree(contextOn(fake), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        include_descriptions: true,
      }),
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assertMatchObject(payloadOf(result), {
      status: 401,
      step: 'read package metadata',
    });
    assert.equal(fake.envelopes.length, 0);
    assert.equal(nodeReads(fake).length, 0);
  });

  it('more packages than are read at once: no metadata read starts after it', async () => {
    const names = Array.from(
      { length: NODE_READ_CONCURRENCY + 4 },
      (_, i) => `ZPKG_${String(i).padStart(2, '0')}`,
    );
    const fake = system({
      refuse: { 'GET /sap/bc/adt/packages/zpkg_00': 401 },
    });
    const result = await withinTurns(
      handleGetPackageTree(contextOn(fake), {
        package_names: names,
        include_descriptions: true,
      }),
    );
    assert.equal((result as { isError?: boolean }).isError, true);
    assertMatchObject(payloadOf(result), {
      status: 401,
      step: 'read package metadata',
    });
    const metadataReads = fake.directs.filter((r) =>
      r.url.includes('/sap/bc/adt/packages/'),
    );
    // Only the reads already started when the refusal answered.
    assert.equal(metadataReads.length, NODE_READ_CONCURRENCY);
    assert.equal(nodeReads(fake).length, 0);
  });
});

describe('GetPackageTree: a metadata read SAP answered 401', () => {
  const refused = { refuse: { 'GET /sap/bc/adt/packages/zroot_a': 401 } };
  const call = (c: HandlerContext) =>
    handleGetPackageTree(c, { package_names: ['ZROOT_A', 'ZROOT_B'] });

  it('batched: ends the call as it came; nothing is walked', async () => {
    const fake = system(refused);
    const result = await withinTurns(call(contextOn(fake)));
    assert.equal((result as { isError?: boolean }).isError, true);
    assertMatchObject(payloadOf(result), {
      status: 401,
      step: 'read package metadata',
    });
    assert.equal(fake.envelopes.length, 1);
  });

  it('sequential: ends the call as it came; nothing is read after it', async () => {
    const fake = system(refused);
    const result = await withinTurns(call(contextOn(fake, 'absent')));
    assertMatchObject(payloadOf(result), {
      status: 401,
      step: 'read package metadata',
    });
    assert.equal(fake.directs.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Descriptions: a node structure part after the first of an envelope can
// carry another part's DESCRIPTION (measured, 2026-10-18). The package
// listings read a walk with descriptions as requests sent alone, several at a
// time, each carrying its own; GetObjectInfo's batched walk takes every
// description from the object's metadata.
// ---------------------------------------------------------------------------

const DESCRIPTION_TAG = /<DESCRIPTION>[^<]*<\/DESCRIPTION>|<DESCRIPTION\/>/g;

/**
 * The system as measured: in an envelope, every node structure part after
 * one that carried a description carries that description on each of its
 * nodes in place of its own. A part sent alone is answered as it is.
 */
function leakingSystem(model: Model = {}) {
  const leaks = { count: 0 };
  const fake = envelopeConnection(
    (parts) => {
      let leaked: string | undefined;
      const answered = parts.map((p) => {
        const answer = answerOf(model, p.method, p.url);
        const body = answer.body ?? '';
        if (!p.url.includes('/repository/nodestructure')) return answer;
        const own = /<DESCRIPTION>([^<]+)<\/DESCRIPTION>/.exec(body)?.[1];
        const changed =
          leaked === undefined
            ? body
            : body
                .replace(DESCRIPTION_TAG, '')
                .replaceAll(
                  '</SEU_ADT_REPOSITORY_OBJ_NODE>',
                  `<DESCRIPTION>${leaked}</DESCRIPTION></SEU_ADT_REPOSITORY_OBJ_NODE>`,
                );
        leaked ??= own;
        if (changed !== body) leaks.count += 1;
        return { ...answer, body: changed };
      });
      return envelopeOf(answered);
    },
    async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
      const a = answerOf(model, request.method, request.url, request.params);
      if (a.status >= 400) {
        throw statusError(a.status, a.statusText ?? '', a.body ?? '');
      }
      return {
        status: a.status,
        statusText: a.statusText ?? 'OK',
        headers: a.headers ?? {},
        data: alone(request, a.body ?? ''),
      } as IAdtWireResponse;
    },
  );
  return { ...fake, leaks };
}

/** The package listings that answer descriptions, over two roots. */
const LISTING_CALLS: Array<{
  tool: string;
  call: Call;
  /** The answer as the model holds it: every object with its own description, in walk order. */
  expected: unknown;
  pick?: (payload: unknown) => unknown;
}> = [
  {
    tool: 'GetPackageContents',
    call: (c) =>
      handleGetPackageContents(c, {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        include_subpackages: true,
        max_depth: 2,
        include_descriptions: true,
      }),
    expected: [
      'DEVC/K ZSUB_A = Sub A',
      'CLAS/OC ZCL_A = Class A',
      'PROG/P ZPROG_A = Program A',
      'DEVC/K ZSUB_B = ',
      'INTF/OI ZIF_B = Interface B',
      'PROG/P ZPROG_B = ',
    ],
  },
  {
    tool: 'HandlerGet part contents',
    // GetPackageContents' answer (compact parity), at full: its objects.
    call: (c) =>
      handleHandlerGet(c, {
        object_type: 'PACKAGE',
        part: 'contents',
        package_names: ['ZROOT_A', 'ZROOT_B'],
        include_descriptions: true,
        detail: 'full',
      }) as Promise<unknown>,
    expected: [
      'DEVC/K ZSUB_A = Sub A',
      'CLAS/OC ZCL_A = Class A',
      'DEVC/K ZSUB_B = ',
      'INTF/OI ZIF_B = Interface B',
    ],
  },
  {
    tool: 'GetPackageTree',
    call: (c) =>
      handleGetPackageTree(c, {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        include_descriptions: true,
      }),
    expected: [
      'DEVC/K ZROOT_A = ',
      'DEVC/K ZSUB_A = Sub A',
      'PROG/P ZPROG_A = Program A',
      'CLAS/OC ZCL_A = Class A',
      'DEVC/K ZROOT_B = ',
      'DEVC/K ZSUB_B = ',
      'PROG/P ZPROG_B = ',
      'INTF/OI ZIF_B = Interface B',
    ],
  },
];

/** Every object an answer holds, in answer order: `TYPE NAME = description`. */
const describedIn = (answer: unknown): string[] => {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) {
      n.forEach(visit);
      return;
    }
    if (n === null || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (typeof o.name === 'string' && typeof o.type === 'string') {
      out.push(`${o.type} ${o.name} = ${o.description ?? ''}`);
    }
    for (const v of Object.values(o)) if (typeof v === 'object') visit(v);
  };
  visit(answer);
  return out;
};

/** The node structure requests a call sent alone. */
const nodeReads = (fake: { directs: IAbapRequestOptions[] }) =>
  fake.directs.filter((r) => r.url.includes('/repository/nodestructure'));

for (const { tool, call, expected, pick = describedIn } of LISTING_CALLS) {
  describe(`${tool}: descriptions`, () => {
    it('each node structure sent alone: every object, each with its own description', async () => {
      const leaking = leakingSystem();
      const result = await withinTurns(call(contextOn(leaking as Fake)));
      assert.equal(leaking.leaks.count, 0);
      assert.equal((result as { isError?: boolean }).isError, false);
      assert.deepStrictEqual(pick(payloadOf(result)), expected);
    });

    it('no node structure in an envelope, none asked without descriptions, no object metadata read', async () => {
      const fake = system();
      await withinTurns(call(contextOn(fake)));
      assert.equal(
        fake.envelopes.flatMap(partKeys).some((k) => k.includes('|')),
        false,
      );
      const asked = nodeReads(fake);
      assert.ok(asked.length > 0);
      assert.equal(
        asked.every(
          (r) =>
            (r.params as { withShortDescriptions?: unknown })
              ?.withShortDescriptions === true,
        ),
        true,
      );
      assert.equal(
        [
          ...fake.envelopes.flatMap(partKeys),
          ...fake.directs.map((r) => r.url),
        ].some((k) => k.includes('/sap/bc/adt/oo/')),
        false,
      );
    });

    it('no communication batch: the same requests, the same answer', async () => {
      const served = system();
      const absent = system();
      const a = await withinTurns(call(contextOn(served)));
      const b = await withinTurns(call(contextOn(absent, 'absent')));
      assert.equal(absent.envelopes.length, 0);
      assert.equal(textOf(b), textOf(a));
      assert.deepStrictEqual(
        nodeReads(absent)
          .map((r) => keyOf(r.method, r.url, r.params))
          .sort(),
        nodeReads(served)
          .map((r) => keyOf(r.method, r.url, r.params))
          .sort(),
      );
    });

    it("a node structure's failure is its root's; the other root answers", async () => {
      const fake = system({
        refuse: { [nodeKey('DEVC/K', 'ZROOT_A', '20')]: 500 },
      });
      const result = await withinTurns(call(contextOn(fake)));
      assert.equal((result as { isError?: boolean }).isError, false);
      assert.ok(!textOf(result).includes('Class A'));
      assert.ok(textOf(result).includes('Interface B'));
    });

    it('a 401 SAP answered to a node structure ends the call as it came', async () => {
      const fake = system({
        refuse: { [nodeKey('DEVC/K', 'ZROOT_A', '20')]: 401 },
      });
      const result = await withinTurns(call(contextOn(fake)));
      assert.equal((result as { isError?: boolean }).isError, true);
      assert.ok(textOf(result).includes('401'));
    });

    it("the connection's credential refusal ends the call as it came", async () => {
      const fake = system({}, undefined, () => {
        throw credential();
      });
      const result = await withinTurns(call(contextOn(fake)));
      assert.equal((result as { isError?: boolean }).isError, true);
      assert.equal(payloadOf(result).error, 'authentication_failed');
    });
  });
}

describe('GetObjectInfo: descriptions', () => {
  const call: Call = (c) =>
    handleGetObjectInfo(c, {
      objects: [
        { object_type: 'DEVC/K', object_name: 'ZROOT_A' },
        { object_type: 'DEVC/K', object_name: 'ZROOT_B' },
      ],
      maxDepth: 2,
      include_descriptions: true,
    });

  it('the structure as single requests, then the metadata phase: the sequential answer', async () => {
    const leaking = leakingSystem();
    const batched = await withinTurns(call(contextOn(leaking as Fake)));
    const sequential = await withinTurns(
      call(contextOn(leakingSystem() as Fake, 'absent')),
    );
    // The structure first, no node structure in an envelope: nothing leaked;
    // each description is its leaf's metadata's, on both paths.
    assert.equal(leaking.leaks.count, 0);
    assert.equal(
      leaking.envelopes
        .flatMap(partKeys)
        .some((k) => k.includes('|') && !k.startsWith('SEARCH|')),
      false,
    );
    assert.equal((batched as { isError?: boolean }).isError, false);
    assert.equal(textOf(batched), textOf(sequential));
    assert.ok(textOf(batched).includes('Class A'));
  });

  it('the metadata phase: one envelope, one GET per object, after the walk', async () => {
    const fake = system();
    await withinTurns(call(contextOn(fake)));
    const metadata = fake.envelopes.filter((e) =>
      partKeys(e).includes('GET /sap/bc/adt/oo/classes/zcl_a'),
    );
    assert.equal(metadata.length, 1);
    const parts = (metadata[0] as SeenEnvelope).parts;
    assert.equal(
      parts.every((p) => p.method === 'GET'),
      true,
    );
    const keys = partKeys(metadata[0] as SeenEnvelope);
    assert.equal(new Set(keys).size, keys.length);
    for (const key of ['GET /sap/bc/adt/oo/classes/zcl_a']) {
      assert.ok(keys.some((e) => isDeepStrictEqual(e, key)));
    }
    // No node structure is read after it.
    const at = fake.envelopes.indexOf(metadata[0] as SeenEnvelope);
    assert.equal(
      fake.envelopes
        .slice(at + 1)
        .flatMap(partKeys)
        .some((k) => k.includes('|') && !k.startsWith('SEARCH|')),
      false,
    );
  });

  for (const status of [401, 500]) {
    it(`a ${status} on one leaf's metadata: that leaf has no description, the call answers — the same on both paths`, async () => {
      const model = { refuse: { 'GET /sap/bc/adt/oo/classes/zcl_a': status } };
      const batched = await withinTurns(call(contextOn(system(model))));
      const sequential = await withinTurns(
        call(contextOn(system(model), 'absent')),
      );
      for (const result of [batched, sequential]) {
        assert.equal((result as { isError?: boolean }).isError, false);
        assert.ok(textOf(result).includes('ZCL_A'));
        assert.ok(!textOf(result).includes('Class A'));
        assert.ok(textOf(result).includes('Interface B'));
      }
      assert.equal(textOf(batched), textOf(sequential));
    });
  }

  it("the sequential version reads each leaf's description from its metadata too, one request each", async () => {
    const fake = system();
    const result = await withinTurns(call(contextOn(fake, 'absent')));
    assert.equal(fake.envelopes.length, 0);
    const metadata = fake.directs.filter((r) =>
      r.url.startsWith('/sap/bc/adt/oo/'),
    );
    assert.ok(
      metadata.some((r) => r.url.startsWith('/sap/bc/adt/oo/classes/zcl_a')),
    );
    assert.ok(textOf(result).includes('Class A'));
  });

  it("the connection's credential refusal of the metadata envelope ends the call as it came", async () => {
    // The structure is read alone, from the model; the metadata envelope
    // is refused by the connection.
    const fake = system();
    fake.answerRequests(async (request, previous) => {
      if (
        request.url.endsWith('/batch') &&
        String(request.data ?? '').includes('/sap/bc/adt/oo/classes/zcl_a')
      ) {
        throw credential();
      }
      return previous(request);
    });
    const result = await withinTurns(call(contextOn(fake as unknown as Fake)));
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
  });
});

// ---------------------------------------------------------------------------
// include_descriptions: false — the batched walks read no metadata (#300)
// ---------------------------------------------------------------------------

describe('include_descriptions: false', () => {
  const walkEnvelopes = [
    [nodeKey('DEVC/K', 'ZROOT_A', '10'), nodeKey('DEVC/K', 'ZROOT_A', '20')],
    [nodeKey('DEVC/K', 'ZSUB_A')],
    [nodeKey('DEVC/K', 'ZSUB_A', '30')],
  ];

  it('GetPackageContents: the walk alone, no description in the answer', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetPackageContents(contextOn(fake), {
        package_name: 'ZROOT_A',
        include_subpackages: true,
        max_depth: 2,
        include_descriptions: false,
      }),
    );
    assert.equal((result as { isError?: boolean }).isError, false);
    assert.deepStrictEqual(fake.envelopes.map(partKeys), [
      [nodeKey('DEVC/K', 'ZROOT_A')],
      ...walkEnvelopes,
    ]);
    assert.equal(fake.directs.length, 0);
    assert.deepStrictEqual(
      payloadOf(result).map((i: { name: string }) => i.name),
      ['ZSUB_A', 'ZCL_A', 'ZPROG_A'],
    );
    assert.ok(!textOf(result).includes('Class A'));
  });

  it('GetPackageTree: the walk alone, no description in the answer', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetPackageTree(contextOn(fake), {
        package_name: 'ZROOT_A',
        include_descriptions: false,
      }),
    );
    assert.equal((result as { isError?: boolean }).isError, false);
    assert.deepStrictEqual(fake.envelopes.map(partKeys), [
      ['GET /sap/bc/adt/packages/zroot_a', nodeKey('DEVC/K', 'ZROOT_A')],
      ...walkEnvelopes,
    ]);
    assert.equal(fake.directs.length, 0);
    const tree = payloadOf(result).tree;
    assert.deepStrictEqual(
      tree.children.map((c: { name: string }) => c.name),
      ['ZSUB_A', 'ZCL_A'],
    );
    assert.ok(!textOf(result).includes('Class A'));
  });
});

for (const { tool, call } of [
  {
    tool: 'GetPackageContents',
    call: ((c) =>
      handleGetPackageContents(c, {
        package_name: 'ZROOT_A',
        include_subpackages: true,
        max_depth: 2,
      })) as Call,
  },
  {
    tool: 'HandlerGet part contents',
    call: ((c) =>
      handleHandlerGet(c, {
        object_type: 'PACKAGE',
        part: 'contents',
        package_name: 'ZROOT_A',
      }) as Promise<unknown>) as Call,
  },
  {
    tool: 'GetPackageTree',
    call: ((c) => handleGetPackageTree(c, { package_name: 'ZROOT_A' })) as Call,
  },
  {
    tool: 'GetObjectInfo',
    call: ((c) =>
      handleGetObjectInfo(c, {
        parent_type: 'DEVC/K',
        parent_name: 'ZROOT_A',
        maxDepth: 2,
      })) as Call,
  },
]) {
  describe(`${tool} without include_descriptions`, () => {
    it('batched: no metadata read, no description', async () => {
      const fake = system();
      const result = await withinTurns(call(contextOn(fake)));
      assert.equal((result as { isError?: boolean }).isError, false);
      assert.equal(
        fake.envelopes
          .flatMap(partKeys)
          .some((k) => k.startsWith('GET /sap/bc/adt/oo/')),
        false,
      );
      assert.ok(textOf(result).includes('ZCL_A'));
      assert.ok(!textOf(result).includes('Class A'));
    });

    it('sequential: node structures asked without descriptions', async () => {
      const fake = system();
      const result = await withinTurns(call(contextOn(fake, 'absent')));
      const asked = fake.directs.filter((r) =>
        r.url.includes('/repository/nodestructure'),
      );
      assert.ok(asked.length > 0);
      assert.equal(
        asked.every(
          (r) =>
            (r.params as { withShortDescriptions?: unknown })
              ?.withShortDescriptions === false,
        ),
        true,
      );
      assert.ok(!textOf(result).includes('Class A'));
      // Structure only: no object metadata read on this path either.
      assert.equal(
        fake.directs.some((r) => r.url.startsWith('/sap/bc/adt/oo/')),
        false,
      );
    });
  });
}

describe('GetObjectsList: descriptions', () => {
  // GetObjectsList takes no description from a node structure: pass 1
  // asks none, and a description comes from the object's own metadata in
  // pass 2. So a node structure part carrying another part's DESCRIPTION,
  // as SAP answers inside an envelope (measured, 2026-10-18), reaches no
  // answer: the batched answer is the sequential one, read alone.
  for (const args of [
    {},
    { with_short_descriptions: true },
    { with_short_descriptions: false },
  ]) {
    it(
      format(
        "parts carrying each other's DESCRIPTION: the sequential answer, each description its object's own: %j",
        args,
      ),
      async () => {
        const call: Call = (c) =>
          handleGetObjectsList(c, {
            objects: [
              { parent_type: 'PROG/P', parent_name: 'ZPROG_X' },
              { parent_type: 'PROG/P', parent_name: 'ZPROG_Y' },
            ],
            ...args,
          });
        const leaking = leakingSystem();
        const batched = await withinTurns(call(contextOn(leaking as Fake)));
        const sequential = await withinTurns(
          call(contextOn(leakingSystem() as Fake, 'absent')),
        );
        assert.ok(leaking.envelopes.length > 0);
        assert.ok(leaking.leaks.count > 0);
        assert.equal(textOf(batched), textOf(sequential));
      },
    );
  }
});
