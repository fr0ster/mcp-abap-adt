import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { loadTestEnv, getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAbapConnection } from '@mcp-abap-adt/connection';

async function main() {
  await loadTestEnv();
  const connection = createAbapConnection(getSapConfigFromEnv());
  const client = new AdtRuntimeClient(connection);
  const r = await client.listProfilerTraceFiles();
  const raw = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  console.log(raw.slice(0, 5000));
}
main().catch(console.error);
