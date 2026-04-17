/**
 * Quick script to list profiler trace files.
 */
import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { loadTestEnv, getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAbapConnection } from '@mcp-abap-adt/connection';

function printHelp() {
  console.log(`Usage: npx tsx scripts/list-traces.ts [--limit <N>]

List profiler trace files from the SAP system.

Options:
  --limit <N>   Max characters to print from response (default: 5000)
  --help        Show this help message

Examples:
  npx tsx scripts/list-traces.ts
  npx tsx scripts/list-traces.ts --limit 10000`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const get = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const limit = Number(get('--limit')) || 5000;

  await loadTestEnv();
  const connection = createAbapConnection(getSapConfigFromEnv());
  const client = new AdtRuntimeClient(connection);
  const r = await client.listProfilerTraceFiles();
  const raw = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  console.log(raw.slice(0, limit));
}

main().catch((e) => { console.error(e); process.exit(1); });
