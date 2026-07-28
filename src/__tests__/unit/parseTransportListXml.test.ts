import {
  isModifiableStatus,
  parseTransportListXml,
} from '../../handlers/transport/readonly/handleListTransports';

/**
 * Guard for #168: `ListTransports` reported `count: 0` on a system where the
 * queried user owned 55 requests, because the parser looked for `tm:request`
 * only directly under the root or directly under `tm:workbench`.
 *
 * The endpoint negotiates `application/vnd.sap.adt.transportorganizertree.v1+xml`,
 * where requests sit under status containers one level deeper and `tm:workbench`
 * repeats per transport target.
 *
 * NOTE: the tree fixture below is RECONSTRUCTED from that representation, not
 * captured from a live system — the reporter could not dump the payload and no
 * on-premise system was reachable here. `scripts/probe-transport-list.ts` dumps
 * the real thing; replace this fixture with a capture once one is available.
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

describe('parseTransportListXml — transportorganizertree shape (#168)', () => {
  it('finds requests nested under status containers, in every branch', () => {
    const numbers = parseTransportListXml(TREE_PAYLOAD).map((t) => t.number);

    expect(numbers).toEqual([
      'SIDK905635',
      'SIDK905640',
      'SIDK905600',
      'SIDK905700',
      'SIDK905800',
    ]);
  });

  it('maps the request attributes', () => {
    const first = parseTransportListXml(TREE_PAYLOAD)[0];

    expect(first).toEqual({
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

    expect(numbers).not.toContain('SIDK905636');
  });

  it('falls back to the container status when the request has none', () => {
    const entry = parseTransportListXml(TREE_PAYLOAD).find(
      (t) => t.number === 'SIDK905700',
    );

    expect(entry?.status).toBe('D');
  });

  it('still parses the flat shape', () => {
    expect(parseTransportListXml(FLAT_PAYLOAD).map((t) => t.number)).toEqual([
      'SIDK900001',
    ]);
  });

  it('returns an empty list for an empty tree and for empty input', () => {
    expect(parseTransportListXml(EMPTY_PAYLOAD)).toEqual([]);
    expect(parseTransportListXml('')).toEqual([]);
  });

  it('reports nothing for a captured response from a system with no requests', () => {
    // Guards the honest-empty case: `count: 0` must stay 0 when it is true,
    // not become noise once the parser walks the whole tree.
    expect(parseTransportListXml(CAPTURED_NO_TRANSPORTS)).toEqual([]);
  });

  it('collapses a request reachable through more than one branch', () => {
    const duplicated = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">
  <tm:workbench><tm:modifiable>
    <tm:request tm:number="SIDK900002" tm:desc="Once" tm:status="D"/>
  </tm:modifiable></tm:workbench>
  <tm:workbench><tm:modifiable>
    <tm:request tm:number="SIDK900002" tm:desc="Twice" tm:status="D"/>
  </tm:modifiable></tm:workbench>
</tm:root>`;

    const parsed = parseTransportListXml(duplicated);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].description).toBe('Once');
  });
});

describe('isModifiableStatus', () => {
  it('treats D and L as modifiable', () => {
    expect(isModifiableStatus('D')).toBe(true);
    expect(isModifiableStatus('L')).toBe(true);
  });

  it('treats released statuses as not modifiable', () => {
    expect(isModifiableStatus('R')).toBe(false);
    expect(isModifiableStatus('N')).toBe(false);
    expect(isModifiableStatus('O')).toBe(false);
  });

  it('keeps a request whose status could not be determined', () => {
    expect(isModifiableStatus('')).toBe(true);
    expect(isModifiableStatus(undefined)).toBe(true);
  });
});
