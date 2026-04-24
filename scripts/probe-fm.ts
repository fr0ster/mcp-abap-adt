/**
 * Probe an FM via ADT search + direct GETs. Helps diagnose when a handler
 * claims "does not exist" but Eclipse shows the FM.
 */
import * as path from 'node:path';
import { createAbapConnection } from '@mcp-abap-adt/connection';
import * as dotenv from 'dotenv';
import { getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';

async function tryGet(conn: any, url: string) {
  try {
    const res = await conn.makeAdtRequest({ url, method: 'GET' });
    return {
      ok: true,
      status: res?.status ?? 200,
      len: (res?.data ?? '').length ?? 0,
      head: String(res?.data ?? '').slice(0, 500),
    };
  } catch (e: any) {
    return {
      ok: false,
      status: e?.response?.status,
      message: e?.message,
      body: String(e?.response?.data ?? '').slice(0, 500),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (f: string) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const fm = get('--fm') ?? 'XPG_COMMAND_EXECUTE';
  const group = get('--group') ?? 'SXPT';
  const envFile = path.resolve(
    get('--env') || path.join(__dirname, '..', 'trial.env'),
  );
  dotenv.config({ path: envFile, override: true });
  console.log(`env: ${envFile}`);

  const conn = createAbapConnection(getSapConfigFromEnv()) as any;

  const probes: { label: string; url: string }[] = [
    {
      label: 'search quickSearch',
      url: `/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=${encodeURIComponent(
        fm,
      )}&maxResults=5`,
    },
    {
      label: 'nodestructure by FM name',
      url: `/sap/bc/adt/repository/nodestructure?parent_name=${encodeURIComponent(
        fm,
      )}&parent_type=FUGR/FF`,
    },
    {
      label: 'metadata via group URL',
      url: `/sap/bc/adt/functions/groups/${group.toLowerCase()}/fmodules/${fm.toLowerCase()}`,
    },
    {
      label: 'source via group URL',
      url: `/sap/bc/adt/functions/groups/${group.toLowerCase()}/fmodules/${fm.toLowerCase()}/source/main`,
    },
    {
      label: 'metadata via FUGR/FF ref',
      url: `/sap/bc/adt/vit/wb/object_type/fugrff/object_name/${encodeURIComponent(
        fm,
      )}`,
    },
  ];

  for (const p of probes) {
    const r = await tryGet(conn, p.url);
    console.log(`\n--- ${p.label} ---`);
    console.log(`URL: ${p.url}`);
    console.log(JSON.stringify(r, null, 2));
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
