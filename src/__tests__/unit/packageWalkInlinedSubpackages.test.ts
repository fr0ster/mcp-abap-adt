/**
 * A package root that already lists its subpackages (measured on premise,
 * 2026-11-22, BASIS 816): the root node structure of a package with a
 * subpackage answers that subpackage in its own `TREE_CONTENT`, and the
 * `DEVC/K` type node the root lists answers it again. The walk lists each
 * object of a package once — the subpackage included — and walks the
 * subpackage once, in both walkers: `walkPackage` (sequential) and
 * `walkPackages` (level by level).
 *
 * The documents are the measured answers' shape, the names sanitised.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PhaseResult } from '../../lib/batch/phases';
import {
  assembleList,
  assembleTree,
  type NodeAnswer,
  type NodeRequest,
  type NodeStructureSource,
  walkPackage,
  walkPackages,
} from '../../lib/strategies/packageWalk';
import { succeeded } from '../../lib/strategies/stepResponse';
import { nodeLevelOfXml } from '../helpers/nodeLevels';

/** One `SEU_ADT_REPOSITORY_OBJ_NODE`. */
function objectNode(type: string, name: string): string {
  return `<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>${type}</OBJECT_TYPE><OBJECT_NAME>${name}</OBJECT_NAME><TECH_NAME>${name}</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/${name.toLowerCase()}</OBJECT_URI><NODE_ID/><DESCRIPTION>${name} text</DESCRIPTION></SEU_ADT_REPOSITORY_OBJ_NODE>`;
}

/** One `SEU_ADT_OBJECT_TYPE_INFO`. */
function typeNode(type: string, nodeId: string): string {
  return `<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>${type}</OBJECT_TYPE><NODE_ID>${nodeId}</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>`;
}

/** A node structure document. */
function documentOf(objects: string[], types: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>${objects.join('')}</TREE_CONTENT><OBJECT_TYPES>${types.join('')}</OBJECT_TYPES></DATA></asx:values></asx:abap>`;
}

/**
 * `ZPKG_PARENT`: its root answers the subpackage inline and lists the
 * subpackages node (2) and a program node (7); node 2 answers the
 * subpackage again. `ZPKG_PARENT_SUB` holds one program.
 */
const DOCUMENTS: Record<string, string> = {
  'ZPKG_PARENT|root': documentOf(
    [objectNode('DEVC/K', 'ZPKG_PARENT_SUB')],
    [typeNode('DEVC/K', '000002'), typeNode('PROG/P', '000007')],
  ),
  'ZPKG_PARENT|2': documentOf([objectNode('DEVC/K', 'ZPKG_PARENT_SUB')], []),
  'ZPKG_PARENT|7': documentOf([objectNode('PROG/P', 'ZPKG_PROG')], []),
  'ZPKG_PARENT_SUB|root': documentOf([], [typeNode('PROG/P', '000007')]),
  'ZPKG_PARENT_SUB|7': documentOf([objectNode('PROG/P', 'ZPKG_SUB_PROG')], []),
};

const keyOf = (name: string, nodeId?: string) => `${name}|${nodeId ?? 'root'}`;

function answerOf(key: string): NodeAnswer {
  return succeeded(nodeLevelOfXml(DOCUMENTS[key] ?? documentOf([], [])));
}

function source(): { utils: NodeStructureSource; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    utils: {
      async fetchNodeStructure(_type, name, options) {
        const key = keyOf(name, options?.nodeId);
        asked.push(key);
        return answerOf(key);
      },
    },
  };
}

/** A level reader over the same documents, as `batchReader` reads a level. */
function levelReader(asked: string[]) {
  return async (
    items: readonly NodeRequest[],
  ): Promise<PhaseResult<NodeAnswer>[]> =>
    items.map((item) => {
      const key = keyOf(item.parentName, item.nodeId);
      asked.push(key);
      return { ok: true, value: answerOf(key) };
    });
}

/** Each row as `type name in package`. */
const rowsOf = (
  objects: readonly { name: string; type: string; packageName?: string }[],
) => objects.map((o) => `${o.type} ${o.name} in ${o.packageName ?? '?'}`);

const EXPECTED = [
  'DEVC/K ZPKG_PARENT_SUB in ZPKG_PARENT',
  'PROG/P ZPKG_PROG in ZPKG_PARENT',
  'PROG/P ZPKG_SUB_PROG in ZPKG_PARENT_SUB',
];

describe('a root that lists its subpackages inline', () => {
  it('walkPackage lists the subpackage once, and its objects', async () => {
    const { utils, asked } = source();
    const objects = await walkPackage(utils, 'ZPKG_PARENT', {
      includeSubpackages: true,
    });
    assert.deepEqual(rowsOf(objects), EXPECTED);
    assert.equal(asked.filter((k) => k === 'ZPKG_PARENT_SUB|root').length, 1);
  });

  it('walkPackages lists the subpackage once, and its objects', async () => {
    const asked: string[] = [];
    const [walked] = await walkPackages(levelReader(asked), ['ZPKG_PARENT'], {
      includeSubpackages: true,
    });
    assert.ok(walked?.ok, 'the walk failed');
    assert.deepEqual(rowsOf(walked.value), EXPECTED);
    assert.equal(asked.filter((k) => k === 'ZPKG_PARENT_SUB|root').length, 1);
  });

  it('the list and the tree name the subpackage once', async () => {
    const { utils } = source();
    const objects = await walkPackage(utils, 'ZPKG_PARENT', {
      includeSubpackages: true,
    });
    const list = assembleList('ZPKG_PARENT', objects);
    assert.equal(list.filter((i) => i.name === 'ZPKG_PARENT_SUB').length, 1);
    const tree = assembleTree('ZPKG_PARENT', objects);
    const subs = (tree.children ?? []).filter(
      (c) => c.name === 'ZPKG_PARENT_SUB',
    );
    assert.equal(subs.length, 1);
    assert.deepEqual(
      subs[0]?.children?.map((c) => c.name),
      ['ZPKG_SUB_PROG'],
    );
  });

  it('without subpackages, the package lists each object once', async () => {
    const { utils } = source();
    const objects = await walkPackage(utils, 'ZPKG_PARENT');
    assert.deepEqual(rowsOf(objects), EXPECTED.slice(0, 2));
    const [walked] = await walkPackages(levelReader([]), ['ZPKG_PARENT']);
    assert.ok(walked?.ok, 'the walk failed');
    assert.deepEqual(rowsOf(walked.value), EXPECTED.slice(0, 2));
  });
});

describe('what makes two rows one object', () => {
  /** A walk of `ZPKG_KEYS`: a root listing two type nodes, each answering `nodes`. */
  async function walkOf(first: string[], second: string[]): Promise<string[]> {
    const documents: Record<string, string> = {
      'ZPKG_KEYS|root': documentOf(
        [],
        [typeNode('PROG/P', '000001'), typeNode('CLAS/OC', '000002')],
      ),
      'ZPKG_KEYS|1': documentOf(first, []),
      'ZPKG_KEYS|2': documentOf(second, []),
    };
    const utils: NodeStructureSource = {
      async fetchNodeStructure(_type, name, options) {
        return succeeded(
          nodeLevelOfXml(
            documents[keyOf(name, options?.nodeId)] ?? documentOf([], []),
          ),
        );
      },
    };
    return rowsOf(await walkPackage(utils, 'ZPKG_KEYS'));
  }

  it('the same name under two types is two objects', async () => {
    assert.deepEqual(
      await walkOf(
        [objectNode('PROG/P', 'ZPKG_SAME')],
        [objectNode('CLAS/OC', 'ZPKG_SAME')],
      ),
      ['PROG/P ZPKG_SAME in ZPKG_KEYS', 'CLAS/OC ZPKG_SAME in ZPKG_KEYS'],
    );
  });

  // Repository object names are upper case: SAP answered the same object to
  // a lower-case and an upper-case query, upper case both times (on premise,
  // 2026-11-22). The walk reads names as SAP's repository does, as it does
  // for the subpackages it walks.
  it('names that differ only in case are one object', async () => {
    assert.deepEqual(
      await walkOf(
        [objectNode('PROG/P', 'ZPKG_CASE'), objectNode('PROG/P', 'zpkg_case')],
        [],
      ),
      ['PROG/P ZPKG_CASE in ZPKG_KEYS'],
    );
  });
});
