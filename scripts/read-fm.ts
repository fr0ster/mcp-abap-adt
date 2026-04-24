/**
 * Read a function module via handleReadFunctionModule and dump the raw
 * response (source + metadata XML). Useful for debugging cases where the
 * ADT backend is permissive about the function group in the URL.
 */
import * as path from 'node:path';
import { createAbapConnection } from '@mcp-abap-adt/connection';
import * as dotenv from 'dotenv';
import { getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { handleReadFunctionModule } from '../src/handlers/function_module/readonly/handleReadFunctionModule';

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/read-fm.ts --fm <NAME> --group <GROUP> [--version active|inactive] [--env <path>]

By default loads ./.env (same as 'npm run dev'). Override with --env <path>.

Examples:
  npx tsx scripts/read-fm.ts --fm XPG_COMMAND_EXECUTE --group SXPT
  npx tsx scripts/read-fm.ts --fm XPG_COMMAND_EXECUTE --group SXPG  # wrong on purpose
  npx tsx scripts/read-fm.ts --fm FOO --group BAR --env ./trial.env`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const fm = get('--fm');
  const group = get('--group');
  const version = (get('--version') as 'active' | 'inactive') || 'active';

  if (!fm || !group) {
    console.error('Error: --fm and --group are required.\n');
    printHelp();
    process.exit(1);
  }

  const envArg = get('--env');
  const envPath = path.resolve(envArg || path.join(__dirname, '..', '.env'));
  console.log(`Loading env from: ${envPath}`);
  dotenv.config({ path: envPath, override: true });

  const config = getSapConfigFromEnv();
  console.log(
    `Connection: url=${config.url ? 'set' : 'missing'}, jwt=${(config as any).jwtToken ? 'set' : 'missing'}`,
  );
  const connection = createAbapConnection(config);
  const logger = {
    info: (...a: any[]) => console.error('[info]', ...a),
    warn: (...a: any[]) => console.error('[warn]', ...a),
    error: (...a: any[]) => console.error('[error]', ...a),
    debug: (...a: any[]) => console.error('[debug]', ...a),
  };
  const context = { connection, logger } as any;

  console.log(
    `\nReading FM="${fm}" via group="${group}" version="${version}"...\n`,
  );

  const result = await handleReadFunctionModule(context, {
    function_module_name: fm,
    function_group_name: group,
    version,
  });

  if (result.isError) {
    console.error('Handler returned error:');
    console.error(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const text = result.content?.[0]?.text ?? '';
  let parsed: any = null;
  try {
    const outer = JSON.parse(text);
    parsed = outer?.data ? JSON.parse(outer.data) : outer;
  } catch {
    console.log(text);
    return;
  }

  console.log('=== Response shape ===');
  console.log({
    success: parsed.success,
    echoed_group: parsed.function_group_name,
    fm: parsed.function_module_name,
    version: parsed.version,
    source_len: parsed.source_code?.length ?? 0,
    metadata_len: parsed.metadata?.length ?? 0,
  });

  console.log('\n=== Source (first 400 chars) ===');
  console.log((parsed.source_code ?? '').slice(0, 400));

  console.log('\n=== Metadata XML ===');
  console.log(parsed.metadata ?? '(none)');
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(3);
});
