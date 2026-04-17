/**
 * Quick script to read a specific dump by ID via handleRuntimeGetDumpById.
 */
import { handleRuntimeGetDumpById } from '../src/handlers/system/readonly/handleRuntimeGetDumpById';
import { loadTestEnv, getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAbapConnection } from '@mcp-abap-adt/connection';

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/get-dump.ts --id <dump_id> [--view default|summary|formatted]
  npx tsx scripts/get-dump.ts --datetime "YYYY-MM-DD HH:MM:SS" --user <USER> [--view ...]

Read a specific ABAP runtime dump.

Options:
  --id <dump_id>           Dump ID (required, unless --datetime + --user)
  --datetime <timestamp>   Dump timestamp, e.g. "2026-03-31 18:53:47"
  --user <name>            SAP user name
  --view <type>            Output view: default | summary | formatted (default: "default")
  --help                   Show this help message

Examples:
  npx tsx scripts/get-dump.ts --id 12345
  npx tsx scripts/get-dump.ts --id 12345 --view formatted
  npx tsx scripts/get-dump.ts --datetime "2026-03-31 18:53:47" --user DEVELOPER`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const get = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const dumpId = get('--id');
  const datetime = get('--datetime');
  const user = get('--user');
  const view = (get('--view') as 'default' | 'summary' | 'formatted') || 'default';

  if (!dumpId && !(datetime && user)) {
    console.error('Error: --id or (--datetime + --user) is required.\n');
    printHelp();
    process.exit(1);
  }

  await loadTestEnv();
  const connection = createAbapConnection(getSapConfigFromEnv());
  const context = { connection };

  if (dumpId) {
    console.log(`\nReading dump id="${dumpId}", view="${view}"...\n`);
  } else {
    console.log(`\nLooking up dump for user="${user}", datetime="${datetime}", view="${view}"...\n`);
  }

  const result = await handleRuntimeGetDumpById(context, { dump_id: dumpId, datetime, user, view });

  if (result.isError) {
    console.error('ERROR:', result.content[0]?.text);
    process.exit(1);
  }

  const text = result.content.find((c: any) => c.type === 'text')?.text;
  const data = JSON.parse(text!);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
