/**
 * Debug script: run class with profiling then read trace data.
 * Usage: npx tsx scripts/debug-profiling.ts <CLASS_NAME>
 */
import { handleRuntimeRunClassWithProfiling } from '../src/handlers/system/readonly/handleRuntimeRunClassWithProfiling';
import { handleRuntimeGetProfilerTraceData } from '../src/handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import { loadTestEnv, getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAbapConnection } from '@mcp-abap-adt/connection';

async function main() {
  const className = process.argv[2] ?? 'ZMCP_BLD_CLSLOC_H1';

  await loadTestEnv();
  const connection = createAbapConnection(getSapConfigFromEnv());
  const context = { connection };

  console.log(`\n1. Running class "${className}" with profiling...`);
  // Use executor directly to see raw traceRequestsResponse
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

  const runResult = { isError: false, content: [{ text: JSON.stringify({ trace_id: result.traceId }) }] };
  const runData = { trace_id: result.traceId };

  const traceId = String(runData.trace_id ?? '').toUpperCase();
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
