/**
 * Run ATC once against the shared polygon class and print what came back.
 *
 * The findings document has never been captured: the corpus holds 143 files
 * and not one of them is ATC, because no tool in this repository has ever
 * asked for one. `GetATCFindings` has to turn that document into an answer,
 * and writing the parser from a guess about its shape is how a reading ends
 * up matching element names nothing sends. So this runs the three calls the
 * handler makes and prints the worklist verbatim, to be read and then
 * captured.
 *
 * Nothing is written to SAP beyond the run itself: an ATC worklist and a run
 * are the only artefacts, and both are the system's own transient records.
 *
 *   npx tsx scripts/probe-atc.ts [OBJECT_NAME] [object_type]
 */
import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { AtcObjectType } from '@mcp-abap-adt/interfaces-adt';
import { createTestConnectionAndSession } from '../src/__tests__/integration/helpers/sessionHelpers';
import { handleGetATCFindings } from '../src/handlers/atc/high/handleGetATCFindings';
import { handleGetATCRunStatus } from '../src/handlers/atc/high/handleGetATCRunStatus';
import { handleRunATC } from '../src/handlers/atc/high/handleRunATC';

async function main(): Promise<void> {
  const name = (process.argv[2] ?? 'ZMCP_SHR_CLASS').toUpperCase();
  const type = (process.argv[3] ?? 'class') as AtcObjectType;

  const { connection } = await createTestConnectionAndSession();
  const atc = new AdtRuntimeClient(connection as never, undefined).getAtc();

  console.log(`--- resolveCheckVariant()`);
  const variant = await atc.resolveCheckVariant();
  console.log(variant);

  console.log(`\n--- createWorklist(${variant})`);
  const worklistId = await atc.createWorklist(variant);
  console.log(worklistId);

  console.log(`\n--- startRun(${worklistId}, ${type} ${name}, wait=true)`);
  const run = await atc.startRun(
    worklistId,
    { objects: [{ objectName: name, objectType: type }] },
    { wait: true, maximumVerdicts: 100 },
  );
  console.log(
    run.ok
      ? JSON.stringify(run.getResult().value)
      : JSON.stringify(run.getError()),
  );

  console.log(`\n--- getFindings(${worklistId})`);
  const findings = await atc.getFindings(worklistId);
  if (!findings.ok) {
    console.log(JSON.stringify(findings.getError(), null, 2));
    return;
  }
  const document = findings.getResult().value;
  console.log(
    typeof document === 'string' ? document : JSON.stringify(document),
  );

  // The same ground, through the tools a caller actually gets.
  const context = { connection, logger: undefined } as never;
  const show = (label: string, result: any) =>
    console.log(
      `\n=== ${label} — ${result.isError ? 'isError' : 'ok'}\n${String(result.content[0].text).slice(0, 1200)}`,
    );

  const waited: any = await handleRunATC(context, {
    objects: [{ name, type }],
    wait: true,
  });
  show('RunATC (wait)', waited);

  const started: any = await handleRunATC(context, {
    objects: [{ name, type }],
  });
  show('RunATC (no wait)', started);
  const startedPayload = JSON.parse(started.content[0].text);

  if (startedPayload.run_id) {
    show(
      'GetATCRunStatus',
      await handleGetATCRunStatus(context, { run_id: startedPayload.run_id }),
    );
  }

  show(
    'GetATCFindings',
    await handleGetATCFindings(context, {
      worklist_id: startedPayload.worklist_id ?? worklistId,
    }),
  );
}

main().catch((error) => {
  console.error('probe-atc failed:', error);
  process.exitCode = 1;
});
