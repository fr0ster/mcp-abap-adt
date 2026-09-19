/**
 * Ask SAP the four questions the migration's integration run left open.
 *
 * The soft-mode run against trial ends with eight failures that the tree
 * cannot settle on its own: four `Check*` tools answering `isError`, an
 * empty node structure for a class, and a missing append in the structures
 * list. Each needs SAP's own words, and a jest assertion throws before it
 * prints them. This script issues the same calls the failing tests issue and
 * prints what came back — nothing is written, every call is read-only.
 *
 * Usage:
 *   npx tsx scripts/probe-migration-failures.ts
 *   npx tsx scripts/probe-migration-failures.ts --only checks
 *
 * Sections: `checks`, `node`, `appends`. Omit `--only` to run all three.
 */
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { createTestConnectionAndSession } from '../src/__tests__/integration/helpers/sessionHelpers';
import { handleCheckBehaviorDefinition } from '../src/handlers/behavior_definition/high/handleCheckBehaviorDefinition';
import { handleCheckFunctionGroup } from '../src/handlers/function/high/handleCheckFunctionGroup';
import { handleCheckFunctionModule } from '../src/handlers/function/high/handleCheckFunctionModule';
import { handleCheckTable } from '../src/handlers/table/high/handleCheckTable';
import { handleGetNodeStructure } from '../src/handlers/system/low/handleGetNodeStructure';
import { createAdtClient } from '../src/lib/clients';
import { ourUtils } from '../src/lib/strategies/resultSets';
import { fetchWhereUsedReferences } from '../src/lib/strategies/whereUsedList';

function show(label: string, result: { isError: boolean; content: Array<{ text: string }> }): void {
  console.log(`\n--- ${label} — isError=${result.isError}`);
  console.log(result.content[0]?.text ?? '(no content)');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args[args.indexOf('--only') + 1];
  const wants = (section: string) => !args.includes('--only') || only === section;

  const { connection } = await createTestConnectionAndSession();
  const logger = undefined;
  const context = { connection, logger } as any;

  if (wants('checks')) {
    console.log('\n=== the four Check tools that answered isError ===');
    show('CheckBehaviorDefinition ZMCP_SHR_I_ROOT', await handleCheckBehaviorDefinition(context, {
      name: 'ZMCP_SHR_I_ROOT',
    } as any));
    show('CheckTable ZMCP_SHR_RTABL (default version)', await handleCheckTable(context, {
      table_name: 'ZMCP_SHR_RTABL',
    } as any));
    show('CheckTable ZMCP_SHR_RTABL version=active', await handleCheckTable(context, {
      table_name: 'ZMCP_SHR_RTABL',
      version: 'active',
    } as any));
    show('CheckFunctionGroup ZMCP_BLD_SHR_FGR', await handleCheckFunctionGroup(context, {
      function_group_name: 'ZMCP_BLD_SHR_FGR',
      detail: 'raw',
    } as any));
    show('CheckFunctionModule Z_MCP_BLD_SHR_FM', await handleCheckFunctionModule(context, {
      function_module_name: 'Z_MCP_BLD_SHR_FM',
      function_group_name: 'ZMCP_BLD_SHR_FGR',
      detail: 'raw',
    } as any));
  }

  if (wants('node')) {
    console.log('\n=== GetNodeStructureLow on a class ===');
    show('CLAS/OC CL_ABAP_CHAR_UTILITIES node_id=0000', await handleGetNodeStructure(context, {
      parent_type: 'CLAS/OC',
      parent_name: 'CL_ABAP_CHAR_UTILITIES',
      node_id: '0000',
      with_short_descriptions: true,
    }));

    // What the wire actually carried, beside the handler's verdict.
    const raw = await createAdtClient(connection, logger)
      .getUtils({ ...ourUtils, node: (a: any) => String(a?.data ?? '') })
      .fetchNodeStructure('CLAS/OC', 'CL_ABAP_CHAR_UTILITIES', {
        nodeId: '0000',
        withShortDescriptions: true,
      });
    const body = raw.ok ? String(raw.getResult().value ?? '') : `(refused: ${raw.getError().message})`;
    console.log(`wire body: ${body.length} bytes`);
    console.log(body.slice(0, 1200));
  }

  if (wants('appends')) {
    console.log('\n=== the append the structures list did not find ===');
    const client = createAdtClient(connection, logger);
    const utils = client.getUtils(ourUtils);
    for (const objectType of ['structure', 'table'] as const) {
      const wu = await fetchWhereUsedReferences(utils as any, {
        object_name: 'ZMCP_SHR_STRU',
        object_type: objectType,
        enableOnlyTypes: ['TABL/DS'],
      });
      if (!wu.ok) {
        console.log(`where-used as ${objectType}: refused — ${wu.getError().message}`);
        continue;
      }
      const value = wu.getResult().value;
      console.log(`where-used as ${objectType}: total=${value.totalReferences}, parsed=${value.references.length}`);
      for (const ref of value.references) {
        console.log(`  ${ref.type}  ${ref.name}`);
      }
      // The candidate's own source decides: an append says `extend type X with`.
      for (const ref of value.references) {
        const name = (ref.name ?? '').toUpperCase();
        if (!name || name === 'ZMCP_SHR_STRU' || !/^TABL\//i.test(ref.type ?? '')) continue;
        const read = await client
          .getStructure()
          .read({ structureName: name }, 'active', { analyse: analyseException });
        console.log(
          read.ok
            ? `  source of ${name}: ${String(read.getResult().value).slice(0, 300)}`
            : `  source of ${name}: refused — ${read.getError().message}`,
        );
      }
      break;
    }

    // The same question without the server-side scope, to tell "SAP knows of
    // no references" apart from "our scope document removed them".
    for (const objectType of ['structure', 'table'] as const) {
      const wu = await fetchWhereUsedReferences(utils as any, {
        object_name: 'ZMCP_SHR_STRU',
        object_type: objectType,
      });
      if (!wu.ok) {
        console.log(`unscoped where-used as ${objectType}: refused — ${wu.getError().message}`);
        continue;
      }
      const value = wu.getResult().value;
      console.log(`unscoped where-used as ${objectType}: total=${value.totalReferences}, parsed=${value.references.length}`);
      for (const ref of value.references) {
        console.log(`  ${ref.type}  ${ref.name}`);
      }
      break;
    }

    // And the append the config names, read directly: does it exist, and does
    // its source say `extend type`?
    const append = await client
      .getStructure()
      .read({ structureName: 'ZOK_S_APPEND' }, 'active', { analyse: analyseException });
    console.log(
      append.ok
        ? `ZOK_S_APPEND source: ${String(append.getResult().value).slice(0, 400)}`
        : `ZOK_S_APPEND: refused — ${append.getError().message}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
