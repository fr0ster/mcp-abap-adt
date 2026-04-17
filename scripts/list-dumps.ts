/**
 * Quick script to list dumps for a specific user via handleRuntimeListDumps.
 * Usage: npx tsx scripts/list-dumps.ts [USER]
 */
import { handleRuntimeListDumps } from '../src/handlers/system/readonly/handleRuntimeListDumps';
import { loadTestEnv, getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAbapConnection } from '@mcp-abap-adt/connection';

async function main() {
  const user = process.argv[2] || 'RSEMENOV';
  const top = Number(process.argv[3]) || 20;

  await loadTestEnv();
  const config = getSapConfigFromEnv();
  const connection = createAbapConnection(config);

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
