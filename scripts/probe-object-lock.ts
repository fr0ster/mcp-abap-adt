/**
 * Is an object locked, and by whom — asked through the library, not a URL.
 *
 * **No endpoint is spelled out here.** `checkDeletion` is a member on every
 * object accessor in `@mcp-abap-adt/adt-clients`, and it answers exactly what
 * this question needs: whether the object can be deleted, and the holder of the
 * lock when one is in the way. An earlier version of this script built
 * `/sap/bc/adt/deletion/check`, `?_action=UNLOCK` and
 * `/sap/bc/adt/ddic/ddlock/locks` by hand; endpoints belong to adt-clients, and
 * this repository has no business addressing them.
 *
 *   npx tsx scripts/probe-object-lock.ts --env trial.env \
 *     --type bdef --name ZMCP_BLD_I_BDFL
 *
 * `--type` is one of `bdef`, `ddl`, `class`, `domain`, `table`, `structure`,
 * `dataElement`, `interface`, `program`.
 *
 * **What was measured while this was written, so nobody re-measures it.** A lock
 * left behind by a run that died before its unlock cannot be released from
 * outside the session that took it. On BTP ABAP, 2026-09-24, for a behavior
 * definition in that state:
 *
 * | asked | answered |
 * |---|---|
 * | `checkDeletion` | `isDeletable="false"` with `<del:lockUser>` naming the holder |
 * | the object's own `?_action=UNLOCK` without a handle | `200`, empty body, lock still held |
 * | a stateful `?_action=LOCK&accessMode=MODIFY`, with and without `force=true` | `403` `ExceptionResourceNoAccess`, EU510 |
 * | `ddic/ddlock/locks?lockAction=DELETE` | `404` — that resource does not exist on the system |
 *
 * There is no SM12 on ABAP Cloud and no class can stand in for one: an enqueue
 * belongs to its session, `DEQUEUE_ALL` releases only the current one, and the
 * classic enqueue function modules are not released for ABAP for Cloud.
 *
 * And a warning about reading a quiet answer as good news: **once the object is
 * gone, `checkDeletion` reports no lock at all** — it answered `200` with no
 * `lockUser` and *"Object does not exist"* while the enqueue on the NAME was
 * still held, and a create was still refused with `403` EU510. For a name that
 * is locked but unoccupied, the create refusal is the only tell.
 */
import * as os from 'node:os';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAdtClient } from '../src/lib/clients';
import { createAbapConnection } from '../src/lib/connectionFactory';

type Family =
  | 'bdef'
  | 'ddl'
  | 'class'
  | 'domain'
  | 'table'
  | 'structure'
  | 'dataElement'
  | 'interface'
  | 'program';

/** The accessor and the config key each family's `checkDeletion` expects. */
const FAMILIES: Record<Family, { accessor: string; key: string }> = {
  bdef: { accessor: 'getBehaviorDefinition', key: 'name' },
  ddl: { accessor: 'getDdl', key: 'ddlName' },
  class: { accessor: 'getClass', key: 'className' },
  domain: { accessor: 'getDomain', key: 'domainName' },
  table: { accessor: 'getTable', key: 'tableName' },
  structure: { accessor: 'getStructure', key: 'structureName' },
  dataElement: { accessor: 'getDataElement', key: 'dataElementName' },
  interface: { accessor: 'getInterface', key: 'interfaceName' },
  program: { accessor: 'getProgram', key: 'programName' },
};

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (value === undefined && fallback === undefined) {
    throw new Error(`--${name} is required`);
  }
  return value ?? (fallback as string);
}

async function main(): Promise<void> {
  const envName = arg('env');
  const family = arg('type') as Family;
  const name = arg('name');
  const shape = FAMILIES[family];
  if (!shape) {
    throw new Error(
      `--type ${family} is not one of ${Object.keys(FAMILIES).join(', ')}`,
    );
  }

  const envFile = envName.includes('/')
    ? envName
    : path.join(os.homedir(), '.config', 'mcp-abap-adt', 'sessions', envName);
  dotenv.config({ path: envFile, override: true });

  // The library connects for nobody: `createAdtClient` refuses a connection
  // that has not been connected, and says so.
  const connection = createAbapConnection(getSapConfigFromEnv()) as {
    connect?: () => Promise<void>;
  };
  if (typeof connection.connect === 'function') await connection.connect();
  const client = createAdtClient(connection as never) as unknown as Record<
    string,
    () => { checkDeletion: (config: unknown) => Promise<unknown> }
  >;
  console.log(`env ${envFile}\nasking ${family} ${name} through checkDeletion`);

  const answer = (await client[shape.accessor]().checkDeletion({
    [shape.key]: name,
  })) as {
    ok: boolean;
    getResult?: () => { value: unknown };
    getError?: () => unknown;
  };

  if (!answer.ok) {
    console.log(
      `\nrefused: ${JSON.stringify(answer.getError?.(), null, 1).substring(0, 1200)}`,
    );
    return;
  }
  const value = answer.getResult?.().value;
  console.log(`\n${JSON.stringify(value, null, 1).substring(0, 1500)}`);
}

main().catch((error: unknown) => {
  console.error((error as Error)?.message ?? error);
  process.exit(1);
});
