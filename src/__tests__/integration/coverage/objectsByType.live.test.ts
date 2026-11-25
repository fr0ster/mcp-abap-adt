/**
 * Object tree reads, live, on both systems, of the shared package (read
 * only, nothing created):
 *
 * - `GetObjectsByType` lists the classes of the shared package: the node id
 *   of its class folder is what SAP's node structure of the package root
 *   names for `CLAS/OC` (`OBJECT_TYPES`, `NODE_ID`). No tool answers that id
 *   (the reads keep it to walk the tree), so the case reads the root through
 *   the suite's own connection, the request `GetObjectsByType` itself sends
 *   with node `000000`. The id differs between the systems (measured
 *   2026-11-15: `000070` on premise, `000029` on the cloud system).
 * - `GetObjectNodeFromCache` answers the shared class's node from the list
 *   `GetObjectsByType` just cached, and reads the object its `OBJECT_URI`
 *   names. Its `TECH_NAME` is the one SAP's node structure of the class
 *   folder states, read the same way.
 *
 * Both run through the in-process server (`throughServer`): the cache is the
 * server process's own, and `GetObjectNodeFromCache` answers a JSON item.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { getSharedDependenciesConfig } from '../helpers/configHelpers';
import {
  liveCall,
  liveConnection,
  liveSuite,
  throughServer,
} from '../helpers/live';
import { member, payloadOf, succeeded } from './ownObjects';

/** The shared class every system holds in the shared package. */
const SHARED_CLASS = 'ZCL_MCP_SHARED_CLS';

/** The shared package the configuration names. */
function sharedPackage(): string {
  const named = member(getSharedDependenciesConfig(), 'package');
  if (typeof named !== 'string' || named === '') {
    throw new Error('the test config names no shared package');
  }
  return named.toUpperCase();
}

/** The text of every `<tag>…</tag>` in `xml`, in order (plain string search). */
function elements(xml: string, tag: string): string[] {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const found: string[] = [];
  let at = xml.indexOf(open);
  while (at !== -1) {
    const end = xml.indexOf(close, at + open.length);
    if (end === -1) break;
    found.push(xml.slice(at + open.length, end));
    at = xml.indexOf(open, end + close.length);
  }
  return found;
}

/** One level of the package's node structure, as SAP answers it. */
async function nodeLevel(packageName: string, nodeId: string): Promise<string> {
  const answered = await liveConnection().makeAdtRequest({
    url: '/sap/bc/adt/repository/nodestructure',
    method: 'POST',
    timeout: 0,
    params: {
      parent_type: 'DEVC/K',
      parent_name: packageName,
      parent_tech_name: packageName,
      withShortDescriptions: false,
      node_id: nodeId,
    },
    headers: {
      Accept:
        'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/xml',
      'Content-Type':
        'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
    },
    data: `<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>${nodeId}</TV_NODEKEY></DATA></asx:values></asx:abap>`,
  });
  return String(answered.data ?? '');
}

/** What SAP's node structure says: the class folder's id and the shared class's tech name. */
const found: { classNode?: string; techName?: string } = {};

liveSuite(['onprem', 'cloud'], 'Object tree reads', () => {
  before(async () => {
    const pkg = sharedPackage();
    const root = await nodeLevel(pkg, '000000');
    const classes = elements(root, 'SEU_ADT_OBJECT_TYPE_INFO').find(
      (info) => elements(info, 'OBJECT_TYPE')[0] === 'CLAS/OC',
    );
    const classNode =
      classes === undefined ? undefined : elements(classes, 'NODE_ID')[0];
    if (classNode === undefined) {
      throw new Error(`the shared package ${pkg} has no class folder`);
    }
    found.classNode = classNode;
    const folder = await nodeLevel(pkg, classNode);
    const node = elements(folder, 'SEU_ADT_REPOSITORY_OBJ_NODE').find(
      (entry) => elements(entry, 'OBJECT_NAME')[0] === SHARED_CLASS,
    );
    const techName =
      node === undefined ? undefined : elements(node, 'TECH_NAME')[0];
    if (techName === undefined) {
      throw new Error(`${SHARED_CLASS} is not in the class folder of ${pkg}`);
    }
    found.techName = techName;
  });

  describe('through the server', () => {
    throughServer();

    it('GetObjectsByType lists the classes of the shared package', async () => {
      const { classNode } = found;
      if (classNode === undefined) throw new Error('no class folder was found');
      const pkg = sharedPackage();
      const listed = await liveCall('GetObjectsByType', {
        parent_name: pkg,
        parent_tech_name: pkg,
        parent_type: 'DEVC/K',
        node_id: classNode,
      });
      const text = succeeded('GetObjectsByType', listed).text;
      assert.ok(
        text
          .split('\n')
          .some((line) => line.startsWith(`CLAS/OC\t${SHARED_CLASS}\t`)),
        text,
      );
    });

    it('GetObjectNodeFromCache answers the cached node of the shared class and reads its object', async () => {
      const { techName } = found;
      if (techName === undefined) throw new Error('no tech name was found');
      const read = await liveCall('GetObjectNodeFromCache', {
        object_type: 'CLAS/OC',
        object_name: SHARED_CLASS,
        tech_name: techName,
      });
      const node = payloadOf(succeeded('GetObjectNodeFromCache', read));
      assert.equal(member(node, 'OBJECT_NAME'), SHARED_CLASS);
      assert.equal(member(node, 'TECH_NAME'), techName);
      const object = member(node, 'object_uri_response');
      assert.equal(typeof object, 'string');
      assert.ok(
        String(object).includes(SHARED_CLASS.toLowerCase()) ||
          String(object).includes(SHARED_CLASS),
      );
    });
  });
});
