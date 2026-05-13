import { handleRuntimeRunClass } from '../src/handlers/system/readonly/handleRuntimeRunClass';
import { createTestConnectionAndSession } from '../src/__tests__/integration/helpers/sessionHelpers';

async function main(): Promise<void> {
  const className = process.argv[2] || 'ZMCP_BLD_CLSLOC_H1';
  const { connection } = await createTestConnectionAndSession();
  const res = await handleRuntimeRunClass(
    { connection, logger: console as any },
    { class_name: className },
  );
  console.log('=== RuntimeRunClass result ===');
  const text = res.content?.[0]?.text ?? '';
  console.log(typeof text === 'string' ? text.slice(0, 2000) : text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
