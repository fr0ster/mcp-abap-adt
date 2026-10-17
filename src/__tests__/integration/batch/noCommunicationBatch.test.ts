/**
 * The communication batch on the configured system (spec §11): whether the
 * destination is served is learned only from the outer status of its first
 * envelope — `2xx` served for good, `404` not served, and from then on its
 * multi-request reads run sequentially.
 *
 * Where it runs: the SAP system the test config names (tests/test-config.yaml,
 * its session file); without a configuration, connection or session it skips,
 * saying why. It only reads: one `GetObjectInfo` of the config's
 * `environment.default_package` (`DEVC/K`, one tier, no enrichment), sent
 * through the real handler and the real `AdtBatchConnection`.
 *
 * What it asserts is what the system answered:
 * - the first envelope request (`/sap/bc/adt/communication/batch`) and its
 *   outer status, reported to the destination's port — `2xx` or `404`, any
 *   other status fails the test;
 * - `2xx`: the destination stays served and a second call batches again;
 *   `404`: the destination is marked not served, and a second call sends no
 *   envelope;
 * - the call's answer equals the sequential one (the same read on a port
 *   already marked not served, which sends no envelope).
 *
 * The other branch — the one this system does not answer — is shown by the
 * unit tests (`src/__tests__/unit/batch/availability.test.ts`).
 *
 * Run: npm test -- --testPathPatterns='noCommunicationBatch' --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { handleGetObjectInfo } from '../../../handlers/system/readonly/handleGetObjectInfo';
import {
  type BatchAvailability,
  createBatchAvailability,
} from '../../../lib/batch/availability';
import { getTimeout, resolvePackageName } from '../helpers/configHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../helpers/sessionHelpers';

const testLogger = createTestLogger('no-communication-batch');

const ENVELOPE_URL = '/sap/bc/adt/communication/batch';

/**
 * `connection` with every request's URL recorded. Writes the handler's
 * client makes to the view (its accept negotiation) stay on the view, never
 * on the connection under it.
 */
function recording(connection: IAbapConnection): {
  view: IAbapConnection;
  urls: string[];
} {
  const urls: string[] = [];
  const own = new Map<PropertyKey, unknown>();
  const record = (request: { url: string }) => {
    urls.push(request.url);
    return connection.makeAdtRequest(request as never);
  };
  const view = new Proxy(connection as object, {
    get(target, property) {
      if (own.has(property)) return own.get(property);
      if (property === 'makeAdtRequest') return record;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(_target, property, value) {
      own.set(property, value);
      return true;
    },
  }) as IAbapConnection;
  return { view, urls };
}

/** A destination's port with every outer status it was told kept. */
function watchedPort(): { port: BatchAvailability; noted: number[] } {
  const real = createBatchAvailability();
  const noted: number[] = [];
  return {
    noted,
    port: {
      available: () => real.available(),
      noteOuterStatus: (status) => {
        noted.push(status);
        real.noteOuterStatus(status);
      },
    },
  };
}

/** A port whose destination is already known not to be served. */
function notServed(): BatchAvailability {
  const port = createBatchAvailability();
  port.noteOuterStatus(404);
  return port;
}

const envelopes = (urls: string[]) =>
  urls.filter((url) => url.startsWith(ENVELOPE_URL)).length;

describe('the communication batch on the system the test config names', () => {
  let connection: IAbapConnection | null = null;

  beforeAll(async () => {
    try {
      connection = (await createTestConnectionAndSession()).connection;
    } catch (_error) {
      connection = null;
    }
  }, getTimeout('long'));

  it(
    "the first envelope's outer status decides; the read equals the sequential one",
    async () => {
      if (connection === null) {
        testLogger?.info(
          '⏭️  Skipping: runs only on the system the test config names (tests/test-config.yaml); no configuration, connection or session here',
        );
        return;
      }
      const packageName = resolvePackageName();
      const args = {
        parent_type: 'DEVC/K',
        parent_name: packageName,
        maxDepth: 1,
        enrich: false,
      };

      const batched = recording(connection);
      const { port, noted } = watchedPort();
      const context: HandlerContext = {
        connection: batched.view,
        batchAvailability: port,
      };
      const first = await handleGetObjectInfo(context, args);

      const firstEnvelopes = envelopes(batched.urls);
      expect(firstEnvelopes).toBeGreaterThan(0);
      expect(batched.urls[0]).toBe(ENVELOPE_URL);
      expect(noted.length).toBeGreaterThan(0);
      const outer = noted[0] as number;
      process.stderr.write(
        `communication batch: the first envelope's outer status is ${outer}\n`,
      );
      const served = outer >= 200 && outer < 300;
      expect(served || outer === 404).toBe(true);
      expect(port.available()).toBe(served);

      // A second call on the same destination: batched again when served,
      // sequential (no envelope) when not.
      const before = batched.urls.length;
      const second = await handleGetObjectInfo(context, args);
      expect(envelopes(batched.urls.slice(before))).toBe(
        served ? firstEnvelopes : 0,
      );
      expect(second).toEqual(first);

      // The sequential read: a port already marked not served.
      const sequential = recording(connection);
      const answer = await handleGetObjectInfo(
        { connection: sequential.view, batchAvailability: notServed() },
        args,
      );
      expect(envelopes(sequential.urls)).toBe(0);
      expect(sequential.urls.length).toBeGreaterThan(0);
      expect(answer.isError).toBe(false);
      expect(first).toEqual(answer);
    },
    getTimeout('long'),
  );
});
