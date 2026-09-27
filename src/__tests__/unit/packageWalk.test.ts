import { corpusBody, corpusSidecar } from '../../lib/adtCorpus';
import {
  assembleList,
  assembleTree,
  codeFormatOf,
  kindOf,
  type NodeStructureSource,
  nodeLevel,
  walkPackage,
} from '../../lib/strategies/packageWalk';

/**
 * The walk, offline, over the levels the corpus recorded.
 *
 * `read-object-tree-structure` is eight exchanges: one root level listing the
 * package's object types, then one per type. That is the whole walk, so a fake
 * that replays them exercises it without a system.
 */

function levels(): { root: string; byNodeId: Map<string, string> } {
  const names = corpusSidecar; // keep the import honest
  void names;
  const files = Array.from(
    { length: 8 },
    (_, i) => `read-object-tree-structure--0${i + 1}-nodestructure`,
  );
  const root = corpusBody(files[0]);
  const byNodeId = new Map<string, string>();
  for (const file of files.slice(1)) {
    const nodeId = corpusSidecar(file).request.params?.node_id;
    if (nodeId) byNodeId.set(nodeId, corpusBody(file));
  }
  return { root, byNodeId };
}

function replaying(): NodeStructureSource & { calls: number } {
  const { root, byNodeId } = levels();
  const source = {
    calls: 0,
    async fetchNodeStructure(
      _parentType: string,
      _parentName: string,
      options?: { nodeId?: string },
    ) {
      source.calls += 1;
      const nodeId = options?.nodeId;
      const data = nodeId ? (byNodeId.get(nodeId) ?? '') : root;
      return { data };
    },
  };
  return source;
}

describe('the walk is composed of single-answer steps', () => {
  it('asks for the root, then once per object type it lists', async () => {
    const source = replaying();
    await walkPackage(source, 'ZMCP_SHR_PKG', { includeDescriptions: true });
    // one root call plus one per type — the eight the corpus recorded
    expect(source.calls).toBe(8);
  });

  it('finds every object the levels carried', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {
      includeDescriptions: true,
    });
    expect(objects.length).toBeGreaterThan(20);
    expect(objects.every((o) => o.name && o.type)).toBe(true);
  });

  it('keeps the descriptions the shipped node reading drops', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {
      includeDescriptions: true,
    });
    expect(objects.some((o) => (o.description ?? '').length > 0)).toBe(true);
  });
});

describe('one walk, two assemblies', () => {
  it('a flat list names the package on every row', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {});
    const list = assembleList('ZMCP_SHR_PKG', objects);
    expect(list).toHaveLength(objects.length);
    expect(list.every((i) => i.packageName === 'ZMCP_SHR_PKG')).toBe(true);
  });

  it('a tree hangs the same objects under the package', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {});
    const tree = assembleTree('ZMCP_SHR_PKG', objects);
    expect(tree.name).toBe('ZMCP_SHR_PKG');
    expect(tree.isPackage).toBe(true);
    expect(tree.children).toHaveLength(objects.length);
  });

  it('a leaf says what is below it with an empty array, not by omission', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {});
    const tree = assembleTree('ZMCP_SHR_PKG', objects);
    expect(tree.children?.every((c) => Array.isArray(c.children))).toBe(true);
  });
});

describe('the derived fields', () => {
  it.each([
    ['CLAS/OC', 'class', 'source'],
    ['DDLS/DF', 'view', 'source'],
    ['TABL/DT', 'table', 'source'],
    ['DEVC/K', 'package', 'xml'],
    ['DOMA/DD', 'domain', 'xml'],
    ['FUGR/F', 'functionGroup', 'xml'],
    ['BDEF/BDO', 'behaviorDefinition', 'source'],
  ])('%s is %s, written as %s', (type, kind, format) => {
    expect(kindOf(type)).toBe(kind);
    expect(codeFormatOf(type)).toBe(format);
  });

  it('an unknown type gets no kind rather than a wrong one', () => {
    expect(kindOf('ZZZZ/QQ')).toBeUndefined();
  });
});

describe('the node reading', () => {
  it('reads one level into objects and what is below it', () => {
    const level = nodeLevel({
      data: corpusBody('read-object-tree-structure--01-nodestructure'),
    });
    // the root level lists types, not objects
    expect(level.objects).toHaveLength(0);
    expect(level.childNodes.length).toBeGreaterThan(0);
    expect(level.childNodes[0].nodeId).toBeTruthy();
  });

  it('reads objects out of a type level', () => {
    const level = nodeLevel({
      data: corpusBody('read-object-tree-structure--04-nodestructure'),
    });
    expect(level.objects.length).toBeGreaterThan(0);
    expect(level.objects[0].name).toBeTruthy();
  });

  it('answers an empty level for an empty body rather than throwing', () => {
    expect(nodeLevel({ data: '' })).toEqual({ objects: [], childNodes: [] });
  });
});

/**
 * The library's own reading of a node structure, as `getUtils()` without
 * `ourUtils` answers it — measured on E19, 2026-09-25:
 * `{objects: [{objectType, objectName, techName, objectUri}],
 *   childNodes: [{objectType, nodeId: '000035'}]}`.
 *
 * `levelOf` used to pass anything with `childNodes` through as our
 * `NodeLevel`, so `name`/`type` came out undefined: GetPackageContents
 * answered rows of `{packageName, isPackage: false}` and GetPackageTree
 * nameless children, and `include_subpackages` never recursed.
 */
describe("the library's own reading is mapped, never passed through as ours", () => {
  const ok = (value: unknown) => ({ ok: true, getResult: () => ({ value }) });

  it('names the objects and types the child nodes', async () => {
    const source: NodeStructureSource = {
      async fetchNodeStructure(_t, _n, options) {
        if (!options?.nodeId || options.nodeId === '000000') {
          return ok({
            objects: [],
            childNodes: [{ objectType: 'TABL/DT', nodeId: '000035' }],
          });
        }
        return ok({
          objects: [
            {
              objectType: 'TABL/DT',
              objectName: 'ZMCP_SHR_RTABL',
              techName: 'ZMCP_SHR_RTABL',
              objectUri: '/sap/bc/adt/ddic/tables/zmcp_shr_rtabl',
            },
          ],
          childNodes: [],
        });
      },
    };

    const walked = await walkPackage(source, 'TEST_MCP_SHR_PKG', {});
    const items = assembleList('TEST_MCP_SHR_PKG', walked);
    expect(JSON.stringify(items)).toContain('ZMCP_SHR_RTABL');
    expect(JSON.stringify(items)).toContain('TABL/DT');
  });
});

/**
 * A subpackage's objects belong under the subpackage, not under the root.
 * `walkPackage` answered one flat list with no owner, so `assembleTree` hung
 * everything off the root and left every subpackage `children: []` (E19,
 * TEST_MCP with include_subpackages, 2026-09-25), and `assembleList` gave a
 * subpackage's objects the ROOT as their `packageName`.
 */
describe('subpackages keep their own objects', () => {
  const ok = (value: unknown) => ({ ok: true, getResult: () => ({ value }) });
  const levels: Record<string, Record<string, unknown>> = {
    'P|root': {
      objects: [],
      childNodes: [
        { type: 'DEVC/K', nodeId: '1' },
        { type: 'TABL/DT', nodeId: '2' },
      ],
    },
    'P|1': { objects: [{ name: 'SUB', type: 'DEVC/K' }], childNodes: [] },
    'P|2': { objects: [{ name: 'T1', type: 'TABL/DT' }], childNodes: [] },
    'SUB|root': { objects: [], childNodes: [{ type: 'TABL/DT', nodeId: '2' }] },
    'SUB|2': { objects: [{ name: 'T2', type: 'TABL/DT' }], childNodes: [] },
  };
  const source: NodeStructureSource = {
    async fetchNodeStructure(_t, name, options) {
      return ok(
        levels[`${name}|${options?.nodeId ?? 'root'}`] ?? {
          objects: [],
          childNodes: [],
        },
      );
    },
  };

  it('nests them in the tree', async () => {
    const walked = await walkPackage(source, 'P', { includeSubpackages: true });
    const tree = assembleTree('P', walked);
    const names = (n: { children?: Array<{ name: string }> }) =>
      (n.children ?? []).map((c) => c.name).sort();
    expect(names(tree)).toEqual(['SUB', 'T1']);
    const sub = (tree.children ?? []).find((c) => c.name === 'SUB') as any;
    expect(names(sub)).toEqual(['T2']);
  });

  it('names the package each listed object is in', async () => {
    const walked = await walkPackage(source, 'P', { includeSubpackages: true });
    const t2 = assembleList('P', walked).find((i) => i.name === 'T2');
    expect(t2?.packageName).toBe('SUB');
  });
});

/**
 * SAP puts a message where an object should be when a node cannot be loaded —
 * E19, TEST_AC_SHR's VIEW/DV node, 2026-09-25: OBJECT_NAME "Error loading
 * node:", no OBJECT_TYPE, the explanation in TECH_NAME. It is not an object,
 * and listing it as one put a nameless-typed row in GetPackageTree.
 */
describe('a node-load message is not an object', () => {
  it('drops an entry with no object type', () => {
    const data =
      '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
      '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>VIEW/DV</OBJECT_TYPE><OBJECT_NAME>ZV_REAL</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
      '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME><TECH_NAME>The API state can be edited...</TECH_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
      '</TREE_CONTENT></DATA></asx:values></asx:abap>';
    expect(nodeLevel({ data }).objects.map((o) => o.name)).toEqual(['ZV_REAL']);
  });
});
