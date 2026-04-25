/**
 * Probe issue #77: "UpdateFunctionModule operation will lose FM parameters."
 *
 * Self-contained scenario:
 *   1. CreateFunctionGroup (if missing)
 *   2. CreateFunctionModule (stub, no params)
 *   3. UpdateFunctionModule with source containing a `*"` parameter block
 *      → activate. Read back: confirm parameters are present in metadata.
 *   4. UpdateFunctionModule again. Two sub-modes selectable via --mode:
 *        same     — push the exact source we just read back (sanity baseline).
 *        stripped — push source with the `*"` parameter block removed,
 *                   simulating an LLM that "rewrote" the body.
 *      → activate, read back, compare parameter list.
 *
 * Cleanup is opt-in (--cleanup). By default the FG/FM stay so you can inspect
 * them in ADT.
 *
 * Usage:
 *   npx tsx scripts/probe-update-fm.ts --env ./trial.env --mode stripped --cleanup
 */
import * as path from 'node:path';
import { createAbapConnection } from '@mcp-abap-adt/connection';
import * as dotenv from 'dotenv';
import { getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { handleReadFunctionModule } from '../src/handlers/function_module/readonly/handleReadFunctionModule';
import { handleCreateFunctionGroup } from '../src/handlers/function/high/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../src/handlers/function/high/handleCreateFunctionModule';
import { handleUpdateFunctionModule } from '../src/handlers/function/high/handleUpdateFunctionModule';
import { handleDeleteFunctionModule } from '../src/handlers/function/low/handleDeleteFunctionModule';
import { handleDeleteFunctionGroup } from '../src/handlers/function/low/handleDeleteFunctionGroup';

function getArg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function parseHandlerResponse(result: any): any {
  const text = result?.content?.[0]?.text ?? '';
  try {
    const outer = JSON.parse(text);
    return outer?.data ? JSON.parse(outer.data) : outer;
  } catch {
    return { raw: text };
  }
}

function extractParamsFromMetadata(xml: string): string[] {
  if (!xml) return [];
  return xml.match(/<fm:parameter\b[^>]*\/?>/g) ?? [];
}

function extractParamCommentLines(src: string): string[] {
  if (!src) return [];
  return src
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trimStart().startsWith('*"'));
}

function stripParamCommentBlock(src: string): string {
  return src
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('*"'))
    .join('\n');
}

async function readFm(context: any, fm: string, group: string) {
  const r = await handleReadFunctionModule(context, {
    function_module_name: fm,
    function_group_name: group,
    version: 'active',
  });
  if (r.isError) {
    return { error: r.content?.[0]?.text };
  }
  const d = parseHandlerResponse(r);
  return {
    source: (d.source_code ?? '') as string,
    metadata: (d.metadata ?? '') as string,
  };
}

function logSnapshot(label: string, snap: { source: string; metadata: string }) {
  const pMeta = extractParamsFromMetadata(snap.metadata);
  const pSrc = extractParamCommentLines(snap.source);
  console.log(`\n--- ${label} ---`);
  console.log(`  source.length     : ${snap.source.length}`);
  console.log(`  metadata.length   : ${snap.metadata.length}`);
  console.log(`  metadata params   : ${pMeta.length}`);
  pMeta.forEach((p) => console.log(`    meta: ${p}`));
  console.log(`  source *"-lines   : ${pSrc.length}`);
  pSrc.slice(0, 40).forEach((p) => console.log(`    src : ${p}`));
  return { pMeta, pSrc };
}

async function main() {
  const args = process.argv.slice(2);
  const envArg = getArg(args, '--env');
  const mode =
    (getArg(args, '--mode') as 'same' | 'stripped' | 'bare') || 'bare';
  const fgName = (getArg(args, '--fg') || 'ZMCP_I77_FG').toUpperCase();
  const fmName = (getArg(args, '--fm') || 'Z_MCP_I77_FM').toUpperCase();
  const pkg = getArg(args, '--package') || 'ZADT_BLD_PKG03';
  const transport = getArg(args, '--transport') || '';
  const cleanup = args.includes('--cleanup');

  const envPath = path.resolve(envArg || path.join(__dirname, '..', '.env'));
  console.log(`env: ${envPath}`);
  console.log(`pkg: ${pkg} | fg: ${fgName} | fm: ${fmName} | mode: ${mode}`);
  dotenv.config({ path: envPath, override: true });

  const config = getSapConfigFromEnv();
  const connection = createAbapConnection(config);
  const logger = {
    info: (...a: any[]) => console.error('[info]', ...a),
    warn: (...a: any[]) => console.error('[warn]', ...a),
    error: (...a: any[]) => console.error('[error]', ...a),
    debug: () => {},
  };
  const context = { connection, logger } as any;

  // ── Step 1: Create FG ───────────────────────────────────────────────
  console.log('\n=== STEP 1: CreateFunctionGroup ===');
  const fgRes = await handleCreateFunctionGroup(context, {
    function_group_name: fgName,
    description: 'Probe FG for issue #77',
    package_name: pkg,
    transport_request: transport || undefined,
    activate: true,
  });
  if (fgRes.isError) {
    const msg = fgRes.content?.[0]?.text || '';
    if (/already exists|exists|0CX_PAK/i.test(msg)) {
      console.log('FG already exists — continuing.');
    } else {
      console.error('CreateFunctionGroup failed:', msg);
      process.exit(2);
    }
  } else {
    console.log('FG created:', parseHandlerResponse(fgRes));
  }

  // ── Step 2: Create FM (stub) ────────────────────────────────────────
  console.log('\n=== STEP 2: CreateFunctionModule (stub) ===');
  const fmRes = await handleCreateFunctionModule(context, {
    function_group_name: fgName,
    function_module_name: fmName,
    description: 'Probe FM for issue #77',
    transport_request: transport || undefined,
  });
  if (fmRes.isError) {
    const msg = fmRes.content?.[0]?.text || '';
    if (/already exists|exists/i.test(msg)) {
      console.log('FM already exists — continuing.');
    } else {
      console.error('CreateFunctionModule failed:', msg);
      process.exit(3);
    }
  } else {
    console.log('FM created:', parseHandlerResponse(fmRes));
  }

  // ── Step 3: Seed source WITH `*"` parameter block ───────────────────
  // ABAP Cloud requires inline parameters in FUNCTION statement, not `*"` comments.
  const seedSource = [
    `FUNCTION ${fmName}`,
    `  IMPORTING`,
    `    VALUE(iv_input) TYPE string`,
    `  EXPORTING`,
    `    VALUE(ev_output) TYPE string`,
    `  CHANGING`,
    `    VALUE(cv_flag) TYPE abap_bool`,
    `  EXCEPTIONS`,
    `    input_invalid.`,
    `  ev_output = |seed: { iv_input }|.`,
    `ENDFUNCTION.`,
    ``,
  ].join('\n');

  console.log('\n=== STEP 3: Seed UpdateFunctionModule with *" parameter block ===');
  console.log('--- seed payload ---');
  console.log(seedSource);
  console.log('--- end payload ---');
  const seedRes = await handleUpdateFunctionModule(context, {
    function_group_name: fgName,
    function_module_name: fmName,
    source_code: seedSource,
    transport_request: transport || undefined,
    activate: true,
  });
  if (seedRes.isError) {
    console.error('Seed update failed (via handler):', seedRes.content?.[0]?.text);
    if (cleanup) await safeCleanup(context, fmName, fgName, transport);
    process.exit(4);
  }
  console.log('Seed update OK.');

  const beforeSnap = await readFm(context, fmName, fgName);
  if ('error' in beforeSnap) {
    console.error('Read after seed failed:', beforeSnap.error);
    if (cleanup) await safeCleanup(context, fmName, fgName, transport);
    process.exit(5);
  }
  const before = logSnapshot('AFTER SEED (params should be present)', beforeSnap);

  if (before.pMeta.length === 0) {
    console.log(
      '\n⚠️  Even seed update did not produce parameters in metadata. ' +
        "ADT didn't pick up `*\"` block from PUT — different failure mode than the issue claims. Inspect manually in ADT.",
    );
  }

  // ── Step 4: Test UpdateFunctionModule ───────────────────────────────
  let payload: string;
  if (mode === 'stripped') {
    payload = stripParamCommentBlock(beforeSnap.source);
  } else if (mode === 'bare') {
    // Simulates an LLM that "rewrote" the FM body and dropped param declarations.
    payload = [
      `FUNCTION ${fmName}.`,
      `  " bare body — no parameters declared on FUNCTION statement`,
      `ENDFUNCTION.`,
      ``,
    ].join('\n');
  } else {
    payload = beforeSnap.source;
  }

  console.log(`\n=== STEP 4: UpdateFunctionModule (mode=${mode}) ===`);
  console.log(`payload length: ${payload.length}`);
  const upRes = await handleUpdateFunctionModule(context, {
    function_group_name: fgName,
    function_module_name: fmName,
    source_code: payload,
    transport_request: transport || undefined,
    activate: true,
  });
  if (upRes.isError) {
    console.error('Test update failed:', upRes.content?.[0]?.text);
  } else {
    console.log('Test update OK.');
  }

  const afterSnap = await readFm(context, fmName, fgName);
  if ('error' in afterSnap) {
    console.error('Read after test update failed:', afterSnap.error);
    if (cleanup) await safeCleanup(context, fmName, fgName, transport);
    process.exit(6);
  }
  const after = logSnapshot('AFTER TEST UPDATE', afterSnap);

  // ── Verdict ─────────────────────────────────────────────────────────
  console.log('\n=== VERDICT ===');
  console.log(
    `metadata params: before=${before.pMeta.length}  after=${after.pMeta.length}  delta=${after.pMeta.length - before.pMeta.length}`,
  );
  console.log(
    `source *"-lines : before=${before.pSrc.length}  after=${after.pSrc.length}  delta=${after.pSrc.length - before.pSrc.length}`,
  );
  if (after.pMeta.length < before.pMeta.length) {
    console.log('⚠️  PARAMETER LOSS REPRODUCED (metadata).');
  } else if (after.pSrc.length < before.pSrc.length) {
    console.log(
      '⚠️  Source `*"` block shrunk; metadata unchanged — partial reproduction.',
    );
  } else {
    console.log('✅  Parameters preserved.');
  }

  if (cleanup) await safeCleanup(context, fmName, fgName, transport);
}

async function safeCleanup(
  context: any,
  fm: string,
  fg: string,
  transport: string,
) {
  console.log('\n=== CLEANUP ===');
  try {
    const dFm = await handleDeleteFunctionModule(context, {
      function_module_name: fm,
      function_group_name: fg,
      transport_request: transport || undefined,
    } as any);
    console.log('Delete FM:', dFm.isError ? dFm.content?.[0]?.text : 'OK');
  } catch (e: any) {
    console.log('Delete FM error:', e?.message || e);
  }
  try {
    const dFg = await handleDeleteFunctionGroup(context, {
      function_group_name: fg,
      transport_request: transport || undefined,
    } as any);
    console.log('Delete FG:', dFg.isError ? dFg.content?.[0]?.text : 'OK');
  } catch (e: any) {
    console.log('Delete FG error:', e?.message || e);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(99);
});
