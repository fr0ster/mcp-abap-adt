/**
 * What `activationExecuted="false"` with no messages actually means, measured.
 *
 * The migration's integration run fails on a function group that is created,
 * locked, updated, unlocked and then activated: SAP answers
 * `checkExecuted="false" activationExecuted="false" generationExecuted="true"`
 * with no `msg` at all, and `analyseActivation` reports that as a refusal.
 * Three readings are on the table and the document alone cannot separate
 * them:
 *
 *   1. the object needed no activation (adt-clients `v18.0.2`
 *      `activationUtils.ts:45-75` probed exactly this for a class that was
 *      already active);
 *   2. activation was accepted and is still running — ADT is asynchronous and
 *      activation is its heaviest operation;
 *   3. activation was declined and SAP did not say why.
 *
 * They are told apart by asking afterwards, which is what this does: create a
 * scratch function group, list the inactive objects, activate it, and list
 * again at intervals. If the group leaves the inactive list, reading 1 or 2
 * is right and the refusal is wrong; if it stays, reading 3 is right.
 *
 * WRITES TO SAP. Creates one function group in the configured build package
 * and deletes it at the end. Nothing else is touched.
 *
 * Usage:
 *   npx tsx scripts/probe-activation-timing.ts [--name ZMCP_BLD_PROBE_FG]
 */
import { handleCreateClass } from '../src/handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../src/handlers/class/high/handleDeleteClass';
import { handleUpdateClass } from '../src/handlers/class/high/handleUpdateClass';
import { handleActivateClass } from '../src/handlers/class/low/handleActivateClass';
import { handleCreateFunctionGroup } from '../src/handlers/function/high/handleCreateFunctionGroup';
import { handleActivateFunctionGroup } from '../src/handlers/function/low/handleActivateFunctionGroup';
import { handleDeleteFunctionGroup } from '../src/handlers/function/low/handleDeleteFunctionGroup';
import { handleGetInactiveObjects } from '../src/handlers/system/readonly/handleGetInactiveObjects';
import { loadTestConfig } from '../src/__tests__/integration/helpers/configHelpers';
import { createTestConnectionAndSession } from '../src/__tests__/integration/helpers/sessionHelpers';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function text(result: { isError: boolean; content: Array<{ text: string }> }): string {
  return `isError=${result.isError} ${result.content[0]?.text ?? ''}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const nameArg = args.indexOf('--name');
  const name = (nameArg >= 0 ? args[nameArg + 1] : 'ZMCP_BLD_PROBE_FG').toUpperCase();

  const { connection } = await createTestConnectionAndSession();
  const context = { connection, logger: undefined } as any;
  const env = loadTestConfig()?.environment ?? {};
  const packageName = String(env.default_package ?? '');
  const transport = String(env.default_transport ?? '');
  console.log(`function group: ${name}  package: ${packageName}  transport: ${transport || '(none)'}`);

  /** Is our group among the objects SAP considers not yet activated? */
  const listedInactive = async (): Promise<string> => {
    const result = await handleGetInactiveObjects(context, {} as any);
    if (result.isError) return `(could not list: ${result.content[0]?.text?.slice(0, 200)})`;
    const body = result.content[0]?.text ?? '';
    return body.toUpperCase().includes(name) ? 'YES — still inactive' : 'no — not in the inactive list';
  };

  try {
    console.log('\n1. create (activate: false)');
    console.log(text(await handleCreateFunctionGroup(context, {
      function_group_name: name,
      description: 'activation timing probe',
      package_name: packageName,
      ...(transport ? { transport_request: transport } : {}),
      activate: false,
    } as any)));

    console.log(`\n2. inactive right after create: ${await listedInactive()}`);

    console.log('\n3. activate');
    console.log(text(await handleActivateFunctionGroup(context, {
      function_group_name: name,
    } as any)));

    for (const seconds of [0, 5, 15, 30]) {
      if (seconds) await wait(seconds * 1000);
      console.log(`\n4. inactive ${seconds}s after activate: ${await listedInactive()}`);
    }
    // Part B — the same question for an object that DOES need activating, so
    // the answer above can be read against one where SAP had work to do.
    // A class with new source is the plainest case: it goes inactive on the
    // write and only leaves the list once activation has run.
    const className = `${name.slice(0, 26)}_C`;
    console.log(`\n=== part B: a class that actually needs activating (${className}) ===`);
    const source = [
      `CLASS ${className} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
      '  PUBLIC SECTION.',
      '    METHODS say_hello RETURNING VALUE(rv_text) TYPE string.',
      'ENDCLASS.',
      '',
      `CLASS ${className} IMPLEMENTATION.`,
      '  METHOD say_hello.',
      `    rv_text = 'hello'.`,
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');

    const inClassList = async (): Promise<string> => {
      const result = await handleGetInactiveObjects(context, {} as any);
      if (result.isError) return `(could not list: ${result.content[0]?.text?.slice(0, 200)})`;
      const body = result.content[0]?.text ?? '';
      return body.toUpperCase().includes(className) ? 'YES — still inactive' : 'no — not in the inactive list';
    };

    try {
      console.log('\nB1. create class');
      console.log(text(await handleCreateClass(context, {
        class_name: className,
        description: 'activation timing probe',
        package_name: packageName,
        ...(transport ? { transport_request: transport } : {}),
      } as any)));

      console.log('\nB2. update source, without activating');
      console.log(text(await handleUpdateClass(context, {
        class_name: className,
        source_code: source,
        ...(transport ? { transport_request: transport } : {}),
        activate: false,
      } as any)));

      console.log(`\nB3. inactive after the write: ${await inClassList()}`);

      console.log('\nB4. activate');
      console.log(text(await handleActivateClass(context, { class_name: className } as any)));

      for (const seconds of [0, 5, 15]) {
        if (seconds) await wait(seconds * 1000);
        console.log(`\nB5. inactive ${seconds}s after activate: ${await inClassList()}`);
      }
    } finally {
      console.log('\nB6. cleanup: delete class');
      console.log(text(await handleDeleteClass(context, {
        class_name: className,
        ...(transport ? { transport_request: transport } : {}),
      } as any)));
    }
  } finally {
    console.log('\n5. cleanup: delete');
    console.log(text(await handleDeleteFunctionGroup(context, {
      function_group_name: name,
      ...(transport ? { transport_request: transport } : {}),
    } as any)));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
