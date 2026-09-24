/**
 * What can actually release a lock a run left behind, measured rather than
 * assumed — there is no SM12 on ABAP Cloud, so the question is what ADT itself
 * will do.
 *
 * Reads nothing from a test: give it the env file, the object's ADT URI and its
 * name. It asks three things and prints what the server answered, in order:
 *
 *   1. `deletion/check` — is a lock held, and by whom (`del:lockUser`)
 *   2. `?_action=UNLOCK` with the handle you pass (or none) — what ADT says
 *   3. `ddic/ddlock/locks?lockAction=DELETE` — the DDIC lock manager
 *
 * Nothing here is destructive beyond releasing a lock, and each step reports
 * instead of throwing, so one refusal does not hide the next answer.
 *
 * **What it answered on BTP ABAP, 2026-09-24**, for a behavior definition left
 * locked by a test run that died before its unlock — so that the next person
 * does not have to re-measure it:
 *
 * | request | answer |
 * |---|---|
 * | `deletion/check` | `200`, `isDeletable="false"`, `<del:lockUser>` names the holder, *"You are already editing …"* |
 * | `?_action=UNLOCK` with no handle | `200`, empty body, **and the lock is still there** |
 * | `?_action=LOCK&accessMode=MODIFY`, stateful | `403` `ExceptionResourceNoAccess`, EU510 |
 * | the same with `&force=true` | `403`, unchanged — there is no takeover here |
 * | `ddic/ddlock/locks?lockAction=DELETE` | `404`, *"Resource /sap/bc/adt/ddic/ddlock/locks does not exist"* |
 *
 * There is no SM12 on ABAP Cloud, and a class of one's own does not help: an
 * enqueue belongs to the session that took it, `DEQUEUE_ALL` releases only the
 * current session's, and the classic enqueue function modules are not released
 * for ABAP for Cloud. A lock orphaned this way outlives every route we have.
 *
 * **`deletion/check` gives a false negative once the object is gone.** Measured
 * the same day: after the behavior definition had been deleted, the check
 * answered `200` with no `<del:lockUser>` at all and the message *"Object does
 * not exist"* — while the enqueue entry on the NAME was still held, and a
 * `POST /sap/bc/adt/bo/behaviordefinitions` to create it again answered `403`
 * EU510, *"User … is currently editing …"*, in any package. So a quiet check is
 * evidence about a lock only while the object exists; for a name that is locked
 * but unoccupied, the create refusal is the only tell we have.
 *
 *   npx tsx scripts/probe-object-lock.ts \
 *     --env trial.env \
 *     --uri /sap/bc/adt/bo/behaviordefinitions/zmcp_shr_i_bdfl \
 *     --name ZMCP_SHR_I_BDFL [--handle <lockHandle>]
 */
import * as os from 'node:os';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAbapConnection } from '../src/lib/connectionFactory';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (value === undefined && fallback === undefined) {
    throw new Error(`--${name} is required`);
  }
  return value ?? (fallback as string);
}

async function report(
  label: string,
  run: () => Promise<{ status?: number; data?: unknown }>,
): Promise<void> {
  try {
    const answer = await run();
    const body =
      typeof answer?.data === 'string'
        ? answer.data
        : JSON.stringify(answer?.data);
    console.log(
      `\n── ${label}\n   status ${answer?.status}\n   ${String(body).substring(0, 900)}`,
    );
  } catch (error: any) {
    const status = error?.response?.status;
    const body = error?.response?.data;
    console.log(
      `\n── ${label}\n   REFUSED status ${status ?? '(none)'}\n   ${String(
        typeof body === 'string' ? body : (error?.message ?? error),
      ).substring(0, 900)}`,
    );
  }
}

async function main(): Promise<void> {
  const envName = arg('env');
  const uri = arg('uri');
  const name = arg('name');
  const handle = arg('handle', '');

  const envFile = envName.includes('/')
    ? envName
    : path.join(os.homedir(), '.config', 'mcp-abap-adt', 'sessions', envName);
  dotenv.config({ path: envFile, override: true });

  const connection = createAbapConnection(getSapConfigFromEnv()) as any;
  if (typeof connection.connect === 'function') await connection.connect();
  console.log(`env ${envFile}\nobject ${name} at ${uri}`);

  await report('deletion/check — is it locked, and by whom', () =>
    connection.makeAdtRequest({
      url: '/sap/bc/adt/deletion/check',
      method: 'POST',
      timeout: 30000,
      data:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">' +
        `<del:object adtcore:uri="${uri}"/></del:checkRequest>`,
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
      },
    }),
  );

  await report(
    `?_action=UNLOCK${handle ? ' with the handle given' : ' with no handle'}`,
    () =>
      connection.makeAdtRequest({
        url: `${uri}?_action=UNLOCK${handle ? `&lockHandle=${encodeURIComponent(handle)}` : ''}`,
        method: 'POST',
        timeout: 30000,
        data: '',
        headers: {},
      }),
  );

  // A workbench lock belongs to an ADT session, and ADT takes one over when the
  // holder is the same user — that is the dialog Eclipse shows. Both spellings
  // are tried, statefully, because the stateless call is what answers 403.
  await report('?_action=LOCK&accessMode=MODIFY — stateful, plain', () =>
    connection.makeAdtRequest({
      url: `${uri}?_action=LOCK&accessMode=MODIFY`,
      method: 'POST',
      timeout: 30000,
      data: '',
      headers: {
        'x-sap-adt-sessiontype': 'stateful',
        Accept:
          'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.Result',
      },
    }),
  );

  await report(
    '?_action=LOCK&accessMode=MODIFY&force=true — stateful takeover',
    () =>
      connection.makeAdtRequest({
        url: `${uri}?_action=LOCK&accessMode=MODIFY&force=true`,
        method: 'POST',
        timeout: 30000,
        data: '',
        headers: {
          'x-sap-adt-sessiontype': 'stateful',
          Accept:
            'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.Result',
        },
      }),
  );

  await report(
    'ddic/ddlock/locks?lockAction=DELETE — the DDIC lock manager',
    () =>
      connection.makeAdtRequest({
        url: `/sap/bc/adt/ddic/ddlock/locks?lockAction=DELETE&name=${encodeURIComponent(name)}`,
        method: 'POST',
        timeout: 30000,
        data: '',
        headers: {},
      }),
  );

  await report('deletion/check again — did anything change', () =>
    connection.makeAdtRequest({
      url: '/sap/bc/adt/deletion/check',
      method: 'POST',
      timeout: 30000,
      data:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">' +
        `<del:object adtcore:uri="${uri}"/></del:checkRequest>`,
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
      },
    }),
  );
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
