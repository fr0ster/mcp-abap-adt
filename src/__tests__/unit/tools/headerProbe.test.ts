/**
 * The server's header probe (tools/header-probe, `npm run header:discovery`):
 * its pure parts — what an answer records, the rows, the summary, the report,
 * the operations it reports skipped — the ledger's cleanup on failure, and
 * the cycle driver on a fake system: the server's batch path (one envelope,
 * the interrupt asked right before it), the server's correction outside a
 * batch, Ctrl-C letting the member call in flight finish whole, and the lock
 * released whatever the interrupt says.
 */

import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { Probe } from '../../../../tools/header-probe/cycle';
import {
  eachInTurn,
  Interrupt,
  Interrupted,
  Ledger,
  withCleanup,
  withLock,
} from '../../../../tools/header-probe/ledger';
import {
  cycleOperations,
  type IObjectSpec,
  OBJECT_SPECS,
  SKIP_REASONS,
  skipReason,
} from '../../../../tools/header-probe/objects';
import {
  defaultVerdict,
  endpointOf,
  type IOperationRow,
  type IProbeAnswer,
  type IProbeReport,
  modeDifferences,
  PROBE_TYPE,
  pathCollisions,
  plannedKinds,
  probePair,
  readAttempt,
  readState,
  refusedDefaultPairs,
  renderMarkdown,
  sapExceptionOf,
  unreportedRows,
} from '../../../../tools/header-probe/record';
import { DEFAULT_ADT_HEADERS } from '../../../lib/adtHeaders/defaultPairs';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import {
  envelopeConnection,
  type InnerRequest,
  type PartAnswer,
  partByPart,
  statusError,
} from '../../helpers/batchEnvelope';
import {
  SAP_EXCEPTION_HEADERS,
  sapException,
  unsupportedMediaTypeBody,
} from '../../helpers/sapRefusals';

const KNOWN = { accept: 'application/a+xml', contentType: 'application/c+xml' };

const notAcceptableBody = (types: string) =>
  sapException(
    'ExceptionResourceNotAcceptable',
    `The message content is not acceptable. Accepted content types: ${types}`,
  );

function answer(overrides: Partial<IProbeAnswer>): IProbeAnswer {
  return {
    probe: 'known',
    sent: KNOWN,
    mode: 'batched',
    requests: [{ method: 'POST', path: '/sap/bc/adt/x' }],
    supportedAccept: [],
    supportedContentType: [],
    ...overrides,
  };
}

describe('probePair', () => {
  it('sends the probe type in exactly one header per bad probe', () => {
    expect(probePair('known', KNOWN)).toEqual(KNOWN);
    expect(probePair('badAccept', KNOWN)).toEqual({
      accept: PROBE_TYPE,
      contentType: KNOWN.contentType,
    });
    expect(probePair('badContentType', KNOWN)).toEqual({
      accept: KNOWN.accept,
      contentType: PROBE_TYPE,
    });
  });
});

describe('readAttempt', () => {
  it("reads SAP's 406: type, message, the named types and the raw text", () => {
    const attempt = readAttempt({
      sent: KNOWN,
      requests: [],
      wire: {
        status: 406,
        statusText: 'Not Acceptable',
        headers: SAP_EXCEPTION_HEADERS,
        data: notAcceptableBody('application/v2+xml'),
      } as IAdtWireResponse,
    });
    expect(attempt).toMatchObject({
      status: 406,
      sapType: 'ExceptionResourceNotAcceptable',
      responseContentType: 'application/xml',
      supportedAccept: ['application/v2+xml'],
      supportedContentType: [],
      acceptedText: 'Accepted content types: application/v2+xml',
    });
    expect(attempt.sapMessage).toContain('not acceptable');
  });

  it("reads SAP's 415: only the listed type, never the document's own application/xml", () => {
    const attempt = readAttempt({
      sent: KNOWN,
      requests: [],
      wire: {
        status: 415,
        statusText: 'Unsupported Media Type',
        headers: SAP_EXCEPTION_HEADERS,
        data: unsupportedMediaTypeBody('application/c2+xml'),
      } as IAdtWireResponse,
    });
    expect(attempt.supportedContentType).toEqual(['application/c2+xml']);
    expect(attempt.supportedText).toBe(
      'Supported Media Types: application/c2+xml',
    );
    expect(attempt.sapType).toBe('ExceptionUnsupportedMediaType');
  });

  it('keeps no body of a success, and records no answer as a failure', () => {
    const ok = readAttempt({
      sent: KNOWN,
      requests: [],
      wire: { status: 200, statusText: 'OK', headers: {}, data: 'x' } as never,
    });
    expect(ok.body).toBeUndefined();
    const none = readAttempt({ sent: KNOWN, requests: [], failure: 'boom' });
    expect(none).toMatchObject({ failure: 'boom' });
    expect(none.status).toBeUndefined();
  });

  it('reads no exception out of a body that is none', () => {
    expect(sapExceptionOf('<adtcore:objectReferences/>')).toBeUndefined();
  });
});

describe('readState', () => {
  it('tells an object that exists, with its version, from one that does not', () => {
    expect(
      readState({
        status: 200,
        data: '<x adtcore:version="inactive"/>',
      } as IAdtWireResponse),
    ).toEqual({ status: 200, exists: true, version: 'inactive' });
    expect(readState({ status: 404 } as IAdtWireResponse)).toEqual({
      status: 404,
      exists: false,
    });
    expect(readState(undefined)).toEqual({ exists: 'unknown' });
  });
});

describe('endpointOf', () => {
  it('replaces the names, drops the query and keeps its _action', () => {
    expect(
      endpointOf(
        'post',
        '/sap/bc/adt/ddic/domains/zhsab12dok?_action=LOCK&accessMode=MODIFY',
        undefined,
        ['ZHSAB12DOK'],
      ),
    ).toEqual({
      method: 'POST',
      path: '/sap/bc/adt/ddic/domains/{name}',
      action: 'LOCK',
    });
    expect(
      endpointOf('POST', '/sap/bc/adt/x', { _action: 'UNLOCK' }, []).action,
    ).toBe('UNLOCK');
  });
});

describe('the default-pair column and the summary', () => {
  const rows: IOperationRow[] = [
    {
      objectType: 'domain',
      member: 'check',
      known: KNOWN,
      probes: [answer({ status: 200 })],
    },
    {
      objectType: 'class',
      member: 'check',
      known: KNOWN,
      probes: [
        answer({
          status: 415,
          supportedContentType: ['application/c2+xml'],
          sapMessage: 'Unsupported Media Type. Supported Media Types: …',
          mode: 'sequential: --sequential',
          correction: {
            sent: { accept: KNOWN.accept, contentType: 'application/c2+xml' },
            requests: [],
            status: 200,
            supportedAccept: [],
            supportedContentType: [],
          },
          kept: { accept: KNOWN.accept, contentType: 'application/c2+xml' },
        }),
      ],
    },
    {
      objectType: 'program',
      member: 'check',
      known: KNOWN,
      probes: [answer({ status: 406, supportedAccept: [] })],
    },
  ];

  it('says whether the default pair was accepted, and what the system named instead', () => {
    expect(defaultVerdict(rows[0] as IOperationRow)).toBe('accepted (200)');
    expect(defaultVerdict(rows[1] as IOperationRow)).toBe(
      `refused 415, named application/c2+xml; corrected: sent again → 200; kept accept: ${KNOWN.accept}; content-type: application/c2+xml`,
    );
    expect(defaultVerdict(rows[2] as IOperationRow)).toBe(
      'refused 406, named nothing; not corrected: a recorded call is made once',
    );
  });

  it('lists every default pair refused with 406 or 415, with what was named and the correction', () => {
    const refused = refusedDefaultPairs(rows);
    expect(
      refused.map((entry) => `${entry.objectType}.${entry.member}`),
    ).toEqual(['class.check', 'program.check']);
    expect(refused[0]).toMatchObject({
      status: 415,
      named: ['application/c2+xml'],
      correction: { status: 200 },
    });
  });

  it('lists every endpoint two rows share, and flags answers that differ', () => {
    const collisions = pathCollisions(rows);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.endpoint).toBe('POST /sap/bc/adt/x');
    expect(collisions[0]?.uses.map((use) => use.user)).toEqual([
      'class.check',
      'domain.check',
      'program.check',
    ]);
    expect(collisions[0]?.answersDiffer).toBe(true);
  });

  it('renders a table per object type with the default-pair column, and the summary', () => {
    const report: IProbeReport = {
      startedAt: 'start',
      mode: 'sequential',
      filters: {},
      rows,
      removals: [{ label: 'domain ZHS1', removed: false, detail: 'locked' }],
    };
    const md = renderMarkdown(report);
    expect(md).toContain('## domain');
    expect(md).toContain('| default pair |');
    expect(md).toContain('accepted (200)');
    expect(md).toContain('### Default pairs refused');
    expect(md).toContain('sent again → 200');
    expect(md).toContain('**NOT REMOVED**: domain ZHS1');
  });

  it('compares a batched with a sequential run by the first answer of each probe', () => {
    const batched: IProbeReport = {
      startedAt: 'a',
      mode: 'batched',
      filters: {},
      rows: [rows[0] as IOperationRow],
      removals: [],
    };
    const sequential: IProbeReport = {
      ...batched,
      mode: 'sequential',
      rows: [
        {
          ...(rows[0] as IOperationRow),
          probes: [answer({ status: 400, mode: 'sequential: --sequential' })],
        },
      ],
    };
    expect(modeDifferences(batched, sequential)).toEqual([
      {
        objectType: 'domain',
        member: 'check',
        probe: 'known',
        batched: '200 |  |  | ',
        sequential: '400 |  |  | ',
      },
    ]);
  });
});

describe('every operation with a default pair is probed or skipped with a reason', () => {
  it('the cycle has a step, or the object type a reason, for every default pair', () => {
    const cycle = new Set(cycleOperations());
    const left = Object.keys(DEFAULT_ADT_HEADERS).filter(
      (operation) =>
        !cycle.has(operation) &&
        skipReason(operation.slice(0, operation.indexOf('.'))) === undefined,
    );
    expect(left).toEqual([]);
    const cycleTypes = new Set(
      [...cycle].map((op) => op.slice(0, op.indexOf('.'))),
    );
    for (const type of Object.keys(SKIP_REASONS))
      expect(cycleTypes.has(type)).toBe(false);
  });

  it('reports every wanted operation the run did not reach as skipped, never silently', () => {
    const rows: IOperationRow[] = [
      { objectType: 'domain', member: 'create', probes: [] },
    ];
    const out = unreportedRows(
      [
        'domain.create',
        'domain.delete',
        'debugger.getVariables',
        'class.check',
      ],
      rows,
      { only: ['domain', 'debugger'] },
      (type) => (type === 'debugger' ? 'skipped: needs a debuggee' : undefined),
    );
    expect(out).toEqual([
      {
        objectType: 'domain',
        member: 'delete',
        skipped: 'skipped: not reached — the run stopped before this step',
        probes: [],
      },
      {
        objectType: 'debugger',
        member: 'getVariables',
        skipped: 'skipped: needs a debuggee',
        probes: [],
      },
    ]);
  });
});

describe('prerequisites', () => {
  it('creates whatever the filters say, so a filtered step has an object to work on', () => {
    const filters = { only: ['messageClass'], operation: 'update' };
    expect(plannedKinds(filters, 'messageClass', 'create')).toEqual(['known']);
    expect(plannedKinds(filters, 'messageClassMessage', 'create')).toEqual([
      'known',
    ]);
    expect(plannedKinds(filters, 'messageClassMessage', 'delete')).toEqual([]);
    expect(plannedKinds(filters, 'class', 'create')).toEqual([]);
  });
});

describe('the ledger', () => {
  it('removes every entry, newest first, when the run fails', async () => {
    const removed: string[] = [];
    const ledger = new Ledger();
    for (const label of ['function group', 'function module'])
      ledger.add({
        label,
        remove: async () => {
          removed.push(label);
          return { removed: true, detail: 'deleted' };
        },
      });
    const run = withCleanup(ledger, async () => {
      throw new Error('the system went away');
    });
    await expect(run).rejects.toThrow('the system went away');
    expect(removed).toEqual(['function module', 'function group']);
  });

  it('reports a removal that throws as not removed and goes on', async () => {
    const ledger = new Ledger();
    ledger.add({
      label: 'first',
      remove: async () => ({ removed: true, detail: 'deleted' }),
    });
    ledger.add({
      label: 'second',
      remove: async () => {
        throw new Error('423 locked');
      },
    });
    expect(await ledger.cleanup()).toEqual([
      {
        label: 'second',
        removed: false,
        detail: 'the removal threw: 423 locked',
      },
      { label: 'first', removed: true, detail: 'deleted' },
    ]);
  });

  it('removes an entry added while the cleanup runs, and one added after it', async () => {
    const removed: string[] = [];
    const ledger = new Ledger();
    const entry = (label: string, then?: () => void) => ({
      label,
      remove: async () => {
        removed.push(label);
        then?.();
        return { removed: true, detail: 'deleted' };
      },
    });
    ledger.add(entry('first', () => ledger.add(entry('during'))));
    await ledger.cleanup();
    ledger.add(entry('after'));
    await ledger.cleanup();
    expect(removed).toEqual(['first', 'during', 'after']);
  });

  it('releases a lock when the work under it fails, and runs every item without an interrupt', async () => {
    const released: string[] = [];
    await expect(
      withLock(
        'h',
        async (handle) => released.push(handle),
        async () => {
          throw new Error('423');
        },
      ),
    ).rejects.toThrow('423');
    expect(released).toEqual(['h']);
    const done: number[] = [];
    await eachInTurn([1, 2, 3], undefined, async (item) => {
      done.push(item);
    });
    expect(done).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// The driver on a fake system.

const OP = 'utils.getWhereUsed';
const DEFAULT = DEFAULT_ADT_HEADERS[OP];

/** SAP as the probe meets it: the probe type refused 406 / 415, naming the default. */
function refuses(
  accept: string | undefined,
  contentType: string | undefined,
): PartAnswer {
  if (accept === PROBE_TYPE)
    return {
      status: 406,
      statusText: 'Not Acceptable',
      headers: SAP_EXCEPTION_HEADERS,
      body: notAcceptableBody(DEFAULT.accept),
    };
  if (contentType === PROBE_TYPE)
    return {
      status: 415,
      statusText: 'Unsupported Media Type',
      headers: SAP_EXCEPTION_HEADERS,
      body: unsupportedMediaTypeBody(DEFAULT.contentType),
    };
  return { status: 200, statusText: 'OK', body: '<usageReferences/>' };
}

const headerOf = (request: IAbapRequestOptions, name: string) => {
  for (const [key, value] of Object.entries(request.headers ?? {}))
    if (key.toLowerCase() === name) return String(value);
  return undefined;
};

/** A fake system: envelopes answered part by part, direct requests by `direct`. */
function system(
  direct: (request: IAbapRequestOptions) => PartAnswer = (request) =>
    refuses(headerOf(request, 'accept'), headerOf(request, 'content-type')),
  before?: (request: IAbapRequestOptions) => void,
) {
  return envelopeConnection(
    partByPart((inner: InnerRequest) =>
      refuses(inner.headers.accept, inner.headers['content-type']),
    ),
    async (request): Promise<IAdtWireResponse> => {
      before?.(request);
      const part = direct(request);
      if (part.status >= 400)
        throw statusError(
          part.status,
          part.statusText ?? '',
          part.body ?? '',
          part.headers ?? {},
        );
      return {
        status: part.status,
        statusText: part.statusText ?? 'OK',
        headers: part.headers ?? {},
        data: part.body ?? '',
      } as IAdtWireResponse;
    },
  );
}

function probeOn(
  fake: ReturnType<typeof system>,
  args: { sequential: boolean; only?: string[]; operation?: string },
  interrupt = new Interrupt(),
  ledger = new Ledger(),
) {
  return new Probe(
    fake.connection as unknown as IAbapConnection,
    args,
    ledger,
    { packageName: 'ZPACKAGE', transportRequest: 'XXXK900001' },
    'TEST',
    interrupt,
  );
}

const whereUsed =
  (onCall?: () => void) => () => (client: any, analyse: any, headers: any) => {
    onCall?.();
    return client
      .getUtils()
      .getWhereUsed(
        { object_name: 'ZPROG', object_type: 'program' },
        { headers, analyse },
      );
  };

const pairsOf = (requests: { headers?: unknown }[]) =>
  requests.map((request) => [
    headerOf(request as IAbapRequestOptions, 'accept'),
    headerOf(request as IAbapRequestOptions, 'content-type'),
  ]);

describe('the driver, batched: the server’s batch path', () => {
  it('sends the three probes in one envelope, each recorded once and never corrected', async () => {
    const fake = system();
    const probe = probeOn(fake, { sequential: false });
    await probe.operation({
      objectType: 'utils',
      member: 'getWhereUsed',
      call: whereUsed(),
    });
    expect(fake.envelopes).toHaveLength(1);
    expect(fake.directs).toEqual([]);
    expect(
      fake.envelopes[0]?.parts.map((p) => [
        p.headers.accept,
        p.headers['content-type'],
      ]),
    ).toEqual([
      [DEFAULT.accept, DEFAULT.contentType],
      [PROBE_TYPE, DEFAULT.contentType],
      [DEFAULT.accept, PROBE_TYPE],
    ]);
    const [row] = probe.rows;
    expect(row?.probes.map((p) => [p.probe, p.status, p.correction])).toEqual([
      ['known', 200, undefined],
      ['badAccept', 406, undefined],
      ['badContentType', 415, undefined],
    ]);
    expect(row?.probes[2]?.supportedContentType).toEqual([DEFAULT.contentType]);
    expect(defaultVerdict(row as IOperationRow)).toBe('accepted (200)');
  });

  it('a Ctrl-C while the parts are recorded sends no envelope', async () => {
    const fake = system();
    const interrupt = new Interrupt();
    const probe = probeOn(fake, { sequential: false }, interrupt);
    const run = probe.operation({
      objectType: 'utils',
      member: 'getWhereUsed',
      call: whereUsed(() => interrupt.stop()),
    });
    await expect(run).rejects.toBeInstanceOf(Interrupted);
    expect(fake.envelopes).toEqual([]);
    expect(fake.directs).toEqual([]);
  });
});

describe('the driver, sequential: the server’s correction', () => {
  it("a bad pair refused 406/415 is sent once more with what SAP named, and that pair is kept; SAP's application/xml never", async () => {
    const fake = system();
    const probe = probeOn(fake, { sequential: true });
    await probe.operation({
      objectType: 'utils',
      member: 'getWhereUsed',
      call: whereUsed(),
    });
    expect(fake.envelopes).toEqual([]);
    expect(pairsOf(fake.directs)).toEqual([
      [DEFAULT.accept, DEFAULT.contentType],
      [PROBE_TYPE, DEFAULT.contentType],
      [DEFAULT.accept, DEFAULT.contentType],
      [DEFAULT.accept, PROBE_TYPE],
      [DEFAULT.accept, DEFAULT.contentType],
    ]);
    const probes = probe.rows[0]?.probes ?? [];
    expect(probes.map((p) => [p.status, p.correction?.status])).toEqual([
      [200, undefined],
      [406, 200],
      [415, 200],
    ]);
    expect(probes[2]?.kept).toEqual(DEFAULT);
    expect(pairsOf(fake.directs).flat()).not.toContain('application/xml');
  });

  it('a Ctrl-C lets the member call in flight finish whole — its correction included — and sends nothing after', async () => {
    const interrupt = new Interrupt();
    const fake = system(undefined, (request) => {
      // Ctrl-C while the bad-Accept probe is on the wire.
      if (headerOf(request, 'accept') === PROBE_TYPE) interrupt.stop();
    });
    const probe = probeOn(fake, { sequential: true }, interrupt);
    const run = probe.operation({
      objectType: 'utils',
      member: 'getWhereUsed',
      call: whereUsed(),
    });
    await expect(run).rejects.toBeInstanceOf(Interrupted);
    expect(pairsOf(fake.directs)).toEqual([
      [DEFAULT.accept, DEFAULT.contentType],
      [PROBE_TYPE, DEFAULT.contentType],
      [DEFAULT.accept, DEFAULT.contentType],
    ]);
  });
});

const LOCK_ANSWER =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><LOCK_HANDLE>LOCKHANDLE01</LOCK_HANDLE><CORRNR/></DATA></asx:values></asx:abap>';

const actionOf = (request: IAbapRequestOptions) =>
  endpointOf(request.method, request.url, request.params, []).action;

describe('the driver, a cycle', () => {
  const domain = OBJECT_SPECS.find((s) => s.type === 'domain') as IObjectSpec;
  // The process context a stdio server learns at its start.
  beforeEach(() =>
    setSystemContext({ responsible: 'PROBE_USER', masterSystem: 'SYS' }),
  );
  afterEach(() => resetSystemContextCache());

  it('a Ctrl-C while the LOCK is on the wire still unlocks, and writes nothing', async () => {
    const interrupt = new Interrupt();
    const fake = system(
      (request) =>
        actionOf(request) === 'LOCK'
          ? { status: 200, statusText: 'OK', body: LOCK_ANSWER }
          : { status: 200, statusText: 'OK', body: '<domain/>' },
      (request) => {
        if (actionOf(request) === 'LOCK') interrupt.stop();
      },
    );
    const probe = probeOn(fake, { sequential: true }, interrupt);
    await expect(probe.objectType(domain)).rejects.toBeInstanceOf(Interrupted);
    const actions = fake.directs.map(actionOf).filter(Boolean);
    expect(actions).toEqual(['LOCK', 'UNLOCK']);
    const afterLock = fake.directs.slice(
      fake.directs.findIndex((r) => actionOf(r) === 'LOCK') + 1,
    );
    expect(afterLock.map(actionOf)).toEqual(['UNLOCK']);
  });

  it('a create other steps need runs whatever --operation says; only the asked row is reported', async () => {
    const fake = system(() => ({
      status: 200,
      statusText: 'OK',
      body: '<domain/>',
    }));
    const probe = probeOn(fake, { sequential: true, operation: 'check' });
    await probe.objectType(domain);
    const creates = fake.directs.filter(
      (r) =>
        r.method.toUpperCase() === 'POST' &&
        (r.url.split('?')[0] ?? '').endsWith('/domains'),
    );
    expect(creates).toHaveLength(1);
    expect(probe.rows.map((row) => `${row.objectType}.${row.member}`)).toEqual([
      'domain.check',
    ]);
  });

  it('ledger entries for every name are there before any create is sent', async () => {
    const ledger = new Ledger();
    const sizes: number[] = [];
    const fake = system(
      () => ({ status: 200, statusText: 'OK', body: '<domain/>' }),
      (request) => {
        if (request.method.toUpperCase() === 'POST') sizes.push(ledger.size);
      },
    );
    const probe = probeOn(
      fake,
      { sequential: true, operation: 'create' },
      new Interrupt(),
      ledger,
    );
    await probe.objectType(domain);
    expect(sizes[0]).toBe(3);
  });
});
