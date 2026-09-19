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
