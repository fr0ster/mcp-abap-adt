import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTransportListXml } from '../../handlers/transport/readonly/handleListTransports';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject } from '../helpers/assertions';

/**
 * Guard for #168: `ListTransports` reported `count: 0` on a system where the
 * queried user owned 55 requests, because the parser looked for `tm:request`
 * only directly under the root or directly under `tm:workbench`.
 *
 * The endpoint negotiates `application/vnd.sap.adt.transportorganizertree.v1+xml`,
 * where requests sit under status containers one level deeper and `tm:workbench`
 * repeats per transport target.
 *
 * **Both real shapes are in the corpus now, and the reconstruction stays
 * beside them.** The note that used to sit here said the tree fixture below
 * was reconstructed, because no reachable system owned a transport request,
 * and asked for a capture to replace it. #176 made that capture; this is it,
 * taken the way every other document here is taken —
 * `read-transport-list-structure` without `?targets=true`
 * (`tm:workbench > tm:modifiable > tm:request`) and
 * `read-transport-list-with-targets` with it, where ADT inserts a `tm:target`
 * level in between. Same system, same data, different request.
 *
 * The reconstruction is kept rather than deleted: it carries five requests
 * across released, protected and several branches, which the captures cannot
 * — this trial owns exactly one transport. So it still covers the branching
 * the parser walks, while the captures prove the two shapes it walks through
 * are the shapes SAP sends.
 */
const TREE_PAYLOAD = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="">
  <tm:workbench tm:parent_name="">
    <tm:modifiable tm:parent_name="">
      <tm:request tm:number="SIDK905635" tm:desc="Feature work" tm:type="K" tm:status="D" tm:owner="DEVELOPER" tm:target="/SIDTOQAS/">
        <tm:task tm:number="SIDK905636" tm:desc="Task of 905635" tm:type="S" tm:status="D" tm:owner="DEVELOPER"/>
      </tm:request>
      <tm:request tm:number="SIDK905640" tm:desc="Protected request" tm:type="K" tm:status="L" tm:owner="DEVELOPER" tm:target="/SIDTOQAS/"/>
    </tm:modifiable>
    <tm:released tm:parent_name="">
      <tm:request tm:number="SIDK905600" tm:desc="Shipped last week" tm:type="K" tm:status="R" tm:owner="DEVELOPER" tm:target="/SIDTOQAS/"/>
    </tm:released>
  </tm:workbench>
  <tm:workbench tm:parent_name="">
    <tm:modifiable tm:parent_name="">
      <tm:request tm:number="SIDK905700" tm:desc="Second target" tm:type="K" tm:owner="DEVELOPER" tm:target="/SIDTODEV/"/>
    </tm:modifiable>
  </tm:workbench>
  <tm:customizing tm:parent_name="">
    <tm:modifiable tm:parent_name="">
      <tm:request tm:number="SIDK905800" tm:desc="Customizing" tm:type="W" tm:status="D" tm:owner="DEVELOPER" tm:target="/SIDTOQAS/"/>
    </tm:modifiable>
  </tm:customizing>
</tm:root>`;

/** The shape the previous parser expected. It must keep working. */
const FLAT_PAYLOAD = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">
  <tm:request tm:number="SIDK900001" tm:desc="Flat one" tm:type="K" tm:status="D" tm:owner="DEVELOPER" tm:target="/SIDTOQAS/"/>
</tm:root>`;

const EMPTY_PAYLOAD = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="">
  <tm:workbench tm:parent_name=""/>
</tm:root>`;

/**
 * CAPTURED, not reconstructed: the verbatim response of
 * `GET /sap/bc/adt/cts/transportrequests?user=` from an SAP BTP ABAP
 * environment (us10 trial) that owns no transport requests, 2026-07-28.
 * An empty result is a bare self-closing root with no status containers at all.
 */
const CAPTURED_NO_TRANSPORTS = `<?xml version="1.0" encoding="utf-8"?><tm:root adtcore:name="CB9980008038" adtcore:changedAt="2026-07-28T13:53:59Z" adtcore:createdAt="2026-07-28T13:53:59Z" adtcore:changedBy="CB9980008038" adtcore:createdBy="CB9980008038" xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core"/>`;

/**
 * The two shapes as SAP actually sends them — the reason the parser recurses
 * by element name instead of walking a path. A path-shaped parser passes one
 * of these and answers zero requests on the other; `@mcp-abap-adt/adt-clients`
 * says the same in `parseTransportTree.js`, having met both.
 */
const CAPTURED_FLAT = corpusBody(
  'read-transport-list-structure--01-cts-transportrequests',
);
const CAPTURED_WITH_TARGETS = corpusBody(
  'read-transport-list-with-targets--01-cts-transportrequests',
);

describe('the two captured shapes of one listing', () => {
  it('reads the request without ?targets=true', () => {
    const [entry, ...rest] = parseTransportListXml(CAPTURED_FLAT);
    assert.deepStrictEqual(rest, []);
    assertMatchObject(entry, {
      number: 'TRLK900438',
      description: 'adt-clients integration tests',
      type: 'K',
      status: 'D',
      owner: 'SAPUSER01',
    });
  });

  it('reads the same request through the tm:target level ?targets=true adds', () => {
    // The level is really there: the document differs, the answer must not.
    assert.ok(CAPTURED_WITH_TARGETS.includes('<tm:target '));
    assert.ok(!CAPTURED_FLAT.includes('<tm:target '));

    assert.deepStrictEqual(
      parseTransportListXml(CAPTURED_WITH_TARGETS),
      parseTransportListXml(CAPTURED_FLAT),
    );
  });

  it('does not report the task inside it as a request', () => {
    const numbers = parseTransportListXml(CAPTURED_WITH_TARGETS).map(
      (t) => t.number,
    );
    assert.deepStrictEqual(numbers, ['TRLK900438']);
  });
});

describe('parseTransportListXml — transportorganizertree shape (#168)', () => {
  it('finds requests nested under status containers, in every branch', () => {
    const numbers = parseTransportListXml(TREE_PAYLOAD).map((t) => t.number);

    assert.deepStrictEqual(numbers, [
      'SIDK905635',
      'SIDK905640',
      'SIDK905600',
      'SIDK905700',
      'SIDK905800',
    ]);
  });

  it('maps the request attributes', () => {
    const first = parseTransportListXml(TREE_PAYLOAD)[0];

    assert.deepStrictEqual(first, {
      number: 'SIDK905635',
      description: 'Feature work',
      type: 'K',
      status: 'D',
      owner: 'DEVELOPER',
      target: '/SIDTOQAS/',
    });
  });

  it('does not report tasks as requests', () => {
    const numbers = parseTransportListXml(TREE_PAYLOAD).map((t) => t.number);

    assert.ok(!numbers.includes('SIDK905636'));
  });

  it('falls back to the container status when the request has none', () => {
    const entry = parseTransportListXml(TREE_PAYLOAD).find(
      (t) => t.number === 'SIDK905700',
    );

    assert.equal(entry?.status, 'D');
  });

  it('still parses the flat shape', () => {
    assert.deepStrictEqual(
      parseTransportListXml(FLAT_PAYLOAD).map((t) => t.number),
      ['SIDK900001'],
    );
  });

  it('returns an empty list for an empty tree and for empty input', () => {
    assert.deepStrictEqual(parseTransportListXml(EMPTY_PAYLOAD), []);
    assert.deepStrictEqual(parseTransportListXml(''), []);
  });

  it('reports nothing for a captured response from a system with no requests', () => {
    // Guards the honest-empty case: `count: 0` must stay 0 when it is true,
    // not become noise once the parser walks the whole tree.
    assert.deepStrictEqual(parseTransportListXml(CAPTURED_NO_TRANSPORTS), []);
  });

  // Plan step 9 (owner): a repeat is the same request again — number,
  // content and tasks alike — and is listed once; the same number with
  // other content is written again, nothing it carries vanishing.
  it('lists an exact repeat once', () => {
    const repeated = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">
  <tm:workbench><tm:modifiable>
    <tm:request tm:number="SIDK900002" tm:desc="Once" tm:status="D"/>
  </tm:modifiable></tm:workbench>
  <tm:workbench><tm:modifiable>
    <tm:request tm:number="SIDK900002" tm:desc="Once" tm:status="D"/>
  </tm:modifiable></tm:workbench>
</tm:root>`;

    const parsed = parseTransportListXml(repeated);

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.description, 'Once');
  });

  it('writes the same number with other content again', () => {
    const differing = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">
  <tm:workbench><tm:modifiable>
    <tm:request tm:number="SIDK900002" tm:desc="Once" tm:status="D"/>
  </tm:modifiable></tm:workbench>
  <tm:workbench><tm:modifiable>
    <tm:request tm:number="SIDK900002" tm:desc="Twice" tm:status="D"/>
  </tm:modifiable></tm:workbench>
</tm:root>`;

    assert.deepStrictEqual(
      parseTransportListXml(differing).map((t) => t.description),
      ['Once', 'Twice'],
    );
  });

  // Codex round 10: the repeat key is the whole request as the reading
  // holds it — the same row with other links is another request.
  it('writes the same row with other release links again', () => {
    const linked = (href: string) =>
      `<tm:workbench><tm:modifiable>
    <tm:request tm:number="SIDK900002" tm:desc="Once" tm:status="D">
      <atom:link href="${href}" rel="http://www.sap.com/cts/relations/release"/>
    </tm:request>
  </tm:modifiable></tm:workbench>`;
    const differing = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:atom="http://www.w3.org/2005/Atom">
  ${linked('/sap/bc/adt/cts/transportrequests/SIDK900002/release/a')}
  ${linked('/sap/bc/adt/cts/transportrequests/SIDK900002/release/b')}
</tm:root>`;

    assert.deepStrictEqual(
      parseTransportListXml(differing).map((t) => t.description),
      ['Once', 'Once'],
    );
  });

  it('writes the same row with another attribute it does not show again', () => {
    const differing = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">
  <tm:workbench><tm:modifiable>
    <tm:request tm:number="SIDK900002" tm:desc="Once" tm:status="D" tm:lastchanged_timestamp="1"/>
  </tm:modifiable></tm:workbench>
  <tm:workbench><tm:modifiable>
    <tm:request tm:number="SIDK900002" tm:desc="Once" tm:status="D" tm:lastchanged_timestamp="2"/>
  </tm:modifiable></tm:workbench>
</tm:root>`;

    assert.equal(parseTransportListXml(differing).length, 2);
  });

  it('lists a request without a number, its number empty', () => {
    const numberless = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">
  <tm:workbench><tm:modifiable>
    <tm:request tm:desc="No number" tm:status="D"/>
  </tm:modifiable></tm:workbench>
</tm:root>`;

    assertMatchObject(parseTransportListXml(numberless), [
      { number: '', description: 'No number' },
    ]);
  });
});
