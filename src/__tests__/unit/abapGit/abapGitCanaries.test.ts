/**
 * Structure and facts at the server (spec §5.3, T6.8): every abapGit tool,
 * run with a bound credential whose user and token are canaries, against a
 * stubbed SAP that echoes the canaries (and the base64 password) in every
 * place the server drops — the body text, the headers, the status text,
 * `msgText`, `actionDescription`, `displayName`, the exception text, the
 * message variables, `LONGTEXT`, the thrown error's message.
 *
 * Over HTTP (the server's own wire log, `withHttpWireLog`, switched on) and
 * over RFC (the connector's `RfcTransport`, its wire log asked for), on the
 * success and the refusal branch each:
 *
 * - every wire line holds no canary and no query;
 * - the answer and the error hold none, and the error is the fixed message
 *   and the kept facts alone;
 * - the credential did reach SAP's request (the canaries are request-side
 *   too), so the absence above is the server's dropping it.
 *
 * A refusal line (a call without the admission) holds none either.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { RfcTransport } from '@mcp-abap-adt/connection';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetAbapGitBranchInfo } from '../../../handlers/abapgit/high/handleGetAbapGitBranchInfo';
import { handleLinkAbapGitRepo } from '../../../handlers/abapgit/high/handleLinkAbapGitRepo';
import { handlePullAbapGitRepo } from '../../../handlers/abapgit/high/handlePullAbapGitRepo';
import { handlePushAbapGitRepo } from '../../../handlers/abapgit/high/handlePushAbapGitRepo';
import { handleSwitchAbapGitBranch } from '../../../handlers/abapgit/high/handleSwitchAbapGitBranch';
import { handleCheckAbapGitExternalRepo } from '../../../handlers/abapgit/readonly/handleCheckAbapGitExternalRepo';
import { handleCheckAbapGitRepo } from '../../../handlers/abapgit/readonly/handleCheckAbapGitRepo';
import { handleGetAbapGitErrorLog } from '../../../handlers/abapgit/readonly/handleGetAbapGitErrorLog';
import { handleGetAbapGitFile } from '../../../handlers/abapgit/readonly/handleGetAbapGitFile';
import { handleGetAbapGitModifiedObjects } from '../../../handlers/abapgit/readonly/handleGetAbapGitModifiedObjects';
import { handleGetAbapGitStaging } from '../../../handlers/abapgit/readonly/handleGetAbapGitStaging';
import { handleListAbapGitRepos } from '../../../handlers/abapgit/readonly/handleListAbapGitRepos';
import type { AbapGitAdmission } from '../../../lib/abapGit/admission';
import { withHttpWireLog } from '../../../lib/connectionFactory';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  ADMITTED_REPO,
  ALL_CANARIES,
  answerText,
  BOUND_CREDENTIALS,
  CANARIES,
  contextOn,
  exception,
  externalRepo,
  modifiedObjects,
  noObjects,
  objectResults,
  REPO_KEY,
  REPO_URL,
  reposDocument,
  type SentRequest,
  staging,
  stubSap,
} from '../../helpers/abapGitSap';

const R1: AbapGitAdmission = {
  repo: ADMITTED_REPO,
  credentials: BOUND_CREDENTIALS,
};
const URL_ROUTE: AbapGitAdmission = {
  sendUrl: REPO_URL,
  credentials: BOUND_CREDENTIALS,
};

/** The canaries as SAP may echo them anywhere: in a header and a status text too. */
const ECHO = ALL_CANARIES.join(' ');

type Handler = (
  context: HandlerContext,
) => Promise<{ content: ReadonlyArray<{ text?: string }>; isError?: boolean }>;

/** Every abapGit tool with a credential bound: its call, its admission, SAP's document. */
const TOOLS: ReadonlyArray<{
  readonly name: string;
  readonly call: Handler;
  readonly admission: AbapGitAdmission;
  readonly document: string;
}> = [
  {
    name: 'ListAbapGitRepos',
    call: (context) => handleListAbapGitRepos(context, { detail: 'full' }),
    admission: {},
    document: reposDocument,
  },
  {
    name: 'CheckAbapGitExternalRepo',
    call: (context) =>
      handleCheckAbapGitExternalRepo(context, {
        url: REPO_URL,
        detail: 'full',
      }),
    admission: URL_ROUTE,
    document: externalRepo(),
  },
  {
    name: 'GetAbapGitBranchInfo',
    call: (context) =>
      handleGetAbapGitBranchInfo(context, {
        url: REPO_URL,
        branch: 'refs/heads/main',
        package_name: 'ZPKG',
        detail: 'full',
      }),
    admission: URL_ROUTE,
    document: externalRepo({ folderLogic: true }),
  },
  {
    name: 'LinkAbapGitRepo',
    call: (context) =>
      handleLinkAbapGitRepo(context, {
        package_name: 'ZPKG',
        url: REPO_URL,
        branch: 'refs/heads/main',
      }),
    admission: URL_ROUTE,
    document: objectResults,
  },
  {
    name: 'PullAbapGitRepo',
    call: (context) =>
      handlePullAbapGitRepo(context, { repository_key: REPO_KEY }),
    admission: R1,
    document: objectResults,
  },
  {
    name: 'GetAbapGitModifiedObjects',
    call: (context) =>
      handleGetAbapGitModifiedObjects(context, {
        repository_key: REPO_KEY,
        detail: 'full',
      }),
    admission: R1,
    document: modifiedObjects,
  },
  {
    name: 'GetAbapGitStaging',
    call: (context) =>
      handleGetAbapGitStaging(context, {
        repository_key: REPO_KEY,
        detail: 'full',
      }),
    admission: R1,
    document: staging,
  },
  {
    name: 'PushAbapGitRepo',
    call: (context) =>
      handlePushAbapGitRepo(context, {
        repository_key: REPO_KEY,
        objects: [],
        comment: 'the commit',
        author: { name: 'Ada', email: 'ada@example.invalid' },
        committer: { name: 'Carl', email: 'carl@example.invalid' },
      }),
    admission: R1,
    document: noObjects,
  },
  {
    name: 'CheckAbapGitRepo',
    call: (context) =>
      handleCheckAbapGitRepo(context, { repository_key: REPO_KEY }),
    admission: R1,
    document: '',
  },
  {
    name: 'GetAbapGitFile',
    call: (context) =>
      handleGetAbapGitFile(context, {
        repository_key: REPO_KEY,
        filename: 'zcl_demo.clas.abap',
        version: 'remote',
      }),
    admission: R1,
    document: 'CLASS zcl_demo DEFINITION.',
  },
  {
    name: 'SwitchAbapGitBranch',
    call: (context) =>
      handleSwitchAbapGitBranch(context, {
        repository_key: REPO_KEY,
        branch: 'refs/heads/other',
        create: false,
      }),
    admission: R1,
    document: '',
  },
  {
    name: 'GetAbapGitErrorLog',
    call: (context) =>
      handleGetAbapGitErrorLog(context, {
        repository_key: REPO_KEY,
        app_log_key: ADMITTED_REPO.appLogKey,
        detail: 'full',
      }),
    admission: R1,
    document: objectResults,
  },
];

/** The tools whose request carries the bound credential (the list and the run log carry none). */
const SENDS_CREDENTIAL: ReadonlySet<string> = new Set(
  TOOLS.map((tool) => tool.name).filter(
    (name) => name !== 'ListAbapGitRepos' && name !== 'GetAbapGitErrorLog',
  ),
);

/** What a text holds of the canaries. */
function canariesIn(text: string): string[] {
  return ALL_CANARIES.filter((canary) => text.includes(canary));
}

/** Whether the request carried the bound credential (the canaries are request-side too). */
function carriesCredential(request: SentRequest): boolean {
  return (
    String(request.data).includes(CANARIES.user) ||
    Object.values(request.headers).some((value) =>
      value.includes(CANARIES.user),
    )
  );
}

describe('canaries over HTTP: the server wire log, the answer, the error', () => {
  let lines: string[] = [];
  let previous: string | undefined;
  beforeEach(() => {
    lines = [];
    previous = process.env.DEBUG_HTTP_WIRE;
    process.env.DEBUG_HTTP_WIRE = 'true';
    mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    mock.restoreAll();
    if (previous === undefined) delete process.env.DEBUG_HTTP_WIRE;
    else process.env.DEBUG_HTTP_WIRE = previous;
  });

  for (const tool of TOOLS) {
    for (const refused of [false, true]) {
      it(`${tool.name}, ${refused ? "SAP's refusal" : 'a success'}: no canary and no query anywhere`, async () => {
        const sap = stubSap(() =>
          refused
            ? {
                status: 500,
                statusText: `refused ${ECHO}`,
                headers: { 'x-echo': ECHO },
                data: exception({ httpStatus: '401' }),
              }
            : {
                status: 200,
                statusText: `OK ${ECHO}`,
                headers: { 'x-echo': ECHO },
                data: tool.document,
              },
        );
        const connection = withHttpWireLog(sap.connection);
        const result = await tool.call(contextOn(connection, tool.admission));
        const text = answerText(result);
        assert.deepEqual(canariesIn(text), [], text);
        if (refused) {
          assert.equal(result.isError, true);
          const parsed: unknown = JSON.parse(text);
          assert.ok(typeof parsed === 'object' && parsed !== null);
          assert.deepEqual(Object.keys(parsed).sort(), ['facts', 'message']);
        }
        const wire = lines.join('');
        assert.ok(wire.includes('[WIRE'), 'the wire log is on');
        assert.deepEqual(canariesIn(wire), [], wire);
        assert.equal(wire.includes('?'), false, wire);
        if (SENDS_CREDENTIAL.has(tool.name)) {
          assert.ok(
            sap.sent.some(carriesCredential),
            'the credential reached the request',
          );
        }
      });
    }
  }

  for (const tool of TOOLS) {
    it(`${tool.name}, a connection that throws with no response: no canary and no query anywhere`, async () => {
      const sap = stubSap(() => {
        // What a socket error carries: its message and its request config
        // echo the canaries; there is no response.
        throw Object.assign(new Error(`socket hang up ${ECHO}`), {
          code: 'ECONNRESET',
          config: {
            url: `/sap/bc/adt/abapgit?u=${ECHO}`,
            headers: { 'x-echo': ECHO },
          },
        });
      });
      const connection = withHttpWireLog(sap.connection);
      const result = await tool.call(contextOn(connection, tool.admission));
      const text = answerText(result);
      assert.equal(result.isError, true);
      assert.deepEqual(canariesIn(text), [], text);
      const wire = lines.join('');
      assert.ok(wire.includes('[WIRE'), 'the wire log is on');
      assert.deepEqual(canariesIn(wire), [], wire);
      // The request line names the path without its query; the thrown
      // line has no status to name (`threw ?`).
      const requestLines = wire
        .split('\n')
        .filter((line) => /^\[WIRE \d+\] [A-Z]+ \//.test(line));
      assert.ok(requestLines.length > 0, wire);
      for (const line of requestLines) {
        assert.equal(line.includes('?'), false, line);
      }
      assert.ok(wire.includes('threw'), wire);
      if (SENDS_CREDENTIAL.has(tool.name)) {
        assert.ok(
          sap.sent.some(carriesCredential),
          'the credential reached the request',
        );
      }
    });
  }

  it('a refusal line holds no canary', async () => {
    const sap = stubSap();
    const result = await handlePullAbapGitRepo(
      contextOn(withHttpWireLog(sap.connection)),
      { repository_key: REPO_KEY },
    );
    assert.equal(result.isError, true);
    assert.equal(sap.sent.length, 0);
    assert.deepEqual(canariesIn(lines.join('') + answerText(result)), []);
  });
});

/**
 * An `IAbapConnection` over the connector's real `RfcTransport`, its wire
 * log asked for: the conversation answers `answer` (`STATUS_LINE`,
 * `HEADER_FIELDS`, `MESSAGE_BODY`) and keeps what it was sent.
 */
function rfcSap(answer: { status: number; reason: string; body: string }) {
  const lines: string[] = [];
  const received: string[] = [];
  const logger = {
    debug: (message: string, meta?: unknown) =>
      lines.push(
        `${message} ${meta === undefined ? '' : JSON.stringify(meta)}`,
      ),
    info: (message: string) => lines.push(message),
    warn: (message: string) => lines.push(message),
    error: (message: string) => lines.push(message),
  };
  const conversation = () => ({
    open: async () => {},
    close: async () => {},
    alive: true,
    call: async (_name: string, parameters: unknown) => {
      // A body goes as bytes: read as text, to find the credential in it.
      received.push(
        JSON.stringify(parameters, (_key, value: unknown) =>
          typeof value === 'object' &&
          value !== null &&
          'type' in value &&
          value.type === 'Buffer' &&
          'data' in value &&
          Array.isArray(value.data)
            ? Buffer.from(value.data).toString('utf8')
            : value,
        ),
      );
      return {
        STATUS_LINE: `HTTP/1.1 ${answer.status} ${answer.reason}`,
        MESSAGE_BODY: answer.body,
        HEADER_FIELDS: [
          { NAME: 'content-type', VALUE: 'application/xml' },
          { NAME: 'x-echo', VALUE: ECHO },
        ],
      };
    },
  });
  // The connector's own types for its conversation factory and logger are
  // not exported; the stand-ins have their shape.
  const transport = new RfcTransport(conversation as never, logger as never, {
    logWire: true,
  });
  const connection: IAbapConnection = {
    async connect() {
      await transport.open();
    },
    async getBaseUrl() {
      return 'rfc://sap.example.invalid';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest<T = unknown, D = unknown>(
      options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      await transport.open();
      const response = await transport.send(options as never);
      const wire = {
        status: response.status,
        statusText: response.statusText ?? '',
        headers: {},
        data: response.data as T,
      };
      if (response.status >= 400) {
        throw Object.assign(new Error(`status ${response.status} ${ECHO}`), {
          response: wire,
        });
      }
      return wire;
    },
  };
  return { connection, lines, received };
}

describe('canaries over RFC: the connector wire log, the answer, the error', () => {
  for (const tool of TOOLS) {
    for (const refused of [false, true]) {
      it(`${tool.name}, ${refused ? "SAP's refusal" : 'a success'}: no canary and no query anywhere`, async () => {
        const sap = rfcSap(
          refused
            ? {
                status: 500,
                reason: `Refused ${ECHO}`,
                body: exception({ httpStatus: '401' }),
              }
            : { status: 200, reason: `OK ${ECHO}`, body: tool.document },
        );
        const result = await tool.call(
          contextOn(sap.connection, tool.admission),
        );
        const text = answerText(result);
        assert.deepEqual(canariesIn(text), [], text);
        const wire = sap.lines.join('\n');
        assert.deepEqual(canariesIn(wire), [], wire);
        assert.equal(wire.includes('?'), false, wire);
        if (SENDS_CREDENTIAL.has(tool.name)) {
          assert.ok(
            sap.received.some((sent) => sent.includes(CANARIES.user)),
            'the credential reached the request',
          );
        }
      });
    }
  }
});
