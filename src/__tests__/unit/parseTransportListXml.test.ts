import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isModifiableStatus,
  parseTransportListXml,
} from '../../handlers/transport/readonly/handleListTransports';

/**
 * Guard for #168: `ListTransports` reported `count: 0` while the queried user
 * owned requests, because the parser looked for `tm:request` only directly
 * under the root or directly under `tm:workbench`.
 *
 * The tree below is CAPTURED, not reconstructed — the verbatim body of
 *
 *   GET /sap/bc/adt/cts/transportrequests?targets=true&configUri=<href>
 *   Accept: application/vnd.sap.adt.transportorganizer.v1+xml,
 *           application/vnd.sap.adt.transportorganizertree.v1+xml
 *
 * from an SAP BTP ABAP environment on 2026-08-11.
 *
 * It is one level deeper than the reconstruction it replaces:
 *
 *   tm:root > tm:workbench > tm:target > tm:modifiable > tm:request > tm:task
 *
 * The earlier fixture had no `tm:target`. Collecting requests from anywhere in
 * the tree is what carries the parser across that difference — a fixed path,
 * however carefully reasoned, would have missed by exactly one level again.
 *
 * Note what the capture also settles: the request is reached only when the URL
 * carries `configUri`. The same endpoint with `user=` and `status=` returns a
 * 309-byte empty root, which is why the tool reported nothing even after the
 * parser was fixed. That part is not this parser's business — see
 * fr0ster/mcp-abap-adt-clients#105.
 */
const TREE_PAYLOAD = fs.readFileSync(
  path.resolve(__dirname, '../../../tests/fixtures/transport-list-tree.xml'),
  'utf8',
);

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
 * Modelled on the captured shape above — same `tm:target` level — but carrying
 * the branches one trial system with a single local request cannot show: a
 * second target, a released request, a customizing branch, and a request whose
 * own `tm:status` is absent.
 */
const SYNTHETIC_TREE = `<?xml version="1.0" encoding="UTF-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="DEVELOPER">
  <tm:workbench tm:category="Workbench">
    <tm:target tm:name="SIDTOQAS" tm:desc="QA">
      <tm:modifiable tm:status="Modifiable">
        <tm:request tm:number="SIDK905635" tm:owner="DEVELOPER" tm:desc="Feature work" tm:type="K" tm:status="D" tm:target="/SIDTOQAS/">
          <tm:task tm:number="SIDK905636" tm:owner="DEVELOPER" tm:desc="Task of 905635" tm:type="S" tm:status="D"/>
        </tm:request>
        <tm:request tm:number="SIDK905640" tm:owner="DEVELOPER" tm:desc="Protected request" tm:type="K" tm:status="L" tm:target="/SIDTOQAS/"/>
      </tm:modifiable>
      <tm:released tm:status="Released">
        <tm:request tm:number="SIDK905600" tm:owner="DEVELOPER" tm:desc="Shipped last week" tm:type="K" tm:status="R" tm:target="/SIDTOQAS/"/>
      </tm:released>
    </tm:target>
    <tm:target tm:name="SIDTODEV" tm:desc="Dev">
      <tm:modifiable tm:status="Modifiable">
        <tm:request tm:number="SIDK905700" tm:owner="DEVELOPER" tm:desc="No status of its own" tm:type="K" tm:target="/SIDTODEV/"/>
      </tm:modifiable>
    </tm:target>
  </tm:workbench>
  <tm:customizing tm:category="Customizing">
    <tm:target tm:name="SIDTOQAS" tm:desc="QA">
      <tm:modifiable tm:status="Modifiable">
        <tm:request tm:number="SIDK905800" tm:owner="DEVELOPER" tm:desc="Customizing" tm:type="W" tm:status="D" tm:target="/SIDTOQAS/"/>
      </tm:modifiable>
    </tm:target>
  </tm:customizing>
</tm:root>`;

describe('parseTransportListXml — captured payload (#168)', () => {
  it('finds the request through workbench > target > modifiable', () => {
    expect(parseTransportListXml(TREE_PAYLOAD)).toEqual([
      {
        number: 'TRLK900438',
        description: 'Test',
        type: 'K',
        status: 'D',
        owner: 'CB9980006582',
        target: '',
      },
    ]);
  });

  it('does not report the nested task as a request', () => {
    const numbers = parseTransportListXml(TREE_PAYLOAD).map((t) => t.number);

    expect(numbers).not.toContain('TRLK900439');
  });
});

describe('parseTransportListXml — branches beyond the capture', () => {
  it('finds requests in every branch and target', () => {
    const numbers = parseTransportListXml(SYNTHETIC_TREE).map((t) => t.number);

    expect(numbers).toEqual([
      'SIDK905635',
      'SIDK905640',
      'SIDK905600',
      'SIDK905700',
      'SIDK905800',
    ]);
  });

  it('maps the request attributes', () => {
    const first = parseTransportListXml(SYNTHETIC_TREE)[0];

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
    const numbers = parseTransportListXml(SYNTHETIC_TREE).map((t) => t.number);

    expect(numbers).not.toContain('SIDK905636');
  });

  it('falls back to the container status when the request has none', () => {
    const entry = parseTransportListXml(SYNTHETIC_TREE).find(
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
