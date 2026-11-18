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
 * Each must answer success on its one call, and the server must have
 * logged that it ran the call once more (`REPEATED_CALL_WORDS`). The LOCK
 * case: the connection may throw `ADT_SESSION_REPLACED` for a stateful
 * request instead of the 403 (Code, unmeasured, root-cause note) — then it
 * fails here, naming the answer.
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

/**
 * The server's SAP session, logged off by a separate HTTP client: SAP ends
 * it as its idle timeout would. The cookies are sent, never printed.
 */
async function logOffFromOutside(server: PinServer): Promise<void> {
  const { url, cookies } = await sessionOf(await server.held());
  const base = url.endsWith('/') ? url.slice(0, -1) : url;
  const answered = await fetch(`${base}/sap/public/bc/icf/logoff`, {
    headers: { Cookie: cookies },
  });
  await answered.arrayBuffer();
  assert.ok(
    answered.status < 400,
    `the outside logoff answered ${answered.status}`,
  );
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
      await deleteRecorded();
      await expectAbsent({ tool: 'GetClass', args: { class_name: CLASS } });
      await server?.close();
    });

    it('ActivateClass and UpdateClass each answer on their one call after an outside logoff, each run once more', async () => {
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

      // A POST on the ended session: the activation.
      await logOffFromOutside(server);
      logged.length = 0;
      const activated = await server.call('ActivateClass', {
        class_name: CLASS,
      });
      console.log(`[csrfRepeat] ActivateClass: ${textOf(activated)}`);
      assert.notEqual(activated.isError, true, textOf(activated));
      assert.ok(
        logged.includes(REPEATED_CALL_WORDS),
        'ActivateClass was not run once more: the outside logoff did not end in the token refusal',
      );

      // A chain whose first request is the LOCK: the update.
      await logOffFromOutside(server);
      logged.length = 0;
      const updated = await server.call('UpdateClass', {
        class_name: CLASS,
        source_code: sourceOf(2),
        activate: true,
        ...onRequest(),
      });
      console.log(`[csrfRepeat] UpdateClass: ${textOf(updated)}`);
      assert.notEqual(updated.isError, true, textOf(updated));
      assert.ok(
        logged.includes(REPEATED_CALL_WORDS),
        'UpdateClass was not run once more',
      );
    });
  },
);
