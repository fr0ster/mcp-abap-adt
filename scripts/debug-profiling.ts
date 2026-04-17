/**
 * Debug script: run class with profiling then read trace data.
 */
import { handleRuntimeGetProfilerTraceData } from '../src/handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import { loadTestEnv, getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAbapConnection } from '@mcp-abap-adt/connection';

function printHelp() {
  console.log(`Usage: npx tsx scripts/debug-profiling.ts --class <CLASS_NAME>

Run an ABAP class with profiling and read the resulting trace data.

Options:
  --class <name>   ABAP class name to run (required)
  --help           Show this help message

Examples:
  npx tsx scripts/debug-profiling.ts --class ZCL_MY_CLASS
  npx tsx scripts/debug-profiling.ts --class zcl_my_class`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const get = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const className = get('--class');

  if (!className) {
    console.error('Error: --class is required.\n');
    printHelp();
    process.exit(1);
  }

  await loadTestEnv();
  const connection = createAbapConnection(getSapConfigFromEnv());
  const context = { connection };

  console.log(`\n1. Running class "${className}" with profiling...`);
  const { AdtExecutor } = await import('@mcp-abap-adt/adt-clients');
  const executor = new AdtExecutor(connection);
  const result = await executor.getClassExecutor().runWithProfiling(
    { className: className.toUpperCase() },
    { profilerParameters: { description: `DEBUG_${Date.now()}`, allProceduralUnits: true, sqlTrace: false, maxTimeForTracing: 1800 } },
  );
  console.log('profiler_id:', result.profilerId);
  console.log('trace_id:', result.traceId);
  console.log('traceRequestsResponse status:', result.traceRequestsResponse?.status);
  console.log('traceRequestsResponse Location:', result.traceRequestsResponse?.headers?.location ?? result.traceRequestsResponse?.headers?.['content-location']);
  const body = result.traceRequestsResponse?.data;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  console.log('traceRequestsResponse body (first 800):', bodyStr?.slice(0, 800));

  const traceId = String(result.traceId ?? '').toUpperCase();
  if (!traceId) {
    console.error('No trace_id returned!');
    process.exit(1);
  }

  console.log(`\n2. Reading trace data for trace_id="${traceId}"...`);
  const traceResult = await handleRuntimeGetProfilerTraceData(context, {
    trace_id_or_uri: traceId,
    view: 'hitlist',
    with_system_events: false,
  });

  if (traceResult.isError) {
    console.error('GetProfilerTraceData FAILED:', traceResult.content[0]?.text);
    process.exit(1);
  }

  const traceData = JSON.parse(traceResult.content[0].text);
  console.log('status:', traceData.status);
  console.log('success:', traceData.success);
}

main().catch((e) => { console.error(e); process.exit(1); });
