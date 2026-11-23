import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type { HandlerContext } from '../../handlers/interfaces';
import {
  assembleList,
  assembleTree,
  codeFormatOf,
  concurrentReader,
  isNotLoaded,
  kindOf,
  NODE_READ_CONCURRENCY,
  type NodeLevel,
  type NodeStructureSource,
  nodeItemsOf,
  walkPackage,
  walkPackages,
} from '../../lib/strategies/packageWalk';
import { succeeded } from '../../lib/strategies/stepResponse';
import { corpusBody, corpusSidecar } from '../helpers/adtCorpus';
import { rejectionOf } from '../helpers/assertions';
import { levelOf, nodeLevelOfXml } from '../helpers/nodeLevels';

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
      // The document as our `node` reading answers it.
      return succeeded(nodeLevelOfXml(data));
    },
  };
  return source;
}

describe('the walk is composed of single-answer steps', () => {
  it('asks for the root, then once per object type it lists', async () => {
    const source = replaying();
    await walkPackage(source, 'ZMCP_SHR_PKG', { includeDescriptions: true });
    // one root call plus one per type — the eight the corpus recorded
    assert.equal(source.calls, 8);
  });

  it('finds every object the levels carried', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {
      includeDescriptions: true,
    });
    assert.ok(objects.length > 20);
    assert.equal(
      objects.every((o) => o.name && o.type),
      true,
    );
  });

  it('keeps the descriptions the shipped node reading drops', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {
      includeDescriptions: true,
    });
    assert.equal(
      objects.some((o) => (o.description ?? '').length > 0),
      true,
    );
  });

  it('answers no description when none is asked for, though the levels carry some', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG');
    assert.ok(objects.length > 0);
    assert.equal(
      objects.some((o) => 'description' in o),
      false,
    );
  });
});

describe('one walk, two assemblies', () => {
  it('a flat list names the package on every row', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {});
    const list = assembleList('ZMCP_SHR_PKG', objects);
    assert.equal(list.length, objects.length);
    assert.equal(
      list.every((i) => i.packageName === 'ZMCP_SHR_PKG'),
      true,
    );
  });

  it('a tree hangs the same objects under the package', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {});
    const tree = assembleTree('ZMCP_SHR_PKG', objects);
    assert.equal(tree.name, 'ZMCP_SHR_PKG');
    assert.equal(tree.isPackage, true);
    assert.equal(tree.children?.length, objects.length);
  });

  it('a leaf says what is below it with an empty array, not by omission', async () => {
    const objects = await walkPackage(replaying(), 'ZMCP_SHR_PKG', {});
    const tree = assembleTree('ZMCP_SHR_PKG', objects);
    assert.equal(
      tree.children?.every((c) => Array.isArray(c.children)),
      true,
    );
  });
});

describe('the derived fields', () => {
  for (const [type, kind, written] of [
    ['CLAS/OC', 'class', 'source'],
    ['DDLS/DF', 'view', 'source'],
    ['TABL/DT', 'table', 'source'],
    ['DEVC/K', 'package', 'xml'],
    ['DOMA/DD', 'domain', 'xml'],
    ['FUGR/F', 'functionGroup', 'xml'],
    ['BDEF/BDO', 'behaviorDefinition', 'source'],
  ]) {
    it(format('%s is %s, written as %s', type, kind, written), () => {
      assert.equal(kindOf(type), kind);
      assert.equal(codeFormatOf(type), written);
    });
  }

  it('an unknown type gets no kind rather than a wrong one', () => {
    assert.equal(kindOf('ZZZZ/QQ'), undefined);
  });
});

describe('the node reading', () => {
  it('reads one level into objects and what is below it', () => {
    const level = nodeLevelOfXml(
      corpusBody('read-object-tree-structure--01-nodestructure'),
    );
    // the root level lists types, not objects
    assert.equal(level.objects.length, 0);
    assert.ok(level.childNodes.length > 0);
    assert.ok(level.childNodes[0]?.nodeId);
  });

  it('reads objects out of a type level', () => {
    const level = nodeLevelOfXml(
      corpusBody('read-object-tree-structure--04-nodestructure'),
    );
    assert.ok(nodeItemsOf(level).length > 0);
    assert.ok(nodeItemsOf(level)[0]?.name);
  });

  it('answers an empty level for an empty body rather than throwing', () => {
    assert.deepStrictEqual(nodeLevelOfXml(''), levelOf([], []));
  });
});

/**
 * A subpackage's objects belong under the subpackage, not under the root.
 * `walkPackage` answered one flat list with no owner, so `assembleTree` hung
 * everything off the root and left every subpackage `children: []` (an on-premise system,
 * TEST_MCP with include_subpackages, 2026-09-25), and `assembleList` gave a
 * subpackage's objects the ROOT as their `packageName`.
 */
describe('subpackages keep their own objects', () => {
  const ok = (value: NodeLevel) => succeeded(value);
  const levels: Record<string, NodeLevel> = {
    'P|root': levelOf(
      [],
      [
        { type: 'DEVC/K', nodeId: '1' },
        { type: 'TABL/DT', nodeId: '2' },
      ],
    ),
    'P|1': levelOf([{ name: 'SUB', type: 'DEVC/K' }], []),
    'P|2': levelOf([{ name: 'T1', type: 'TABL/DT' }], []),
    'SUB|root': levelOf([], [{ type: 'TABL/DT', nodeId: '2' }]),
    'SUB|2': levelOf([{ name: 'T2', type: 'TABL/DT' }], []),
  };
  const source: NodeStructureSource = {
    async fetchNodeStructure(_t, name, options) {
      return ok(
        levels[`${name}|${options?.nodeId ?? 'root'}`] ?? levelOf([], []),
      );
    },
  };

  it('nests them in the tree', async () => {
    const walked = await walkPackage(source, 'P', { includeSubpackages: true });
    const tree = assembleTree('P', walked);
    const names = (n: { children?: Array<{ name: string }> }) =>
      (n.children ?? []).map((c) => c.name).sort();
    assert.deepStrictEqual(names(tree), ['SUB', 'T1']);
    const sub = (tree.children ?? []).find((c) => c.name === 'SUB') as any;
    assert.deepStrictEqual(names(sub), ['T2']);
  });

  it('names the package each listed object is in', async () => {
    const walked = await walkPackage(source, 'P', { includeSubpackages: true });
    const t2 = assembleList('P', walked).find((i) => i.name === 'T2');
    assert.equal(t2?.packageName, 'SUB');
  });
});

/**
 * SAP puts a message where an object should be when a node cannot be loaded —
 * On premise, TEST_AC_SHR's VIEW/DV node, 2026-09-25: OBJECT_NAME "Error loading
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
    assert.deepStrictEqual(
      nodeItemsOf(nodeLevelOfXml(data)).map((o) => o.name),
      ['ZV_REAL'],
    );
  });
});

/**
 * A node SAP cannot load is reported, not dropped: on premise (2026-11-22) a
 * package's Views node (`VIEW/DV`) comes from SAP's stored package tree
 * (`DWTREE`), whose entry SAP cannot load and answers 'Error loading node:'
 * (`CL_SEU_ADT_RES_REPO_STRUCTURE`, `create_tree_content`, message
 * `SEU_ADT 101`). The walk answers one row for it, in fixed words with the
 * node's type; SAP's text is in no row.
 */
describe('a node SAP could not load is reported', () => {
  const failedLevel =
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME><TECH_NAME>SAP_TEXT_NEVER_IN_A_ROW</TECH_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '</TREE_CONTENT></DATA></asx:values></asx:abap>';
  const goodLevel =
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_NAME>ZT_ONE</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '</TREE_CONTENT></DATA></asx:values></asx:abap>';
  const levels: Record<string, NodeLevel> = {
    'P|root': levelOf(
      [],
      [
        { type: 'VIEW/DV', nodeId: '1' },
        { type: 'TABL/DT', nodeId: '2' },
      ],
    ),
    'P|1': nodeLevelOfXml(failedLevel),
    'P|2': nodeLevelOfXml(goodLevel),
  };
  const source: NodeStructureSource = {
    async fetchNodeStructure(_t, name, options) {
      return succeeded(
        levels[`${name}|${options?.nodeId ?? 'root'}`] ?? levelOf([], []),
      );
    },
  };

  it('the node reading marks a level SAP could not load, and no other', () => {
    assert.equal(isNotLoaded(nodeLevelOfXml(failedLevel)), true);
    assert.equal(isNotLoaded(nodeLevelOfXml(goodLevel)), false);
  });

  it('the walk answers one row for it, in fixed words with its type', async () => {
    const walked = await walkPackage(source, 'P');
    assert.deepStrictEqual(
      walked.map((o) => [o.type, o.name]),
      [
        ['VIEW/DV', 'not loaded by SAP'],
        ['TABL/DT', 'ZT_ONE'],
      ],
    );
    assert.equal(
      JSON.stringify(walked).includes('SAP_TEXT_NEVER_IN_A_ROW'),
      false,
    );
  });

  it('the level-by-level walk answers the same row', async () => {
    const read = async (
      requests: readonly { parentName: string; nodeId?: string }[],
    ) =>
      Promise.all(
        requests.map(async (request) => ({
          ok: true as const,
          value: await source.fetchNodeStructure('DEVC/K', request.parentName, {
            ...(request.nodeId === undefined ? {} : { nodeId: request.nodeId }),
          }),
        })),
      );
    const [answered] = await walkPackages(read, ['P']);
    assert.ok(answered?.ok);
    assert.deepStrictEqual(
      answered.value.map((o) => [o.type, o.name]),
      [
        ['VIEW/DV', 'not loaded by SAP'],
        ['TABL/DT', 'ZT_ONE'],
      ],
    );
  });
});

// Codex round 9: two nodes SAP could not load in one level carry the same
// words — they stay two rows, in both walks.
describe('two nodes SAP could not load in one level', () => {
  const twoFailed =
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '</TREE_CONTENT></DATA></asx:values></asx:abap>';
  const levels: Record<string, NodeLevel> = {
    'P|root': levelOf([], [{ type: 'VIEW/DV', nodeId: '1' }]),
    'P|1': nodeLevelOfXml(twoFailed),
  };
  const source: NodeStructureSource = {
    async fetchNodeStructure(_t, name, options) {
      return succeeded(
        levels[`${name}|${options?.nodeId ?? 'root'}`] ?? levelOf([], []),
      );
    },
  };
  const TWO = [
    ['VIEW/DV', 'not loaded by SAP'],
    ['VIEW/DV', 'not loaded by SAP'],
  ];

  it('walkPackage answers two rows', async () => {
    const walked = await walkPackage(source, 'P');
    assert.deepStrictEqual(
      walked.map((o) => [o.type, o.name]),
      TWO,
    );
  });

  it('walkPackages answers two rows', async () => {
    const read = async (
      requests: readonly { parentName: string; nodeId?: string }[],
    ) =>
      Promise.all(
        requests.map(async (request) => ({
          ok: true as const,
          value: await source.fetchNodeStructure('DEVC/K', request.parentName, {
            ...(request.nodeId === undefined ? {} : { nodeId: request.nodeId }),
          }),
        })),
      );
    const [answered] = await walkPackages(read, ['P']);
    assert.ok(answered?.ok);
    assert.deepStrictEqual(
      answered.value.map((o) => [o.type, o.name]),
      TWO,
    );
  });
});

// Plan 9.3: the tree is what the writer writes, so it holds every walked
// object exactly once — an object whose package the tree never reaches
// included, at the root, where it was dropped.
describe('the tree holds every walked object', () => {
  it('an object of a package the tree does not reach is at the root', () => {
    const walked = [
      { name: 'SUB', type: 'DEVC/K', packageName: 'P' },
      { name: 'ZA', type: 'CLAS/OC', packageName: 'SUB' },
      { name: 'ZORPHAN', type: 'PROG/P', packageName: 'ELSEWHERE' },
      { name: 'ZSELF', type: 'DEVC/K', packageName: 'P' },
      { name: 'ZSELF', type: 'DEVC/K', packageName: 'ZSELF' },
    ];
    const tree = assembleTree('P', walked);
    const names: string[] = [];
    const visit = (node: { name: string; children?: readonly unknown[] }) => {
      for (const child of (node.children ?? []) as Array<{
        name: string;
        children?: readonly unknown[];
      }>) {
        names.push(child.name);
        visit(child);
      }
    };
    visit(tree);
    assert.deepStrictEqual([...names].sort(), walked.map((o) => o.name).sort());
  });

  type Named = { name: string; children?: readonly Named[] };
  const everyName = (tree: Named): string[] =>
    (tree.children ?? []).flatMap((c) => [c.name, ...everyName(c)]);

  // Codex round 10: the orphan's objects come before the chain that holds
  // its package — written once, under that package.
  it('an orphan listed before its missing-parent chain is written once, under its package', () => {
    const walked = [
      { name: 'ZLEAF', type: 'PROG/P', packageName: 'ZSUB' },
      { name: 'ZSUB', type: 'DEVC/K', packageName: 'ZMID' },
    ];
    const tree = assembleTree('P', walked) as Named;
    assert.deepStrictEqual(everyName(tree), ['ZSUB', 'ZLEAF']);
  });

  it('owners listing each other are written once each', () => {
    const walked = [
      { name: 'ZY', type: 'DEVC/K', packageName: 'ZX' },
      { name: 'ZX', type: 'DEVC/K', packageName: 'ZY' },
    ];
    const tree = assembleTree('P', walked) as Named;
    assert.deepStrictEqual([...everyName(tree)].sort(), ['ZX', 'ZY']);
  });
});

describe('concurrentReader', () => {
  const context = { connection: {} } as unknown as HandlerContext;
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  it('answers in item order, never more than NODE_READ_CONCURRENCY open at once', async () => {
    let open = 0;
    let most = 0;
    const read = concurrentReader<number, number>(context, async (n) => {
      open += 1;
      most = Math.max(most, open);
      // Later items finish first.
      for (let i = 0; i < 30 - n; i++) await tick();
      open -= 1;
      return n * 10;
    });
    const items = Array.from({ length: 30 }, (_, i) => i);
    const out = await read(items);
    assert.deepStrictEqual(
      out,
      items.map((n) => ({ ok: true, value: n * 10 })),
    );
    assert.equal(most, NODE_READ_CONCURRENCY);
    assert.equal(read.ownAnswers, true);
  });

  it("an item's failure is its own", async () => {
    const boom = new Error('refused');
    const read = concurrentReader<number, number>(context, async (n) => {
      if (n === 1) throw boom;
      return n;
    });
    assert.deepStrictEqual(await read([0, 1, 2]), [
      { ok: true, value: 0 },
      { ok: false, error: boom },
      { ok: true, value: 2 },
    ]);
  });

  it('a credential refusal starts no further read, and is thrown once the started reads settle', async () => {
    const refusal = new AuthRefusedError(
      authError['credential-refused']({ credential: 'token' }),
      'request',
    );
    const started: number[] = [];
    const held = new Map<number, () => void>();
    const read = concurrentReader<number, number>(context, (n) => {
      started.push(n);
      if (n === 0) return Promise.reject(refusal);
      return new Promise<number>((resolve) => {
        held.set(n, () => resolve(n));
      });
    });
    let settled = false;
    const answer = read(Array.from({ length: 40 }, (_, i) => i)).finally(() => {
      settled = true;
    });
    answer.catch(() => undefined);
    for (let i = 0; i < 5; i++) await tick();
    // The refused read's pump stopped; the other pumps hold their reads.
    assert.deepStrictEqual(
      started,
      Array.from({ length: NODE_READ_CONCURRENCY }, (_, i) => i),
    );
    assert.equal(settled, false);
    for (const release of held.values()) release();
    assert.equal(await rejectionOf(answer), refusal);
    assert.equal(started.length, NODE_READ_CONCURRENCY);
  });

  it('an answer stopsAt accepts starts no further read; the items read are answered', async () => {
    const started: number[] = [];
    const held = new Map<number, () => void>();
    const read = concurrentReader<number, string>(
      context,
      (n) => {
        started.push(n);
        if (n === 0) return Promise.resolve('refused');
        return new Promise<string>((resolve) => {
          held.set(n, () => resolve(`read ${n}`));
        });
      },
      (value) => value === 'refused',
    );
    const answer = read(Array.from({ length: 40 }, (_, i) => i));
    for (let i = 0; i < 5; i++) await tick();
    assert.deepStrictEqual(
      started,
      Array.from({ length: NODE_READ_CONCURRENCY }, (_, i) => i),
    );
    for (const release of held.values()) release();
    const out = await answer;
    assert.equal(started.length, NODE_READ_CONCURRENCY);
    assert.deepStrictEqual(out, [
      { ok: true, value: 'refused' },
      ...Array.from({ length: NODE_READ_CONCURRENCY - 1 }, (_, i) => ({
        ok: true,
        value: `read ${i + 1}`,
      })),
    ]);
  });
});

/**
 * An object node SAP lists without its technical name or URI is listed, never
 * dropped (adt-strategies 0.28.1 reads it as `incompleteObjects`).
 */
describe('an object SAP lists incomplete is listed', () => {
  const level =
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_NAME>ZT_FULL</OBJECT_NAME><TECH_NAME>ZT_FULL</TECH_NAME><OBJECT_URI>/sap/bc/adt/ddic/tables/zt_full</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_NAME>ZT_BARE</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '</TREE_CONTENT></DATA></asx:values></asx:abap>';

  it('the walk answers both objects', async () => {
    const source: NodeStructureSource = {
      async fetchNodeStructure(_t, _name, options) {
        return succeeded(
          options?.nodeId === undefined ? nodeLevelOfXml(level) : levelOf([]),
        );
      },
    };
    const walked = await walkPackage(source, 'P');
    assert.deepStrictEqual(
      walked.map((o) => o.name),
      ['ZT_FULL', 'ZT_BARE'],
    );
  });
});

/**
 * A package's own level SAP could not load is reported, never answered as an
 * empty package; and a not-loaded row is never walked into, a `DEVC/K` one
 * included (Codex P1).
 */
describe('a root or a subpackage node SAP could not load', () => {
  const failed =
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE/><OBJECT_NAME>Error loading node:</OBJECT_NAME><TECH_NAME>SAP_TEXT</TECH_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '</TREE_CONTENT></DATA></asx:values></asx:abap>';
  const fetched: string[] = [];
  const levels: Record<string, NodeLevel> = {
    'ROOTLESS|root': nodeLevelOfXml(failed),
    'P|root': levelOf([], [{ type: 'DEVC/K', nodeId: '1' }]),
    'P|1': nodeLevelOfXml(failed),
  };
  const source: NodeStructureSource = {
    async fetchNodeStructure(_t, name, options) {
      fetched.push(`${name}|${options?.nodeId ?? 'root'}`);
      return succeeded(
        levels[`${name}|${options?.nodeId ?? 'root'}`] ?? levelOf([], []),
      );
    },
  };
  const read = async (
    requests: readonly { parentName: string; nodeId?: string }[],
  ) =>
    Promise.all(
      requests.map(async (request) => ({
        ok: true as const,
        value: await source.fetchNodeStructure('DEVC/K', request.parentName, {
          ...(request.nodeId === undefined ? {} : { nodeId: request.nodeId }),
        }),
      })),
    );

  it('a root SAP could not load is a row, package by package and level by level', async () => {
    const rows = [['DEVC/K', 'not loaded by SAP']];
    assert.deepStrictEqual(
      (await walkPackage(source, 'ROOTLESS')).map((o) => [o.type, o.name]),
      rows,
    );
    const [answered] = await walkPackages(read, ['ROOTLESS']);
    assert.ok(answered?.ok);
    assert.deepStrictEqual(
      answered.value.map((o) => [o.type, o.name]),
      rows,
    );
  });

  it('a DEVC/K node not loaded is reported, and never read as a package of that name', async () => {
    fetched.length = 0;
    const walked = await walkPackage(source, 'P', { includeSubpackages: true });
    assert.deepStrictEqual(
      walked.map((o) => [o.type, o.name]),
      [['DEVC/K', 'not loaded by SAP']],
    );
    const [answered] = await walkPackages(read, ['P'], {
      includeSubpackages: true,
    });
    assert.ok(answered?.ok);
    assert.deepStrictEqual(
      answered.value.map((o) => [o.type, o.name]),
      [['DEVC/K', 'not loaded by SAP']],
    );
    assert.equal(
      fetched.some((key) => key.startsWith('NOT LOADED BY SAP')),
      false,
      fetched.join(', '),
    );
    const tree = assembleTree('P', walked);
    assert.deepStrictEqual(tree.children?.[0]?.children ?? [], []);
  });
});

/**
 * Objects SAP lists without a name stay distinct by every identity field
 * they carry (Codex P1): two of the same type with different technical names
 * or URIs are two rows.
 */
describe('incomplete objects keep apart by every identity field', () => {
  it('two nameless objects of one type, told apart by their URI', async () => {
    const level =
      '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
      '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_URI>/sap/bc/adt/ddic/tables/a</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
      '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_URI>/sap/bc/adt/ddic/tables/b</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
      '</TREE_CONTENT></DATA></asx:values></asx:abap>';
    const source: NodeStructureSource = {
      async fetchNodeStructure(_t, _name, options) {
        return succeeded(
          options?.nodeId === undefined ? nodeLevelOfXml(level) : levelOf([]),
        );
      },
    };
    const walked = await walkPackage(source, 'P');
    assert.deepStrictEqual(
      walked.map((o) => o.uri),
      ['/sap/bc/adt/ddic/tables/a', '/sap/bc/adt/ddic/tables/b'],
    );
  });
});

describe('the walk key is case-insensitive on every field, the type too', () => {
  it('PROG/P and prog/p of one name are one row', async () => {
    const level =
      '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
      '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>PROG/P</OBJECT_TYPE><OBJECT_NAME>ZP</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
      '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>prog/p</OBJECT_TYPE><OBJECT_NAME>ZP</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
      '</TREE_CONTENT></DATA></asx:values></asx:abap>';
    const source: NodeStructureSource = {
      async fetchNodeStructure(_t, _name, options) {
        return succeeded(
          options?.nodeId === undefined ? nodeLevelOfXml(level) : levelOf([]),
        );
      },
    };
    assert.equal((await walkPackage(source, 'P')).length, 1);
  });
});

/**
 * A subpackage SAP lists without a name is reported, never read: no request
 * names it (a package without a name answers a 500), and its named sibling
 * is still walked (Codex P1).
 */
describe('a subpackage without a name', () => {
  const root =
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>DEVC/K</OBJECT_TYPE><OBJECT_URI>/sap/bc/adt/packages/nameless</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>DEVC/K</OBJECT_TYPE><OBJECT_NAME>ZSUB</OBJECT_NAME><TECH_NAME>ZSUB</TECH_NAME><OBJECT_URI>/sap/bc/adt/packages/zsub</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '</TREE_CONTENT></DATA></asx:values></asx:abap>';
  const sub =
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>' +
    '<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>PROG/P</OBJECT_TYPE><OBJECT_NAME>ZP_IN_SUB</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>' +
    '</TREE_CONTENT></DATA></asx:values></asx:abap>';
  const fetched: string[] = [];
  const source: NodeStructureSource = {
    async fetchNodeStructure(_t, name, options) {
      fetched.push(name);
      if (name === '') throw new Error('500: a package without a name');
      if (options?.nodeId !== undefined) return succeeded(levelOf([]));
      return succeeded(nodeLevelOfXml(name === 'P' ? root : sub));
    },
  };
  const read = async (
    requests: readonly { parentName: string; nodeId?: string }[],
  ) =>
    Promise.all(
      requests.map(async (request) => ({
        ok: true as const,
        value: await source.fetchNodeStructure('DEVC/K', request.parentName, {
          ...(request.nodeId === undefined ? {} : { nodeId: request.nodeId }),
        }),
      })),
    );

  it('is listed, never read; its sibling is walked, package by package and level by level', async () => {
    fetched.length = 0;
    const walked = await walkPackage(source, 'P', { includeSubpackages: true });
    assert.equal(fetched.includes(''), false, fetched.join(', '));
    assert.ok(walked.some((o) => o.type === 'DEVC/K' && o.name === ''));
    assert.ok(walked.some((o) => o.name === 'ZP_IN_SUB'));
    fetched.length = 0;
    const [answered] = await walkPackages(read, ['P'], {
      includeSubpackages: true,
    });
    assert.ok(answered?.ok);
    assert.equal(fetched.includes(''), false, fetched.join(', '));
    assert.ok(answered.value.some((o) => o.name === 'ZP_IN_SUB'));
  });
});
