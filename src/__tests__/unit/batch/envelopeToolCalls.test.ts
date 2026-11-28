/**
 * The four envelope tools through real MCP dispatch (spec §2, §3, §4, §6.1):
 *
 * - without an owner, each answers `envelopes_unavailable`;
 * - create, list and discard take no connection — on a cold instance the
 *   source is never resolved, nothing is sent — and neither does an execute
 *   naming an unknown or another session's handle;
 * - a connection that fails before the claim leaves the envelope open, and
 *   the next execute sends it;
 * - over Streamable HTTP two requests with other credential headers on one
 *   pooled instance share its bound, nothing evicted;
 * - for execute, discard and list, an unknown handle and another session's
 *   answer byte for byte the same, nothing changed.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { ServerRefusal } from '../../../lib/auth/serverRefusal';
import { InstanceEnvelopes } from '../../../lib/batch/InstanceEnvelopes';
import type { ServedTransport } from '../../../lib/config/binaries';
import * as connectionFactory from '../../../lib/connectionFactory';
import { EnvelopeHandlersGroup } from '../../../lib/handlers/groups/EnvelopeHandlersGroup';
import { headerContext } from '../../../lib/httpTransport/headerSource';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  type ToolSet,
} from '../../../lib/toolSet';
import { batchStand, payloadOf } from '../../helpers/batchStand';

process.env.SAP_SYSTEM_TYPE = 'onprem';

afterEach(() => mock.restoreAll());

const ok = () => ({ status: 200, statusText: 'OK', body: 'ok' });

const HEADERS_A = {
  'x-sap-url': 'https://system.invalid',
  'x-sap-login': 'USER_A',
  'x-sap-password': 'secret-a',
};
const HEADERS_B = { ...HEADERS_A, 'x-sap-password': 'secret-b' };

describe('the envelope tools', () => {
  it('without an owner each tool answers envelopes_unavailable', async () => {
    // The tools served, the instance's owner taken away.
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const t = await batchStand({ tools: [], part: ok, envelopes: owner });
    Object.assign(t.server, { envelopes: undefined });
    for (const [name, args] of [
      ['CreateReadEnvelope', {}],
      ['ListReadEnvelopes', {}],
      ['DiscardReadEnvelope', { envelope_handle: 'A'.repeat(32) }],
      ['ExecuteReadEnvelope', { envelope_handle: 'A'.repeat(32) }],
    ] as const) {
      const answer = await t.call(name, args);
      assert.equal(answer.isError, true, name);
      assert.equal(payloadOf(answer).error, 'envelopes_unavailable', name);
    }
    await t.close();
  });

  it('create, list and discard take no connection; neither does an execute of an unknown handle', async () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const s = await batchStand({ tools: [], part: ok, envelopes: owner });
    const factory = mock.method(connectionFactory, 'createAbapConnection');
    const created = payloadOf(await s.call('CreateReadEnvelope'));
    assert.match(created.envelope_handle, /^[0-9A-F]{32}$/);
    assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), [
      { envelope_handle: created.envelope_handle, recorded: 0 },
    ]);
    const unknown = await s.call('ExecuteReadEnvelope', {
      envelope_handle: 'F'.repeat(32),
    });
    assert.equal(payloadOf(unknown).error, 'envelope_unavailable');
    assert.deepStrictEqual(
      payloadOf(
        await s.call('DiscardReadEnvelope', {
          envelope_handle: created.envelope_handle,
        }),
      ),
      { envelope_handle: created.envelope_handle, discarded: 0 },
    );
    assert.equal(s.resolves(), 0);
    assert.equal(s.built.length, 0);
    assert.equal(factory.mock.callCount(), 0);
    await s.close();
  });

  it('a connection that fails before the claim leaves the envelope open; the next execute sends it', async () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const s = await batchStand({ tools: [], part: ok, envelopes: owner });
    const created = payloadOf(await s.call('CreateReadEnvelope'));
    s.failResolve(new ServerRefusal('credentials_required'));
    const failed = await s.call('ExecuteReadEnvelope', {
      envelope_handle: created.envelope_handle,
    });
    assert.equal(failed.isError, true);
    assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), [
      { envelope_handle: created.envelope_handle, recorded: 0 },
    ]);
    const sent = await s.call('ExecuteReadEnvelope', {
      envelope_handle: created.envelope_handle,
    });
    assert.notEqual(sent.isError, true);
    assert.deepStrictEqual(payloadOf(sent), []);
    assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), []);
    await s.close();
  });

  it('over Streamable HTTP two requests with other credentials on one instance share its bound: a third create is refused, nothing evicted', async () => {
    const owner = new InstanceEnvelopes({
      keepRawParts: false,
      openEnvelopes: 2,
    });
    const s = await batchStand({
      tools: [],
      part: ok,
      envelopes: owner,
      stateHandleArgument: true,
    });
    s.useContext(headerContext({ ...HEADERS_A }));
    const a = payloadOf(await s.call('CreateReadEnvelope'));
    s.useContext(headerContext({ ...HEADERS_B }));
    const b = payloadOf(await s.call('CreateReadEnvelope'));
    const refused = await s.call('CreateReadEnvelope');
    assert.equal(payloadOf(refused).error, 'envelope_limit');
    // A fresh context per request with the same headers still names A's envelope.
    s.useContext(headerContext({ ...HEADERS_A }));
    assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), [
      { envelope_handle: a.envelope_handle, recorded: 0 },
    ]);
    s.useContext(headerContext({ ...HEADERS_B }));
    assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), [
      { envelope_handle: b.envelope_handle, recorded: 0 },
    ]);
    await s.close();
  });

  it("execute, discard and list: an unknown handle and another session's answer the same, byte for byte, nothing changed", async () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const s = await batchStand({
      tools: [],
      part: ok,
      envelopes: owner,
      stateHandleArgument: true,
    });
    s.useContext(headerContext({ ...HEADERS_A }));
    const mine = payloadOf(await s.call('CreateReadEnvelope')).envelope_handle;
    const variants: Record<string, string>[] = [
      HEADERS_B,
      { ...HEADERS_A, 'x-sap-login': 'USER_B' },
      { ...HEADERS_A, 'x-sap-url': 'https://other.invalid' },
      { ...HEADERS_A, 'x-sap-client': '200' },
    ];
    for (const headers of variants) {
      s.useContext(headerContext({ ...headers }));
      for (const name of ['ExecuteReadEnvelope', 'DiscardReadEnvelope']) {
        const foreign = await s.call(name, { envelope_handle: mine });
        const unknown = await s.call(name, { envelope_handle: 'F'.repeat(32) });
        assert.deepStrictEqual(foreign, unknown, name);
      }
      assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), []);
    }
    s.useContext(headerContext({ ...HEADERS_A }));
    assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), [
      { envelope_handle: mine, recorded: 0 },
    ]);
    assert.equal(s.resolves(), 0);
    await s.close();
  });

  it('another instance does not know the handle', async () => {
    const one = await batchStand({
      tools: [],
      part: ok,
      envelopes: new InstanceEnvelopes({ keepRawParts: false }),
    });
    const two = await batchStand({
      tools: [],
      part: ok,
      envelopes: new InstanceEnvelopes({ keepRawParts: false }),
    });
    const handle = payloadOf(
      await one.call('CreateReadEnvelope'),
    ).envelope_handle;
    const foreign = await two.call('DiscardReadEnvelope', {
      envelope_handle: handle,
    });
    const unknown = await two.call('DiscardReadEnvelope', {
      envelope_handle: 'F'.repeat(32),
    });
    assert.deepStrictEqual(foreign, unknown);
    await one.close();
    await two.close();
  });
});

describe('the envelope tools on the surface', () => {
  const NAMES = [
    'CreateReadEnvelope',
    'DiscardReadEnvelope',
    'ExecuteReadEnvelope',
    'ListReadEnvelopes',
  ];
  const namesOf = (set: ToolSet, transport: ServedTransport) =>
    set
      .groups({ connection: undefined as never }, transport, {
        dataTools: false,
      })
      .flatMap((group) => group.getHandlers())
      .map((entry) => entry.toolDefinition.name);

  it('the core and core-ro sets serve the four on every transport; no compact set serves any', () => {
    const compact = compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
      modify: compactModifyEntries,
    });
    const compactRo = compactReadOnlyToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
    });
    for (const transport of ['stdio', 'http', 'sse'] as const) {
      for (const set of [fullToolSet, fullReadOnlyToolSet]) {
        const names = namesOf(set, transport);
        assert.deepStrictEqual(
          NAMES.filter((n) => names.includes(n)),
          NAMES,
          `${set.kind} ${transport}`,
        );
      }
      for (const set of [compact, compactRo]) {
        const names = namesOf(set, transport);
        assert.deepStrictEqual(
          NAMES.filter((n) => names.includes(n)),
          [],
          `${set.kind} ${transport}`,
        );
      }
    }
  });

  it('each says what it does', () => {
    const entries = new EnvelopeHandlersGroup({
      connection: undefined as never,
    }).getHandlers();
    const words = Object.fromEntries(
      entries.map((e) => [e.toolDefinition.name, e.toolDefinition.description]),
    );
    assert.match(
      String(words.CreateReadEnvelope),
      /Creates a collection of read calls under a handle/,
    );
    assert.match(
      String(words.ExecuteReadEnvelope),
      /Executes a collection of recorded read calls, sending them to SAP together/,
    );
    assert.match(
      String(words.DiscardReadEnvelope),
      /Discards a collection of recorded read calls and ends its handle/,
    );
    assert.match(
      String(words.ListReadEnvelopes),
      /Lists this session's open collections of read calls/,
    );
  });
});
