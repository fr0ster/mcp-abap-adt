/**
 * The server's wire log (`DEBUG_HTTP_WIRE`, `withHttpWireLog`) honours
 * `noLog` (spec §3.4): a flagged request's line, if any, carries the method,
 * the path without its query, the integer status and the byte count —
 * never the query, the params, the headers, the body, the status text or a
 * thrown error's text, on the success and the thrown branch alike. Over the
 * abapGit R1 pre-read (`listReposQuiet`, which sends `noLog`) and over a
 * flagged request carrying a canary in every place, with the debug flag on;
 * a request without `noLog` is logged as before.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { AdtAbapGitClient } from '@mcp-abap-adt/adt-clients/abapgit';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { withHttpWireLog } from '../../../lib/connectionFactory';

const CANARY = 'canary-7q3z-0123456789abcdef';

const R1 =
  '<?xml version="1.0" encoding="utf-8"?><abapgitrepo:repositories xmlns:abapgitrepo="http://www.sap.com/adt/abapgit/repositories">' +
  '<abapgitrepo:repository><abapgitrepo:key>000001</abapgitrepo:key>' +
  '<abapgitrepo:package>ZPKG</abapgitrepo:package>' +
  `<abapgitrepo:url>https://git.example.invalid/${CANARY}</abapgitrepo:url>` +
  '<abapgitrepo:branchName>refs/heads/main</abapgitrepo:branchName>' +
  '</abapgitrepo:repository></abapgitrepo:repositories>';

/** A connection answering `R1` (or throwing a canary-laden refusal when `fails`). */
function sapAnswering(fails: boolean): IAbapConnection {
  return {
    async connect() {},
    async getBaseUrl() {
      return 'https://sap.example.invalid';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest<T = unknown, D = unknown>(
      _options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      if (fails) {
        throw Object.assign(new Error(`refused ${CANARY}`), {
          response: {
            status: 500,
            statusText: `failed ${CANARY}`,
            headers: { 'x-echo': CANARY },
            data: `<exc>${CANARY}</exc>`,
          },
        });
      }
      // A recorded body is text; `T` is the caller's view of it.
      return {
        data: R1 as T,
        status: 200,
        statusText: `OK ${CANARY}`,
        headers: { 'x-echo': CANARY },
      };
    },
  };
}

let written: string[] = [];
let previous: string | undefined;
beforeEach(() => {
  written = [];
  previous = process.env.DEBUG_HTTP_WIRE;
  process.env.DEBUG_HTTP_WIRE = 'true';
  mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  mock.restoreAll();
  if (previous === undefined) delete process.env.DEBUG_HTTP_WIRE;
  else process.env.DEBUG_HTTP_WIRE = previous;
});

const FLAGGED: IAbapRequestOptions = {
  method: 'POST',
  url: `/sap/bc/adt/abapgit/repos/000001/push?token=${CANARY}`,
  timeout: 0,
  params: { secret: CANARY },
  headers: { Username: CANARY, 'x-other': CANARY },
  data: `<body>${CANARY}</body>`,
  noLog: true,
};

describe('the wire log with noLog: method, path, status and bytes only', () => {
  it('the R1 pre-read logs no body and no status text', async () => {
    const read = await AdtAbapGitClient.create(
      withHttpWireLog(sapAnswering(false)),
    ).listReposQuiet();
    assert.equal(read.ok, true);
    assert.ok(written.length > 0, 'the wire log wrote nothing at all');
    assert.ok(
      written.every((line) => !line.includes(CANARY)),
      written.join(''),
    );
    assert.ok(
      written.some((line) => line.includes('GET /sap/bc/adt/abapgit/repos')),
    );
    assert.ok(written.some((line) => line.includes('200')));
  });

  it('a flagged request: no query, params, headers or body; on success no status text or body', async () => {
    await withHttpWireLog(sapAnswering(false)).makeAdtRequest(FLAGGED);
    assert.ok(
      written.every((line) => !line.includes(CANARY)),
      written.join(''),
    );
    assert.ok(
      written.some((line) =>
        line.includes('POST /sap/bc/adt/abapgit/repos/000001/push\n'),
      ),
    );
    assert.ok(
      written.some((line) => line.includes(`${Buffer.byteLength(R1)} bytes`)),
    );
  });

  it('a flagged request that throws: the integer status alone, no error text or body', async () => {
    await assert.rejects(
      withHttpWireLog(sapAnswering(true)).makeAdtRequest(FLAGGED),
    );
    assert.ok(
      written.every((line) => !line.includes(CANARY)),
      written.join(''),
    );
    assert.ok(written.some((line) => line.includes('threw 500')));
  });

  it('an absolute URL: only its pathname, never userinfo, query or fragment', async () => {
    await withHttpWireLog(sapAnswering(false)).makeAdtRequest({
      ...FLAGGED,
      url: `https://u-${CANARY}:p-${CANARY}@sap.example.invalid/sap/bc/adt/abapgit/repos?q=${CANARY}#f-${CANARY}`,
    });
    assert.ok(
      written.every((line) => !line.includes(CANARY)),
      written.join(''),
    );
    assert.ok(written.every((line) => !line.includes('sap.example.invalid')));
    assert.ok(
      written.some((line) => line.includes('POST /sap/bc/adt/abapgit/repos\n')),
    );
  });

  it('a relative path with a fragment: its pathname alone', async () => {
    await withHttpWireLog(sapAnswering(false)).makeAdtRequest({
      ...FLAGGED,
      url: `/sap/bc/adt/abapgit/repos#${CANARY}`,
    });
    assert.ok(
      written.every((line) => !line.includes(CANARY)),
      written.join(''),
    );
  });

  for (const [label, data, bytes] of [
    ['an ArrayBuffer', new ArrayBuffer(5), 5],
    ['a DataView', new DataView(new ArrayBuffer(8), 1, 7), 7],
    ['a Uint16Array', new Uint16Array(3), 6],
  ] as const) {
    it(`${label}: its byte length`, async () => {
      const answering: IAbapConnection = {
        ...sapAnswering(false),
        async makeAdtRequest<T = unknown, D = unknown>(): Promise<
          IAdtWireResponse<T, D>
        > {
          // A recorded body; `T` is the caller's view of it.
          return {
            data: data as T,
            status: 200,
            statusText: 'OK',
            headers: {},
          };
        },
      };
      await withHttpWireLog(answering).makeAdtRequest(FLAGGED);
      assert.ok(
        written.some((line) => line.includes(`200 ${bytes} bytes`)),
        written.join(''),
      );
    });
  }

  it('a body whose byte length throws (a detached DataView): the line without a count, the request untouched', async () => {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    structuredClone(buffer, { transfer: [buffer] });
    assert.throws(() => view.byteLength);
    const detached: IAbapConnection = {
      ...sapAnswering(false),
      async makeAdtRequest<T = unknown, D = unknown>(): Promise<
        IAdtWireResponse<T, D>
      > {
        // A recorded body; `T` is the caller's view of it.
        return { data: view as T, status: 200, statusText: 'OK', headers: {} };
      },
    };
    const answer = await withHttpWireLog(detached).makeAdtRequest(FLAGGED);
    assert.equal(answer.status, 200);
    assert.equal(answer.data, view);
    assert.ok(
      written.some((line) => line.endsWith('→ 200\n')),
      written.join(''),
    );
    assert.ok(written.every((line) => !line.includes('bytes')));
  });

  it('a binary answer: its byte count too', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const binary: IAbapConnection = {
      ...sapAnswering(false),
      async makeAdtRequest<T = unknown, D = unknown>(): Promise<
        IAdtWireResponse<T, D>
      > {
        // A recorded body; `T` is the caller's view of it.
        return { data: bytes as T, status: 200, statusText: 'OK', headers: {} };
      },
    };
    await withHttpWireLog(binary).makeAdtRequest(FLAGGED);
    assert.ok(
      written.some((line) => line.includes('200 5 bytes')),
      written.join(''),
    );
  });

  it('a request without noLog is logged as before', async () => {
    await withHttpWireLog(sapAnswering(false)).makeAdtRequest({
      method: 'GET',
      url: '/sap/bc/adt/discovery',
      timeout: 0,
    });
    assert.ok(written.some((line) => line.includes(CANARY)));
  });
});
