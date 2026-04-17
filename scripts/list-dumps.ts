/**
 * Quick script to list dumps for a specific user via handleRuntimeListDumps.
 */
import { handleRuntimeListDumps } from '../src/handlers/system/readonly/handleRuntimeListDumps';
import { loadTestEnv, getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAbapConnection } from '@mcp-abap-adt/connection';

function printHelp() {
  console.log(`Usage: npx tsx scripts/list-dumps.ts --user <USER> [--top <N>]

List ABAP runtime dumps for a specific user.

Options:
  --user <name>    SAP user name (required)
  --top <N>        Max number of dumps to return (default: 20)
  --help           Show this help message

Examples:
  npx tsx scripts/list-dumps.ts --user DEVELOPER
  npx tsx scripts/list-dumps.ts --user DEVELOPER --top 50`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const get = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const user = get('--user');
  const top = Number(get('--top')) || 20;

  if (!user) {
    console.error('Error: --user is required.\n');
    printHelp();
    process.exit(1);
  }

  await loadTestEnv();
  const connection = createAbapConnection(getSapConfigFromEnv());
  const context = { connection };

  console.log(`\nListing dumps for user="${user}", top=${top}...\n`);

  const result = await handleRuntimeListDumps(context, {
    user,
    top,
    inlinecount: 'allpages',
  });

  if (result.isError) {
    console.error('ERROR:', result.content[0]?.text);
    process.exit(1);
  }

  const text = result.content.find((c: any) => c.type === 'text')?.text;
  const data = JSON.parse(text!);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
