/**
 * The other single-call core reads in envelopes (spec §8.2 group B, §8.3):
 *
 * - the pinning: no tool left out of the task has a core entry, no core
 *   entry's requests are transport requests, and `GetObjectsByType` alone
 *   reads a node structure;
 * - a second node structure in one envelope is refused, the first recorded;
 * - the independent requests of one call (`GetObjectVersionDiff`) share its
 *   number and go in the one envelope;
 * - with a background strategy, a listed long read given a handle and no
 *   `background` is recorded in the main flow, no run created, while without
 *   a handle it runs in the background; `background: true` with a handle is
 *   refused;
 * - the data tools: admitted where served, unlisted where they are off;
 * - access restrictions: a refused read takes no number and sends nothing.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { parseTableEntry } from '../../../lib/access/accessLists';
import { listedAccessChecks } from '../../../lib/access/listedAccessChecks';
import { batchEntries } from '../../../lib/batch/eligibility';
import { InstanceEnvelopes } from '../../../lib/batch/InstanceEnvelopes';
import { fullToolSet } from '../../../lib/toolSet';
import { corpusBody } from '../../helpers/adtCorpus';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { batchStand, payloadOf } from '../../helpers/batchStand';

process.env.SAP_SYSTEM_TYPE = 'onprem';

afterEach(() => mock.restoreAll());

const NEVER_ADMITTED = [
  'GetTransport',
  'ListTransports',
  'ReadTransportActionLog',
  'ReadTransportObjects',
  'GetObjectsList',
  'GetPackageContents',
  'GetObjectInfo',
  'SearchSource',
  'GetPackageTree',
  'DescribeByList',
  'GetIncludesList',
  'GetStructuresList',
  'GetWhereUsed',
  'RuntimeListFeeds',
  'GetEnhancements',
  'GetTypeInfo',
  'GetTextElements',
  'ListFunctionModules',
  'ListFunctionGroupIncludes',
  'GetUnitTestResult',
  'RunATC',
];

const core = () => batchEntries().filter((entry) => entry.set === 'core');

const NODE_LEVEL = corpusBody(
  'read-package-contents-structure--01-nodestructure',
);
const sap =
  (body?: string) =>
  (inner: InnerRequest): PartAnswer => ({
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/plain' },
    body: body ?? `answer of ${inner.url}`,
  });

const BY_TYPE = {
  parent_name: 'PKG_A',
  parent_tech_name: 'PKG_A',
  parent_type: 'DEVC/K',
  node_id: '000000',
};

describe('the core entries, pinned', () => {
  it('no tool left out of the task has a core entry', () => {
    const names = new Set(core().map((entry) => entry.tool));
    assert.deepStrictEqual(
      NEVER_ADMITTED.filter((tool) => names.has(tool)),
      [],
    );
  });

  it("no core entry's requests are transport requests; GetObjectsByType alone reads a node structure", () => {
    assert.deepStrictEqual(
      core()
        .filter((entry) => entry.sends.includes('/cts/'))
        .map((e) => e.tool),
      [],
    );
    assert.deepStrictEqual(
      core()
        .filter((entry) => entry.sends.includes('nodestructure'))
        .map((e) => e.tool),
      ['GetObjectsByType'],
    );
  });

  it('every tool a core entry names is served by the core set', () => {
    const served = new Set(
      fullToolSet
        .groups({ connection: undefined as never }, 'stdio', {
          dataTools: true,
        })
        .flatMap((group) => group.getHandlers())
        .map((entry) => entry.toolDefinition.name),
    );
    assert.deepStrictEqual(
      core()
        .map((entry) => entry.tool)
        .filter((tool) => !served.has(tool)),
      [],
    );
  });
});

describe('group B reads in an envelope', () => {
  it('a second node structure in one envelope is refused; the first is recorded and sent', async () => {
    const s = await batchStand({
      tools: ['GetObjectsByType'],
      part: sap(NODE_LEVEL),
      envelopes: new InstanceEnvelopes({ keepRawParts: false }),
    });
    const handle = payloadOf(await s.call('CreateReadEnvelope'))
      .envelope_handle as string;
    const first = await s.call('GetObjectsByType', {
      ...BY_TYPE,
      envelope_handle: handle,
    });
    assert.equal(payloadOf(first).number, 1);
    const second = await s.call('GetObjectsByType', {
      ...BY_TYPE,
      envelope_handle: handle,
    });
    assert.equal(payloadOf(second).error, 'envelope_node_structure');
    const executed = payloadOf(
      await s.call('ExecuteReadEnvelope', { envelope_handle: handle }),
    ) as Array<{ number: number }>;
    assert.deepStrictEqual(
      executed.map((a) => a.number),
      [1],
    );
    const parts = s.built.flatMap((b) => b.envelopes).flatMap((e) => e.parts);
    assert.equal(parts.length, 1);
    await s.close();
  });

  it("GetObjectVersionDiff's two independent requests share its number and go in the one envelope", async () => {
    const s = await batchStand({
      tools: ['GetObjectVersionDiff'],
      part: sap('REPORT a.'),
      envelopes: new InstanceEnvelopes({ keepRawParts: false }),
    });
    const handle = payloadOf(await s.call('CreateReadEnvelope'))
      .envelope_handle as string;
    const recorded = await s.call('GetObjectVersionDiff', {
      object_type: 'class',
      content_uri_from:
        '/sap/bc/adt/oo/classes/clas_a/includes/main/versions/00001/content',
      content_uri_to:
        '/sap/bc/adt/oo/classes/clas_a/includes/main/versions/00002/content',
      envelope_handle: handle,
    });
    assert.equal(payloadOf(recorded).number, 1);
    await s.call('ExecuteReadEnvelope', { envelope_handle: handle });
    const envelopes = s.built.flatMap((b) => b.envelopes);
    assert.equal(envelopes.length, 1);
    assert.equal(envelopes[0]?.parts.length, 2);
    await s.close();
  });

  it('with a background strategy a listed long read given a handle is recorded, no run created; without a handle it runs in the background', async () => {
    const runs = new InMemoryBackgroundRuns();
    const s = await batchStand({
      tools: ['SearchObject'],
      part: sap(),
      envelopes: new InstanceEnvelopes({ keepRawParts: false }),
      backgroundRuns: runs,
      freshConnections: true,
    });
    const handle = payloadOf(await s.call('CreateReadEnvelope'))
      .envelope_handle as string;
    const recorded = await s.call('SearchObject', {
      object_name: 'Z*',
      envelope_handle: handle,
    });
    assert.deepStrictEqual(payloadOf(recorded), {
      envelope_handle: handle,
      number: 1,
    });
    const refused = await s.call('SearchObject', {
      object_name: 'Z*',
      envelope_handle: handle,
      background: true,
    });
    assert.equal(payloadOf(refused).error, 'batch_no_background');
    // Without a handle the same call goes to the background strategy: it
    // asks for the caller a run is kept for, which a recorded call never does.
    const background = await s.call('SearchObject', { object_name: 'Z*' });
    assert.match(
      background.content?.[0]?.text ?? '',
      /run_handle|system_user_unknown/,
    );
    await s.close();
  });

  it('the data tools are admitted where they are served', async () => {
    const s = await batchStand({
      tools: ['GetTableContents'],
      part: sap(),
      envelopes: new InstanceEnvelopes({ keepRawParts: false }),
    });
    const handle = payloadOf(await s.call('CreateReadEnvelope'))
      .envelope_handle as string;
    const recorded = await s.call('GetTableContents', {
      table_name: 'TAB_A',
      envelope_handle: handle,
    });
    assert.equal(payloadOf(recorded).number, 1);
    await s.close();
    const off = fullToolSet
      .groups({ connection: undefined as never }, 'stdio', {
        dataTools: false,
      })
      .flatMap((group) => group.getHandlers())
      .map((entry) => entry.toolDefinition.name);
    assert.equal(off.includes('GetTableContents'), false);
    assert.equal(off.includes('GetSqlQuery'), false);
  });

  it('an access-restricted read takes no number and sends nothing', async () => {
    const s = await batchStand({
      tools: ['GetTableContents'],
      part: sap(),
      envelopes: new InstanceEnvelopes({ keepRawParts: false }),
      accessChecks: listedAccessChecks({
        deniedTables: [parseTableEntry('TAB_A', 'test')],
      }),
    });
    const handle = payloadOf(await s.call('CreateReadEnvelope'))
      .envelope_handle as string;
    const refused = await s.call('GetTableContents', {
      table_name: 'TAB_A',
      envelope_handle: handle,
    });
    assert.equal(refused.isError, true);
    assert.equal(payloadOf(refused).error, 'table_not_allowed');
    assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), [
      { envelope_handle: handle, recorded: 0 },
    ]);
    assert.equal(s.built.flatMap((b) => b.directs).length, 0);
    await s.close();
  });
});
