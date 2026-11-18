/**
 * The one repeat of a call SAP refused before anything of it ran (24.0.1),
 * live. A server of the suite's own, its connection built from the test
 * destination's settings and credential, so it can replace a connection
 * SAP spent. The suite creates one class of its own (its name read free
 * first, recorded for cleanup before its create), then twice:
 *
 * 1. the server's connection is logged on (`held`), and its SAP session
 *    is logged off by a SEPARATE HTTP client — `GET
 *    /sap/public/bc/icf/logoff` with the session's cookies, as the
 *    root-cause probe ended it (2026-11-18; the stand-in for SAP's idle
 *    timeout);
 * 2. a tool is called once: a POST read-like call (`ActivateClass`, one
 *    `POST /sap/bc/adt/activation`), then a write chain whose first request
 *    is a LOCK on the class (`UpdateClass`).
 *
 * Each must answer success on its one call. On premise the server must
 * have run each once more (`REPEATED_CALL_WORDS`: the activation met the
 * token refusal, the LOCK the connection's `ADT_SESSION_REPLACED`), and its
 * answer says so (`session_renewed`); on the cloud the outside logoff led
 * to no refusal in the first live run, so a repeat is recorded, not
 * required. After the update, a write from the suite's own session proves
 * no lock was left on the class.
 *
 * Objects are created only where the package guard allows: on premise
 * `$TMP` or the development package, on the cloud the build package. The
 * cleanup deletes only the class this run created, read absent.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { REPEATED_CALL_WORDS } from '../../../embeddable/BaseMcpServer';
import { credentialFromSapConfig } from '../../../lib/credentialSources';
import { SESSION_RENEWED_WORDS } from '../../../lib/sessionRenewed';
import { inProcessServer, type PinServer } from '../../helpers/pinServer';
import {
  configuredSystemKind,
  getSapConfigFromEnv,
  loadTestEnv,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import { CREATION_PACKAGES } from '../helpers/packageGuard';

const SUFFIX = randomBytes(3).toString('hex').toUpperCase();
const CLASS = `ZMCP_CSRF_${SUFFIX}`;

/** A class with one method returning `value`. */
function sourceOf(value: number): string {
  const lower = CLASS.toLowerCase();
  return [
    `CLASS ${lower} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
    '  PUBLIC SECTION.',
    '    METHODS m RETURNING VALUE(r) TYPE i.',
    'ENDCLASS.',
    `CLASS ${lower} IMPLEMENTATION.`,
    '  METHOD m.',
    `    r = ${value}.`,
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');
}

/** What a call through the suite's server answers. */
type LiveAnswerLike = Awaited<ReturnType<PinServer['call']>>;

/** The `session_renewed` field of an answer's JSON, if it has one. */
function renewedOf(answer: LiveAnswerLike): unknown {
  const [first] = answer.content ?? [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(first?.text ?? 'null');
  } catch {
    return undefined; // a text answer: no field
  }
  return typeof parsed === 'object' &&
    parsed !== null &&
    'session_renewed' in parsed
    ? parsed.session_renewed
    : undefined;
}

/** The text of an answer. */
function textOf(answer: { content?: Array<{ text?: string }> }): string {
  return (answer.content ?? []).map((part) => part.text ?? '').join('\n');
}

/** A connection's base URL and session cookies, as the connection holds them. */
async function sessionOf(
  connection: IAbapConnection,
): Promise<{ url: string; cookies: string }> {
  const url = await connection.getBaseUrl();
  if (
    !('sessionCookies' in connection) ||
    typeof connection.sessionCookies !== 'function'
  ) {
    throw new Error('the connection hands out no session cookies');
  }
  const cookies: unknown = connection.sessionCookies();
  if (typeof url !== 'string' || typeof cookies !== 'string') {
    throw new Error('the connection holds no session to log off');
  }
  return { url, cookies };
}

/** The server's current session cookies, as its connection holds them. */
async function cookiesOf(server: PinServer): Promise<string> {
  return (await sessionOf(await server.held())).cookies;
}

/**
 * The server's SAP session, logged off by a separate HTTP client: SAP ends
 * it as its idle timeout would. The logoff's OWN answer counts — no
 * redirect is followed — and is returned; the cookies are sent, never
 * printed. On premise the logoff itself must succeed (2xx).
 */
async function logOffFromOutside(server: PinServer): Promise<number> {
  const { url, cookies } = await sessionOf(await server.held());
  const base = url.endsWith('/') ? url.slice(0, -1) : url;
  const answered = await fetch(`${base}/sap/public/bc/icf/logoff`, {
    headers: { Cookie: cookies },
    redirect: 'manual',
  });
  await answered.arrayBuffer();
  console.log(`[csrfRepeat] the outside logoff answered ${answered.status}`);
  if (configuredSystemKind() === 'onprem') {
    assert.ok(
      answered.status >= 200 && answered.status < 300,
      `the outside logoff answered ${answered.status}`,
    );
  }
  return answered.status;
}

liveSuite(
  ['onprem', 'cloud'],
  'A call SAP refused for its session token after its session ended runs once more',
  () => {
    const logged: string[] = [];
    let server: PinServer;

    const packageName = (): string => {
      const kind = configuredSystemKind() === 'onprem' ? 'onprem' : 'cloud';
      const configured = resolvePackageName();
      if (!CREATION_PACKAGES[kind].includes(configured)) {
        throw new Error(
          `the configured package is none of ${CREATION_PACKAGES[kind].join(', ')}: nothing is created`,
        );
      }
      return configured;
    };
    const onRequest = () => {
      const request =
        packageName() === '$TMP' ? undefined : resolveTransportRequest();
      return request === undefined || request === ''
        ? {}
        : { transport_request: request };
    };

    before(async () => {
      await loadTestEnv();
      const settings = getSapConfigFromEnv();
      server = await inProcessServer(
        configuredSystemKind() === 'onprem' ? 'onprem' : 'cloud',
        { settings, credential: credentialFromSapConfig(settings) },
        undefined,
        {},
        (message) => {
          logged.push(message);
        },
      );
    });

    after(async () => {
      // The server logs off whatever the cleanup met.
      try {
        await deleteRecorded();
        await expectAbsent({ tool: 'GetClass', args: { class_name: CLASS } });
      } finally {
        await server?.close();
      }
    });

    it('ActivateClass and UpdateClass each answer on their one call after an outside logoff (on premise run once more, saying so), and no lock is left', async () => {
      await expectNameFree({ tool: 'GetClass', args: { class_name: CLASS } });
      recordCreated('DeleteClass', { class_name: CLASS, ...onRequest() });
      const created = await server.call('CreateClass', {
        class_name: CLASS,
        package_name: packageName(),
        description: 'MCP CSRF repeat',
        ...onRequest(),
      });
      assert.notEqual(created.isError, true, textOf(created));
      const written = await server.call('UpdateClass', {
        class_name: CLASS,
        source_code: sourceOf(1),
        activate: false,
        ...onRequest(),
      });
      assert.notEqual(written.isError, true, textOf(written));

      // On premise the outside logoff ends in SAP's answer in a new
      // session, and both calls run once more (measured 2026-11-18); on the
      // cloud (JWT) it led to no refusal (Inference: the token logs on
      // again), so the calls must succeed, with or without a repeat, and
      // which is recorded.
      const repeatRequired = configuredSystemKind() === 'onprem';
      // A case exercised recovery when the logoff itself answered 2xx and
      // the session was then replaced: the call ran once more, or the
      // server's connection holds another session's cookies.
      let exercised = false;
      const afterLogoff = async (
        tool: string,
        call: () => Promise<LiveAnswerLike>,
      ) => {
        const cookiesBefore = await cookiesOf(server);
        const status = await logOffFromOutside(server);
        logged.length = 0;
        const answer = await call();
        console.log(`[csrfRepeat] ${tool}: ${textOf(answer)}`);
        assert.notEqual(answer.isError, true, textOf(answer));
        const repeated = logged.includes(REPEATED_CALL_WORDS);
        const replaced =
          repeated || (await cookiesOf(server)) !== cookiesBefore;
        console.log(
          `[csrfRepeat] ${tool}: logoff ${status}, run once more: ${repeated}, session replaced: ${replaced}`,
        );
        // On premise: the logoff itself 2xx and the session then replaced.
        // On the cloud a logoff's status says little (a 200 that ended no
        // visible session, a 400 after which the LOCK met a replaced one,
        // live run 2026-11-18): a tool that met a replaced session and ran
        // once more is recovery exercised, whatever the statuses.
        if (
          repeatRequired
            ? status >= 200 && status < 300 && replaced
            : replaced && repeated
        ) {
          exercised = true;
        }
        if (repeatRequired) {
          assert.ok(repeated, `${tool} was not run once more`);
        }
        // A repeated call says so; one that was not says nothing.
        assert.equal(
          renewedOf(answer),
          repeated ? SESSION_RENEWED_WORDS : undefined,
          textOf(answer),
        );
      };

      // A POST on the ended session: the activation.
      await afterLogoff('ActivateClass', () =>
        server.call('ActivateClass', { class_name: CLASS }),
      );

      // A chain whose first request is the LOCK: the update.
      await afterLogoff('UpdateClass', () =>
        server.call('UpdateClass', {
          class_name: CLASS,
          source_code: sourceOf(2),
          activate: true,
          ...onRequest(),
        }),
      );

      // No logoff itself succeeded with the session then replaced: the run
      // exercised no recovery, which is a failure, not a pass.
      assert.ok(
        exercised,
        repeatRequired
          ? 'no recovery exercised: no outside logoff answered 2xx with the session replaced after it'
          : 'no recovery exercised: no tool met a replaced session and ran once more',
      );

      // No lock is left on the class: a write from another session — the
      // suite's own connection — takes the lock and releases it.
      const written2 = await livePrepare('UpdateClass', {
        class_name: CLASS,
        source_code: sourceOf(3),
        activate: false,
        ...onRequest(),
      });
      assert.notEqual(
        written2.isError,
        true,
        `a lock is left on ${CLASS}: ${written2.text}`,
      );
    });
  },
);
