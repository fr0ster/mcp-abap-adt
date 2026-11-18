/**
 * The one repeat of a call SAP refused before anything of it ran (24.0.1,
 * the owner's named exception to "no retries"). After SAP ends an idle
 * session, the first request with its stale cookie is answered `403` with
 * `x-csrf-token: Required` in a new session: the connection marks it
 * `sessionLost` and is spent (measured on premise, 2026-11-18). The server
 * runs such a call once more on the connection `getConnection` gives.
 *
 * A real server over the ADT stand-in, real connection and adt-clients
 * code: the stand-in ends the session (`endSession`) and refuses the stale
 * cookie's request as SAP does.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import {
  REPEATED_CALL_WORDS,
  repeatsOnTokenRefusal,
} from '../../embeddable/BaseMcpServer';
import { ALLOWED } from '../../lib/access/accessChecks';
import { createAbapConnection } from '../../lib/connectionFactory';
import { CSRF_REFUSAL_WORDS } from '../../lib/csrfRefusal';
import {
  SESSION_RENEWAL_FAILED_WORDS,
  SESSION_RENEWED_WORDS,
} from '../../lib/sessionRenewed';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  type StandInRequest,
} from '../helpers/adtStandIn';
import {
  inProcessServer,
  type PinServer,
  pinServer,
} from '../helpers/pinServer';

const ACTIVATION = '/sap/bc/adt/activation';
const INTERFACE = '/sap/bc/adt/oo/interfaces/zif_a';

let stand: AdtStandIn;
let server: PinServer;
const logged: string[] = [];

beforeEach(async () => {
  logged.length = 0;
  stand = await adtStandIn();
  server = await pinServer('onprem', stand, undefined, (message) => {
    logged.push(message);
  });
});

afterEach(async () => {
  await server.close();
  await stand.close();
});

/** The text of an answer. */
function textOf(answer: { content?: Array<{ text?: string }> }): string {
  return (answer.content ?? []).map((part) => part.text ?? '').join('\n');
}

/** The `session_renewed` field of an answer's JSON, if it has one. */
function renewedOf(answer: { content?: Array<{ text?: string }> }): unknown {
  const [first] = answer.content ?? [];
  const parsed: unknown = JSON.parse(first?.text ?? 'null');
  return typeof parsed === 'object' &&
    parsed !== null &&
    'session_renewed' in parsed
    ? parsed.session_renewed
    : undefined;
}

/** The session the instance's connection works in now (its last request's). */
function currentSession(): string {
  const last = [...stand.requests]
    .reverse()
    .find((request) => !isLogoff(request.url));
  if (last === undefined) throw new Error('no request yet');
  return last.session;
}

/**
 * SAP ends `session` (its idle timeout): from now on a request matching
 * `which` that carries its cookie is refused `403` `x-csrf-token: Required`
 * in a new session, as SAP answers it.
 */
function endWithTokenRefusal(
  session: string,
  which: (request: StandInRequest) => boolean,
): void {
  stand.endSession(session);
  stand.respond(
    (request) =>
      which(request) && (request.cookie ?? '').includes(`=${session}`),
    () => ({
      status: 403,
      headers: { 'x-csrf-token': 'Required' },
      text: 'CSRF token validation failed',
    }),
  );
}

/** The requests of `method` to a path starting with `path`. */
function sent(method: string, path: string): StandInRequest[] {
  return stand.requests.filter(
    (request) => request.method === method && request.url.startsWith(path),
  );
}

const activate = () => server.call('ActivateClass', { class_name: 'ZCL_A' });

describe('a call SAP refused for its token in a new session, before anything ran', () => {
  it('runs once more, and answers the repeat', async () => {
    await activate();
    endWithTokenRefusal(currentSession(), (r) => r.url.startsWith(ACTIVATION));
    const answered = await activate();
    expect(answered.isError).not.toBe(true);
    expect(textOf(answered)).not.toContain(CSRF_REFUSAL_WORDS);
    expect(sent('POST', ACTIVATION)).toHaveLength(3);
    expect(logged).toContain(REPEATED_CALL_WORDS);
    expect(renewedOf(answered)).toBe(SESSION_RENEWED_WORDS);
  });

  it('a normal call carries no session_renewed', async () => {
    expect(renewedOf(await activate())).toBeUndefined();
  });

  it('a repeat that fails answers its own failure, and runs no third time', async () => {
    await activate();
    const old = currentSession();
    endWithTokenRefusal(old, (r) => r.url.startsWith(ACTIVATION));
    stand.respond(
      (request) =>
        request.url.startsWith(ACTIVATION) &&
        !(request.cookie ?? '').includes(`=${old}`),
      () => ({ status: 500, text: 'repeat failed' }),
    );
    const answered = await activate();
    expect(answered.isError).toBe(true);
    expect(textOf(answered)).toContain('500');
    expect(sent('POST', ACTIVATION)).toHaveLength(3);
    expect(renewedOf(answered)).toBe(SESSION_RENEWED_WORDS);
  });
});

describe('a call whose first request, a stateful LOCK, SAP answered in a new session', () => {
  it('runs once more (the connection threw SESSION_REPLACED), and answers the repeat', async () => {
    const update = () =>
      server.call('UpdateInterface', {
        interface_name: 'ZIF_A',
        source_code: 'INTERFACE zif_a PUBLIC. ENDINTERFACE.',
        activate: false,
      });
    await update();
    // SAP ended the session: the LOCK with its cookie is answered in a new
    // one, which the connection reads as a replaced session.
    stand.endSession(currentSession());
    const before = sent('POST', `${INTERFACE}?_action=LOCK`).length;
    const answered = await update();
    expect(answered.isError).not.toBe(true);
    expect(textOf(answered)).not.toContain('The SAP session this connection');
    expect(sent('POST', `${INTERFACE}?_action=LOCK`).length - before).toBe(2);
    expect(logged).toContain(REPEATED_CALL_WORDS);
    expect(renewedOf(answered)).toBe(SESSION_RENEWED_WORDS);
  });
});

describe('no repeat', () => {
  it('a SESSION_REPLACED after a request of the call was answered (the lock ran, the write met it)', async () => {
    const update = () =>
      server.call('UpdateInterface', {
        interface_name: 'ZIF_A',
        source_code: 'INTERFACE zif_a PUBLIC. ENDINTERFACE.',
        activate: false,
      });
    await update();
    // SAP ends the session while the lock is answered: the write after it
    // carries the ended session's cookie.
    let ended = false;
    stand.respond(
      (request) =>
        !ended &&
        request.method === 'POST' &&
        request.url.includes('_action=LOCK'),
      (request) => {
        ended = true;
        endWithTokenRefusal(request.session, (r) => r.method === 'PUT');
        return {
          status: 200,
          headers: { 'x-csrf-token': 'csrf-placeholder' },
          text: '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><LOCK_HANDLE>H1</LOCK_HANDLE><CORRNR/><IS_LOCAL>X</IS_LOCAL></DATA></asx:values></asx:abap>',
        };
      },
    );
    const before = sent('POST', `${INTERFACE}?_action=LOCK`).length;
    await update();
    expect(sent('POST', `${INTERFACE}?_action=LOCK`).length - before).toBe(1);
    expect(logged).not.toContain(REPEATED_CALL_WORDS);
  });

  it('a 403 with x-csrf-token: Required in the same session (no sessionLost)', async () => {
    await activate();
    stand.respond(
      (request) => request.url.startsWith(ACTIVATION),
      () => ({
        status: 403,
        headers: { 'x-csrf-token': 'Required' },
        text: 'CSRF token validation failed',
      }),
    );
    const before = sent('POST', ACTIVATION).length;
    const answered = await activate();
    expect(answered.isError).toBe(true);
    expect(logged).not.toContain(REPEATED_CALL_WORDS);
    // The connection's own resend with a new token, and nothing more.
    expect(sent('POST', ACTIVATION).length - before).toBe(2);
  });

  it('a 403 without the header in a new session (an authorization refusal)', async () => {
    await activate();
    const old = currentSession();
    stand.endSession(old);
    stand.respond(
      (request) =>
        request.url.startsWith(ACTIVATION) &&
        (request.cookie ?? '').includes(`=${old}`),
      () => ({ status: 403, text: 'No authorization' }),
    );
    const before = sent('POST', ACTIVATION).length;
    const answered = await activate();
    expect(answered.isError).toBe(true);
    expect(sent('POST', ACTIVATION).length - before).toBe(1);
    expect(logged).not.toContain(REPEATED_CALL_WORDS);
  });

  it('a background run (a long read on its own connection)', async () => {
    await activate();
    endWithTokenRefusal(currentSession(), (r) =>
      r.url.startsWith('/sap/bc/adt/repository/informationsystem/search'),
    );
    await server.call('SearchObject', {
      object_name: 'ZCL_A',
      background: false,
    });
    expect(logged).not.toContain(REPEATED_CALL_WORDS);
  });
});

describe('the repeat takes its connection as any call does', () => {
  it('a logon the repeat needs, refused, is the answer, and the tool runs once', async () => {
    await activate();
    const old = currentSession();
    stand.endSession(old);
    stand.respond(
      (request) =>
        request.url.startsWith(ACTIVATION) &&
        (request.cookie ?? '').includes(`=${old}`),
      () => {
        // The new logon is refused from here on.
        stand.refuse(true);
        return {
          status: 403,
          headers: { 'x-csrf-token': 'Required' },
          text: 'CSRF token validation failed',
        };
      },
    );
    const before = sent('POST', ACTIVATION).length;
    const answered = await activate();
    expect(answered.isError).toBe(true);
    // The session ended and the new logon failed, in the server's words;
    // no second run began, so the answer carries no session_renewed.
    expect(textOf(answered)).toContain(SESSION_RENEWAL_FAILED_WORDS);
    expect(textOf(answered)).not.toContain('CSRF token validation failed');
    expect(sent('POST', ACTIVATION).length - before).toBe(1);
    expect(renewedOf(answered)).toBeUndefined();
  });
});

describe('the review of #364', () => {
  it('an access check that read SAP before the refusal makes the call run no second time', async () => {
    await server.close();
    server = await inProcessServer(
      'onprem',
      {
        settings: {
          url: stand.url,
          client: '100',
          authType: 'basic',
          username: 'PIN_USER',
        },
        credential: new BasicAuthProvider('PIN_USER', 'pin-password'),
      },
      undefined,
      {
        accessChecks: {
          check: async (_call, sap) => {
            await sap.superPackageOf('ZPKG');
            return ALLOWED;
          },
        },
      },
      (message) => {
        logged.push(message);
      },
    );
    const update = () =>
      server.call('UpdateInterface', {
        interface_name: 'ZIF_A',
        source_code: 'INTERFACE zif_a PUBLIC. ENDINTERFACE.',
        activate: false,
        transport_request: 'PFXK900001',
      });
    await update();
    // SAP ends the session once the access check's read is answered: the
    // call's LOCK then meets the new session.
    let ended = false;
    stand.respond(
      (request) => !ended && request.url.startsWith('/sap/bc/adt/packages/'),
      (request) => {
        ended = true;
        stand.endSession(request.session);
        return { status: 200, text: '' };
      },
    );
    const before = sent('POST', `${INTERFACE}?_action=LOCK`).length;
    await update();
    expect(sent('POST', `${INTERFACE}?_action=LOCK`).length - before).toBe(1);
    expect(logged).not.toContain(REPEATED_CALL_WORDS);
  });

  it("the access check's first read refused in a new session: the whole call runs once more, its check again", async () => {
    await server.close();
    server = await inProcessServer(
      'onprem',
      {
        settings: {
          url: stand.url,
          client: '100',
          authType: 'basic',
          username: 'PIN_USER',
        },
        credential: new BasicAuthProvider('PIN_USER', 'pin-password'),
      },
      undefined,
      {
        // As the shipped package-tree check: a read that fails is
        // `package_tree_unreadable`, and the call refused.
        accessChecks: {
          check: async (_call, sap) => {
            try {
              await sap.superPackageOf('ZPKG');
            } catch {
              return {
                allowed: false,
                code: 'package_tree_unreadable',
                argument: 'transport_request',
                value: 'PFXK900001',
              };
            }
            return ALLOWED;
          },
        },
      },
      (message) => {
        logged.push(message);
      },
    );
    const update = () =>
      server.call('UpdateInterface', {
        interface_name: 'ZIF_A',
        source_code: 'INTERFACE zif_a PUBLIC. ENDINTERFACE.',
        activate: false,
        transport_request: 'PFXK900001',
      });
    await update();
    endWithTokenRefusal(currentSession(), (r) =>
      r.url.startsWith('/sap/bc/adt/packages/'),
    );
    const reads = sent('GET', '/sap/bc/adt/packages/').length;
    const answered = await update();
    expect(answered.isError).not.toBe(true);
    expect(sent('GET', '/sap/bc/adt/packages/').length - reads).toBe(2);
    expect(renewedOf(answered)).toBe(SESSION_RENEWED_WORDS);
    expect(logged).toContain(REPEATED_CALL_WORDS);
  });

  it("the system lookup, the call's first request, refused in a new session: the call runs once more", async () => {
    // No system information: the call asks for it before each tool.
    stand.systemInformation(null);
    await activate();
    endWithTokenRefusal(currentSession(), (r) =>
      r.url.startsWith('/sap/bc/adt/core/http/systeminformation'),
    );
    const before = sent('POST', ACTIVATION).length;
    const answered = await activate();
    expect(answered.isError).not.toBe(true);
    expect(sent('POST', ACTIVATION).length - before).toBe(1);
    expect(renewedOf(answered)).toBe(SESSION_RENEWED_WORDS);
  });

  it('a repeat its access check denies starts no system lookup, and leaves nothing pending', async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', record);
    try {
      await server.close();
      let checks = 0;
      server = await inProcessServer(
        'onprem',
        {
          settings: {
            url: stand.url,
            client: '100',
            authType: 'basic',
            username: 'PIN_USER',
          },
          credential: new BasicAuthProvider('PIN_USER', 'pin-password'),
        },
        undefined,
        {
          // Allows the first two calls, denies the third (the repeat),
          // reading nothing of SAP.
          accessChecks: {
            check: async () => {
              checks += 1;
              return checks < 3
                ? ALLOWED
                : {
                    allowed: false,
                    code: 'request_not_allowed',
                    argument: 'transport_request',
                    value: 'PFXK900001',
                  };
            },
          },
        },
        (message) => {
          logged.push(message);
        },
      );
      // No system information: a call asks for it before its tool, and a
      // new connection at its birth.
      stand.systemInformation(null);
      const update = () =>
        server.call('UpdateInterface', {
          interface_name: 'ZIF_A',
          source_code: 'INTERFACE zif_a PUBLIC. ENDINTERFACE.',
          activate: false,
          transport_request: 'PFXK900001',
        });
      await update();
      // The call's first request, its lookup, meets SAP's token refusal in
      // a new session.
      endWithTokenRefusal(currentSession(), (r) =>
        r.url.startsWith('/sap/bc/adt/core/http/systeminformation'),
      );
      const lookups = () =>
        sent('GET', '/sap/bc/adt/core/http/systeminformation').length;
      const before = lookups();
      const answered = await update();
      expect(answered.isError).toBe(true);
      expect(logged).toContain(REPEATED_CALL_WORDS);
      expect(renewedOf(answered)).toBeUndefined();
      // Anything the denied repeat left running would send after its
      // answer: a window for it, then the count.
      await new Promise((resolve) => setTimeout(resolve, 200));
      // The refused lookup, and the new connection's birth; the denied
      // repeat asks no more.
      expect(lookups() - before).toBe(2);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });

  it('a host connection (injected) is never repeated: the server cannot replace it', async () => {
    await server.close();
    const injected = createAbapConnection(
      {
        url: stand.url,
        client: '100',
        authType: 'basic',
        username: 'PIN_USER',
      },
      new BasicAuthProvider('PIN_USER', 'pin-password'),
      undefined,
      undefined,
      undefined,
      'onprem',
    );
    await injected.connect();
    server = await inProcessServer(
      'onprem',
      { injected },
      undefined,
      {},
      (message) => {
        logged.push(message);
      },
    );
    await activate();
    endWithTokenRefusal(currentSession(), (r) => r.url.startsWith(ACTIVATION));
    const before = sent('POST', ACTIVATION).length;
    const answered = await activate();
    expect(answered.isError).toBe(true);
    expect(sent('POST', ACTIVATION).length - before).toBe(1);
    expect(renewedOf(answered)).toBeUndefined();
    expect(logged).not.toContain(REPEATED_CALL_WORDS);
  });
});

describe('which tools may run once more', () => {
  it.each([
    'HandlerBatch',
    'DebugBatchBegin',
    'DebugBatchAnswers',
    'HandlerDebugBatch',
    'SessionOpen',
    'HandlerSession',
    'DebugStep',
    'AmdpDebugStart',
    'HandlerDebugSession',
    'MemorySnapshotList',
  ])('%s: never', (tool) => {
    expect(repeatsOnTokenRefusal(tool)).toBe(false);
  });

  it.each(['ActivateClass', 'UpdateInterface', 'HandlerGet', 'SearchObject'])(
    '%s: yes',
    (tool) => {
      expect(repeatsOnTokenRefusal(tool)).toBe(true);
    },
  );
});
