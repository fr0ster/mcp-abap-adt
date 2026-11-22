/**
 * `HandlerGet`'s `part`: source, metadata or urls — and a refusal when the object has
 * no such part.
 *
 * **Why a part and not a tool.** Compact is one tool per operation, so "which aspect
 * of this object" is an argument of the read, not a twenty-third tool.
 *
 * **And the refusal matters as much as the routing.** Answering the source when
 * `metadata` was asked would be a success that means something else — the failure
 * this surface keeps producing whenever nobody looks. So a missing part throws, and
 * the message names the parts the type does offer, which is what lets a caller
 * correct itself in one step.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compactMetadataRoutes,
  compactUrlRoutes,
  partsFor,
} from '../handlers/compactPartRoutes';
import { handleHandlerGet } from '../handlers/handleHandlerGet';

// The process declares its system type, as every launcher requires: the
// type argument is checked against the declared variant's projection.
process.env.SAP_SYSTEM_TYPE = 'onprem';

/** The refusal text, out of the answer the tool returns. */
const refusalOf = async (args: Record<string, unknown>) => {
  const answered = (await handleHandlerGet(
    { connection: { getSessionId: () => null }, logger: undefined } as never,
    args as never,
  )) as { isError?: boolean; content?: { text: string }[] };
  return answered.content?.[0]?.text ?? '';
};

const context = {
  connection: { getSessionId: () => null },
  logger: undefined,
} as never;

describe('the parts a compact read can answer', () => {
  it('routes urls only where a service URL exists', () => {
    // One entry, and that is the honest size of it.
    assert.deepStrictEqual(Object.keys(compactUrlRoutes), ['SERVICE_BINDING']);
  });

  it('routes metadata for the types whose documents carry one', () => {
    assert.notEqual(compactMetadataRoutes.CLASS, undefined);
    assert.notEqual(compactMetadataRoutes.SERVICE_BINDING, undefined);
    // A transport's document is GetTransport's read; a test run has no
    // metadata document, and the map saying so is what produces the refusal.
    assert.notEqual(compactMetadataRoutes.TRANSPORT, undefined);
    assert.equal(compactMetadataRoutes.UNIT_TEST, undefined);
  });

  it('lists what a type offers, so a refusal is actionable', () => {
    assert.deepStrictEqual(
      partsFor('SERVICE_BINDING' as never, true, 'onprem'),
      ['source', 'metadata', 'urls'],
    );
    assert.deepStrictEqual(partsFor('CLASS' as never, true, 'onprem'), [
      'source',
      'metadata',
      'draft',
    ]);
    assert.deepStrictEqual(partsFor('TRANSPORT' as never, true, 'onprem'), [
      'source',
      'metadata',
    ]);
  });

  it("offers an include's main programs on premise only", () => {
    assert.deepStrictEqual(partsFor('INCLUDE', true, 'onprem'), [
      'source',
      'metadata',
      'main_programs',
      'draft',
    ]);
    assert.deepStrictEqual(partsFor('INCLUDE', true, 'cloud'), [
      'source',
      'metadata',
    ]);
  });

  it('refuses a part the type does not have, naming the ones it does', async () => {
    // A class has a source and a metadata document, and no service URL.
    assert.match(
      await refusalOf({ object_type: 'CLASS', part: 'urls', class_name: 'X' }),
      /part=urls is not available[\s\S]*CLASS[\s\S]*offers: source, metadata/,
    );
  });

  it('refuses a type with no read at all at the boundary, naming what it reads', async () => {
    // A runtime dump has no read route (`COMPACT_READ_ROUTES`), so it is no
    // member of HandlerGet's object_type: refused before any part is asked,
    // with the members the declared variant reads.
    assert.match(
      await refusalOf({ object_type: 'RUNTIME_DUMP', part: 'urls' }),
      /Unsupported read for object_type: RUNTIME_DUMP\. Supported: PACKAGE,/,
    );
  });

  it('refuses the source of a table type, naming its metadata', async () => {
    assert.equal(
      await refusalOf({
        object_type: 'TABLE_TYPE',
        part: 'source',
        table_type_name: 'X',
      }),
      'part=source is not available for object_type=TABLE_TYPE. It offers: metadata, draft.',
    );
  });

  it('refuses metadata where there is none', async () => {
    assert.match(
      await refusalOf({
        object_type: 'UNIT_TEST',
        part: 'metadata',
        run_id: 'X',
      }),
      /part=metadata is not available[\s\S]*UNIT_TEST/,
    );
  });

  it('never silently answers a different part', async () => {
    assert.match(
      await refusalOf({ object_type: 'UNIT_TEST', part: 'urls', run_id: 'X' }),
      /not available/,
    );
  });
});
