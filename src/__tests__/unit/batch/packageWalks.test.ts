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
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleHandlerGet } from '../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import type { HandlerContext } from '../../../handlers/interfaces';
import { handleGetPackageContents } from '../../../handlers/package/readonly/handleGetPackageContents';
import { handleGetObjectsList } from '../../../handlers/search/readonly/handleGetObjectsList';
import { handleGetPackageTree } from '../../../handlers/system/high/handleGetPackageTree';
import { handleGetObjectInfo } from '../../../handlers/system/readonly/handleGetObjectInfo';
import { corpusBody, corpusSidecar } from '../../../lib/adtCorpus';
import { createBatchAvailability } from '../../../lib/batch/availability';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import {
  envelopeConnection,
  envelopeResponse as envelopeOf,
  type InnerRequest,
  type PartAnswer,
  type SeenEnvelope,
  statusError,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

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
    objects: [{ type: 'PROG/I', name: 'ZINCL_X1' }],
    types: [{ type: 'PROG/PY', nodeId: '000103' }],
  },
  [nodeKey('PROG/P', 'ZPROG_X', '102')]: {
    objects: [{ type: 'PROG/PX', name: 'ZEVENT_X' }],
  },
  [nodeKey('PROG/P', 'ZPROG_X', '103')]: {
    objects: [{ type: 'PROG/PY', name: 'ZFORM_X' }],
  },
  [nodeKey('PROG/P', 'ZPROG_Y')]: {
    types: [{ type: 'PROG/I', nodeId: '000101' }],
  },
  [nodeKey('PROG/P', 'ZPROG_Y', '101')]: {
    objects: [{ type: 'PROG/I', name: 'ZINCL_Y1' }],
    types: [{ type: 'PROG/PY', nodeId: '000103' }],
  },
  [nodeKey('PROG/P', 'ZPROG_Y', '103')]: {
    objects: [{ type: 'PROG/PY', name: 'ZFORM_Y' }],
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

const PACKAGE_XML = (name: string) =>
  `<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${name}" adtcore:type="DEVC/K"/>`;

const SEARCH_XML = (name: string, type: string) =>
  `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/x/${name.toLowerCase()}" adtcore:type="${type}" adtcore:name="${name}" adtcore:packageName="ZPARENT" adtcore:description="Found ${name}"/></adtcore:objectReferences>`;

interface Model {
  /** Requests answered with this status instead (a key of `keyOf`). */
  refuse?: Record<string, number>;
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
    return { status: refused, statusText: 'Refused', body: '' };
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
        data: a.body ?? '',
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
      expect({ key, known: known.has(key) }).toEqual({ key, known: true });
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
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a).map((i: { name: string }) => i.name)).toEqual([
      'ZSUB_A',
      'ZCL_A',
      'ZPROG_A',
    ]);
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
    expect(textOf(c)).toBe(textOf(d));
    expect(payloadOf(c).length).toBeGreaterThan(20);
  });

  it("envelopes per spec §11's row (per level: roots, then type nodes)", async () => {
    const fake = system();
    await withinTurns(
      handleGetPackageContents(contextOn(fake), {
        package_name: 'ZROOT_A',
        ...walk,
      }),
    );
    expect(fake.envelopes.map(partKeys)).toEqual([
      [nodeKey('DEVC/K', 'ZROOT_A')],
      [nodeKey('DEVC/K', 'ZROOT_A', '10'), nodeKey('DEVC/K', 'ZROOT_A', '20')],
      [nodeKey('DEVC/K', 'ZSUB_A')],
      [nodeKey('DEVC/K', 'ZSUB_A', '30')],
    ]);
    expect(fake.directs).toHaveLength(0);
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
    expect(two.envelopes).toHaveLength(one.envelopes.length);
    expect(two.envelopes).toHaveLength(4);
    const entries = payloadOf(result);
    expect(
      entries.map((e: { package_name: string }) => e.package_name),
    ).toEqual(['ZROOT_A', 'ZROOT_B']);
    expect(entries[1].objects.map((i: { name: string }) => i.name)).toEqual([
      'ZSUB_B',
      'ZIF_B',
      'ZPROG_B',
    ]);
  });

  it("a part failure is that item's", async () => {
    const model = { refuse: { [nodeKey('DEVC/K', 'ZSUB_B', '30')]: 500 } };
    const result = await withinTurns(
      handleGetPackageContents(contextOn(system(model)), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        ...walk,
      }),
    );
    expect((result as { isError?: boolean }).isError).toBe(false);
    const [a, b] = payloadOf(result);
    expect(a.objects).toHaveLength(3);
    expect(b.package_name).toBe('ZROOT_B');
    expect(b.objects).toBeUndefined();
    expect(b.error).toMatchObject({
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
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(fake.envelopes).toHaveLength(1);
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetPackageContents(contextOn(fake, 'absent'), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
        ...walk,
      }),
    );
    expect(fake.envelopes).toHaveLength(0);
    expect(fake.directs).toHaveLength(10);
    expect(payloadOf(result)).toHaveLength(2);
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
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(fake.directs).toHaveLength(1);
  });

  it('a missing single argument keeps its words; both given is refused', async () => {
    const both = await handleGetPackageContents(contextOn(system()), {
      package_name: 'ZROOT_A',
      package_names: ['ZROOT_B'],
    });
    const none = await handleGetPackageContents(contextOn(system()), {});
    expect((both as { isError?: boolean }).isError).toBe(true);
    expect(textOf(both)).toContain(
      'Give exactly one of package_name or package_names',
    );
    expect((none as { isError?: boolean }).isError).toBe(true);
    expect(textOf(none)).toContain('Package name is required');
  });
});

describe('HandlerGet part contents', () => {
  const contents = (extra: Record<string, unknown>) => ({
    object_type: 'PACKAGE' as const,
    part: 'contents',
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
    expect(textOf(a)).toBe(textOf(b));
    expect(textOf(a).startsWith('name\ttype\tdescription')).toBe(true);
  });

  it("envelopes per spec §11's row (per level: roots, then type nodes)", async () => {
    const fake = system();
    await withinTurns(
      handleHandlerGet(
        contextOn(fake),
        contents({ package_name: 'ZROOT_A' }),
      ) as Promise<unknown>,
    );
    expect(fake.envelopes.map(partKeys)).toEqual([
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
    expect(fake.envelopes).toHaveLength(2);
    const entries = payloadOf(result);
    expect(entries).toEqual([
      {
        package_name: 'ZROOT_A',
        contents:
          'name\ttype\tdescription\nZSUB_A\tDEVC/K\tSub A\nZCL_A\tCLAS/OC\tClass A',
      },
      {
        package_name: 'ZROOT_B',
        contents:
          'name\ttype\tdescription\nZSUB_B\tDEVC/K\t\nZIF_B\tINTF/OI\tInterface B',
      },
    ]);
  });

  it("a part failure is that item's", async () => {
    const model = { refuse: { [nodeKey('DEVC/K', 'ZROOT_B', '40')]: 403 } };
    const result = await withinTurns(
      handleHandlerGet(
        contextOn(system(model)),
        contents({ package_names: ['ZROOT_A', 'ZROOT_B'] }),
      ) as Promise<unknown>,
    );
    const [a, b] = payloadOf(result);
    expect(a.contents).toContain('ZCL_A');
    expect(b.error).toMatchObject({
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
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    await withinTurns(
      handleHandlerGet(
        contextOn(fake, 'absent'),
        contents({ package_names: ['ZROOT_A', 'ZROOT_B'] }),
      ) as Promise<unknown>,
    );
    expect(fake.envelopes).toHaveLength(0);
    expect(fake.directs).toHaveLength(6);
  });
});

describe('GetPackageTree', () => {
  it('same answer as the sequential version', async () => {
    const a = await withinTurns(
      handleGetPackageTree(contextOn(system()), { package_name: 'ZROOT_A' }),
    );
    const b = await withinTurns(
      handleGetPackageTree(contextOn(system(), 'absent'), {
        package_name: 'ZROOT_A',
      }),
    );
    expect(textOf(a)).toBe(textOf(b));
    const tree = payloadOf(a).tree;
    expect(tree.children.map((c: { name: string }) => c.name)).toEqual([
      'ZSUB_A',
      'ZCL_A',
    ]);
    expect(tree.children[0].children[0].name).toBe('ZPROG_A');
  });

  it("envelopes per spec §11's row (metadata and root, then the walk's levels)", async () => {
    const fake = system();
    await withinTurns(
      handleGetPackageTree(contextOn(fake), { package_name: 'ZROOT_A' }),
    );
    expect(fake.envelopes.map(partKeys)).toEqual([
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
    expect(fake.envelopes).toHaveLength(4);
    const entries = payloadOf(result);
    expect(
      entries.map((e: { package_name: string }) => e.package_name),
    ).toEqual(['ZROOT_A', 'ZROOT_B']);
    expect(entries[1].tree.children[0].children[0].name).toBe('ZPROG_B');
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
    expect(a.tree.children).toHaveLength(2);
    expect(b.tree).toBeUndefined();
    expect(b.error).toMatchObject({
      status: 404,
      step: 'read package metadata',
    });
    // Nothing more of the package whose metadata failed is read.
    expect(
      fake.envelopes
        .slice(1)
        .flatMap(partKeys)
        .some((k) => k.includes('ZROOT_B') || k.includes('ZSUB_B')),
    ).toBe(false);
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
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    await withinTurns(
      handleGetPackageTree(contextOn(fake, 'absent'), {
        package_names: ['ZROOT_A', 'ZROOT_B'],
      }),
    );
    expect(fake.envelopes).toHaveLength(0);
    expect(fake.directs).toHaveLength(12);
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
    expect(textOf(a)).toBe(textOf(b));
    expect(
      payloadOf(a).objects.map((o: { OBJECT_NAME: string }) => o.OBJECT_NAME),
    ).toEqual(['ZINCL_X1', 'ZFORM_X', 'ZEVENT_X']);
  });

  it("envelopes per spec §11's row (per level: every node of the level)", async () => {
    const fake = system();
    await withinTurns(handleGetObjectsList(contextOn(fake), single));
    expect(fake.envelopes.map(partKeys)).toEqual([
      [nodeKey('PROG/P', 'ZPROG_X')],
      [
        nodeKey('PROG/P', 'ZPROG_X', '101'),
        nodeKey('PROG/P', 'ZPROG_X', '102'),
      ],
      [nodeKey('PROG/P', 'ZPROG_X', '103')],
    ]);
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
    expect(fake.envelopes).toHaveLength(3);
    const [x, y] = payloadOf(result);
    expect(x).toMatchObject({
      parent_type: 'PROG/P',
      parent_name: 'ZPROG_X',
      total_objects: 3,
    });
    expect(
      y.objects.map((o: { OBJECT_NAME: string }) => o.OBJECT_NAME),
    ).toEqual(['ZINCL_Y1', 'ZFORM_Y']);
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
    expect(x.total_objects).toBe(3);
    expect(y.objects).toBeUndefined();
    expect(y.error).toMatchObject({ status: 500, step: 'read node structure' });
  });

  it('credential refusal ends the call as it came', async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetObjectsList(contextOn(fake), single),
    );
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    await withinTurns(handleGetObjectsList(contextOn(fake, 'absent'), single));
    expect(fake.envelopes).toHaveLength(0);
    expect(fake.directs).toHaveLength(4);
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
    expect(textOf(a)).toBe(textOf(b));
    const tree = payloadOf(a);
    expect(tree).toMatchObject({
      OBJECT_NAME: 'ZROOT_A',
      OBJECT_PACKAGE: 'ZPARENT',
      OBJECT_DESCRIPTION: 'Found ZROOT_A',
    });
    expect(tree.CHILDREN[0]).toMatchObject({
      OBJECT_NAME: 'ZSUB_A',
      OBJECT_DESCRIPTION: 'Found ZSUB_A',
    });
    expect(tree.CHILDREN[0].CHILDREN[0].OBJECT_NAME).toBe('ZPROG_A');
  });

  it("envelopes per spec §11's row (per tier: roots, then type nodes; the searches last)", async () => {
    const fake = system();
    await withinTurns(handleGetObjectInfo(contextOn(fake), single));
    expect(fake.envelopes.map(partKeys)).toEqual([
      [nodeKey('DEVC/K', 'ZROOT_A')],
      [nodeKey('DEVC/K', 'ZROOT_A', '10'), nodeKey('DEVC/K', 'ZROOT_A', '20')],
      [nodeKey('DEVC/K', 'ZSUB_A')],
      [nodeKey('DEVC/K', 'ZSUB_A', '30')],
      ['SEARCH|ZROOT_A', 'SEARCH|ZSUB_A'],
    ]);
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
    expect(fake.envelopes).toHaveLength(5);
    const [a, b] = payloadOf(result);
    expect(a.OBJECT_NAME).toBe('ZROOT_A');
    expect(b.CHILDREN[0].CHILDREN[0].OBJECT_NAME).toBe('ZPROG_B');
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
    expect(a.CHILDREN).toHaveLength(2);
    expect(b).toMatchObject({
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
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
  });

  it('no communication batch → the sequential path', async () => {
    const fake = system();
    await withinTurns(handleGetObjectInfo(contextOn(fake, 'absent'), single));
    expect(fake.envelopes).toHaveLength(0);
    expect(fake.directs).toHaveLength(7);
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

describe.each(LIST_CALLS)(
  '$tool: a 401 SAP answered to one root of a list',
  ({ call, refused }) => {
    it('batched: ends the call as it came; no envelope after it', async () => {
      const fake = system({ refuse: { [refused]: 401 } });
      const result = await withinTurns(call(contextOn(fake)));
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textOf(result)).toContain('401');
      const at = fake.envelopes.findIndex((e) => partKeys(e).includes(refused));
      expect(at).toBeGreaterThanOrEqual(0);
      expect(fake.envelopes).toHaveLength(at + 1);
    });

    it('sequential: ends the call as it came; nothing is read after it', async () => {
      const fake = system({ refuse: { [refused]: 401 } });
      const result = await withinTurns(call(contextOn(fake, 'absent')));
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textOf(result)).toContain('401');
      const last = fake.directs[fake.directs.length - 1] as IAbapRequestOptions;
      expect(keyOf(last.method, last.url, last.params)).toBe(refused);
    });
  },
);

describe.each(LIST_CALLS)('$tool: an envelope failure', ({ tool, call }) => {
  it("is every item of that phase's failure, the envelope's error with its step", async () => {
    const fake = system({}, () => {
      throw statusError(500, 'Internal Server Error', 'placeholder');
    });
    const result = await withinTurns(call(contextOn(fake)));
    expect(fake.envelopes).toHaveLength(1);
    const entries = payloadOf(result) as Array<{ error?: unknown }>;
    expect(entries).toHaveLength(2);
    const step =
      tool === 'GetPackageTree'
        ? 'read package metadata'
        : tool === 'GetPackageContents'
          ? 'read package node structure'
          : 'read node structure';
    for (const entry of entries) {
      expect(entry.error).toMatchObject({
        message: 'Request failed with status code 500',
        step,
      });
    }
  });
});

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
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({ status: 401 });
    expect(fake.directs).toHaveLength(1);
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
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(fake.envelopes).toHaveLength(5);
  });
});

describe('GetObjectsList: the cache', () => {
  it('a list call leaves it as it was; a single call writes it', async () => {
    const before = { objects: [{ OBJECT_NAME: 'BEFORE' }] };
    objectsListCache.setCache(before);
    await withinTurns(
      handleGetObjectsList(contextOn(system()), {
        objects: [{ parent_type: 'PROG/P', parent_name: 'ZPROG_X' }],
      }),
    );
    expect(objectsListCache.getCache()).toBe(before);
    await withinTurns(
      handleGetObjectsList(contextOn(system()), {
        parent_type: 'PROG/P',
        parent_name: 'ZPROG_X',
        parent_tech_name: 'ZPROG_X',
      }),
    );
    expect(objectsListCache.getCache()).toMatchObject({
      parent_name: 'ZPROG_X',
      total_objects: 3,
    });
  });
});

describe('the single arguments keep their words', () => {
  it('GetPackageTree without a package', async () => {
    const result = await handleGetPackageTree(contextOn(system()), {
      package_name: '',
    });
    expect(textOf(result)).toContain('package_name is required');
  });

  it('GetObjectsList: objects beside a single parent field is refused', async () => {
    for (const field of ['parent_name', 'parent_type', 'parent_tech_name']) {
      const result = await handleGetObjectsList(contextOn(system()), {
        objects: [{ parent_type: 'PROG/P', parent_name: 'ZPROG_X' }],
        [field]: 'ZPROG_X',
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
    }
  });
});

describe('GetPackageTree: a metadata read SAP answered 401', () => {
  const refused = { refuse: { 'GET /sap/bc/adt/packages/zroot_a': 401 } };
  const call = (c: HandlerContext) =>
    handleGetPackageTree(c, { package_names: ['ZROOT_A', 'ZROOT_B'] });

  it('batched: ends the call as it came; nothing is walked', async () => {
    const fake = system(refused);
    const result = await withinTurns(call(contextOn(fake)));
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      status: 401,
      step: 'read package metadata',
    });
    expect(fake.envelopes).toHaveLength(1);
  });

  it('sequential: ends the call as it came; nothing is read after it', async () => {
    const fake = system(refused);
    const result = await withinTurns(call(contextOn(fake, 'absent')));
    expect(payloadOf(result)).toMatchObject({
      status: 401,
      step: 'read package metadata',
    });
    expect(fake.directs).toHaveLength(1);
  });
});
