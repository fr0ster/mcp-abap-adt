#!/usr/bin/env node
// Checks the portable executables built for this platform (npm run portable:smoke):
// the version they report; MCP initialize + tools/list over stdio, started in
// inspection-only mode (no destination: the start connects nothing); and the RFC
// stack — the start against an RFC destination on a host that cannot resolve
// (`.invalid`, RFC 2606) must fail at the RFC logon, its start line naming the
// RFC key (`RFC_…`), rather than fail to load the addon or the SDK.
//
// Since 19.0.0 stdio connects at its start (the logon and the system
// information), before MCP opens: a destination that cannot be reached ends
// the process with exit 1 and one line on stderr. That line is fixed words and
// allowlisted facts only — never an error's message — so an addon or SDK that
// does not load reads `could not be connected at start: Error`, and a loaded
// RFC stack that cannot reach the host reads `the RFC logon failed
// (RFC_COMMUNICATION_FAILURE), …`: the RFC key is the observable.
//
// One @mcp-abap-adt/lib (19.2.0, #303): the build's bundle of each server holds
// one copy of lib's instance registry, and the executables run with the build's
// staging node_modules moved away — nothing outside the executable can be
// loaded — and start without the server runtime's second-copy line (which a
// second registered copy prints before anything else, `--version` included).
// Inside an executable lib registers its copy under the executable's own path:
// Node gives the injected script a `__filename` (measured, Node 24).
//
//   node scripts/portable/smoke.mjs [version]
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require_ = createRequire(import.meta.url);
const { SERVERS, PLATFORMS, currentPlatform } = require_('./args.cjs');
const { withoutSdk } = require_('./tools.cjs');
const version =
  process.argv[2] ?? JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
const platform = currentPlatform();
const { exe, sdkLib } = PLATFORMS[platform];

// The archive's own SDK folder is what is checked, not an SDK the shell knows:
// no SAPNWRFC_HOME, and no search-path folder that holds an SDK library.
const env = { ...process.env };
delete env.SAPNWRFC_HOME;
for (const key of ['PATH', 'Path', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH']) {
  if (env[key] !== undefined) env[key] = withoutSdk(env[key], sdkLib);
}
if (process.platform === 'win32') {
  const system32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', sdkLib);
  if (fs.existsSync(system32)) {
    console.log(`warn ${system32} exists: Windows may load it before the archive's copy — check the loaded path as the archive README shows`);
  }
}

// The inspection start must find no destination: none named, nothing in the
// environment that names one.
const inspectionEnv = { ...env };
for (const key of Object.keys(inspectionEnv)) {
  if (/^(SAP|MCP)_/i.test(key) || key === 'AUTH_BROKER_PATH') delete inspectionEnv[key];
}

// The stores' base directory is the smoke's own, empty: no session or service
// key of this machine's (a leftover session above all) takes part in a run.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-smoke-'));
const brokerPath = path.join(scratch, 'auth-broker');
fs.mkdirSync(brokerPath);
const envFile = path.join(scratch, 'rfc.env');
fs.writeFileSync(
  envFile,
  [
    // `.invalid` never resolves: the RFC logon fails before any connection.
    'SAP_URL=http://unreachable.invalid:8000',
    'SAP_CLIENT=001',
    'SAP_AUTH_TYPE=basic',
    'SAP_USERNAME=placeholder',
    'SAP_PASSWORD=placeholder',
    'SAP_CONNECTION_TYPE=rfc',
    'SAP_SYSTEM_TYPE=onprem',
    '',
  ].join('\n'),
);

let failed = 0;
let checked = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

// Where build.mjs works for this version and platform: the bundles and the stage.
const work = path.join(os.tmpdir(), 'mcp-abap-adt-portable', version, platform);
const SECOND_COPY = 'Two copies of @mcp-abap-adt/lib are loaded in this process';
const INSPECTION = 'Starting in inspection-only mode';
const SDK_MISSING = /needs the SAP NW RFC SDK|is not available/;

// The start against the RFC destination: stdin held open (a closed stdin is a
// shutdown, which would end the start before its logon), every stderr line
// kept, the exit awaited — the start ends by itself, on its logon's failure.
function rfcStart(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, [`--env-path=${envFile}`, `--auth-broker-path=${brokerPath}`], {
      cwd: scratch,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => resolve({ error, stdout, stderr }));
    child.on('close', (status) => {
      child.stdin.destroy();
      resolve({ status, stdout, stderr });
    });
  });
}
const REGISTRY = 'Symbol.for("@mcp-abap-adt/lib/instances")';

// The stage's node_modules is what the bundle was made from: away for the run,
// so an executable that reached outside itself fails here instead of passing.
const stageModules = path.join(work, 'stage', 'node_modules');
// lib's instance registry came with 19.2.0: a bundle of an earlier lib
// (--version) has none to count, which is a skip, not a failure.
const stagedLib = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(stageModules, '@mcp-abap-adt/lib/package.json'), 'utf8')).version;
  } catch {
    return undefined;
  }
})();
const [libMajor = 0, libMinor = 0] = String(stagedLib ?? '').split('.').map(Number);
const libHasRegistry = stagedLib === undefined || libMajor > 19 || (libMajor === 19 && libMinor >= 2);
const movedModules = `${stageModules}.smoke-${process.pid}`;
let moved = false;
const restore = () => {
  if (moved) {
    fs.renameSync(movedModules, stageModules);
    moved = false;
  }
};
if (fs.existsSync(stageModules)) {
  fs.renameSync(stageModules, movedModules);
  moved = true;
  process.on('exit', restore);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      restore();
      process.exit(1);
    });
  }
  console.log(`staging node_modules moved away for the run (${stageModules})`);
} else {
  console.log(`no staging node_modules at ${stageModules}: nothing to move away`);
}

for (const server of Object.values(SERVERS)) {
  const dir = path.join(repo, 'dist-portable', `${server.name}-${version}-${platform}`);
  const bin = path.join(dir, `${server.name}${exe}`);
  if (!fs.existsSync(bin)) {
    console.log(`skip ${server.name}: not built (${dir})`);
    continue;
  }
  checked++;

  const bundle = path.join(work, `${server.name}.bundle.cjs`);
  if (!libHasRegistry) {
    console.log(`skip ${server.name} bundles one copy of lib — lib ${stagedLib} predates its instance registry (19.2.0)`);
  } else if (fs.existsSync(bundle)) {
    const copies = fs.readFileSync(bundle, 'utf8').split(REGISTRY).length - 1;
    check(`${server.name} bundles one copy of lib`, copies === 1, `${copies} instance registr${copies === 1 ? 'y' : 'ies'} in ${bundle}`);
  } else {
    check(`${server.name} bundles one copy of lib`, false, `no bundle at ${bundle}: build it on this machine first`);
  }

  const run = spawnSync(bin, ['--version'], { env, encoding: 'utf8' });
  if (run.error || run.status !== 0) {
    const why = run.error ? String(run.error.message).split('\n')[0] : `exit ${run.status}: ${String(run.stderr).trim().split('\n')[0]}`;
    check(`${server.name} --version`, false, `did not run: ${why}`);
    continue;
  }
  const answered = run.stdout.trim();
  check(`${server.name} --version`, answered === version, answered);
  check(`${server.name} starts on one registered copy of lib`, !String(run.stderr).includes(SECOND_COPY), 'no second-copy line');

  // MCP over stdio in inspection-only mode: no destination, so the start
  // connects nothing and the server answers initialize and tools/list.
  const client = new Client({ name: 'portable-smoke', version: '0' });
  const transport = new StdioClientTransport({
    command: bin,
    args: [`--auth-broker-path=${brokerPath}`],
    cwd: scratch,
    env: inspectionEnv,
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });
  // One server's failure is reported, not thrown: the other server is still checked.
  try {
    await client.connect(transport);
    check(`${server.name} MCP initialize`, client.getServerVersion()?.version === version, `server ${client.getServerVersion()?.version}`);
    const tools = (await client.listTools()).tools.map((t) => t.name);
    // The compact server serves only its Handler* tools; the full one the
    // whole surface (more than 250 tools).
    const compact = server.name.endsWith('-compact');
    const served = compact
      ? tools.length > 0 && tools.every((name) => name.startsWith('Handler'))
      : tools.length > 250;
    check(`${server.name} tools/list`, served, `${tools.length} tools`);
    await client.close();
  } catch (error) {
    const last = stderr.trim().split('\n').at(-1) ?? '';
    check(`${server.name} MCP session`, false, `${String(error.message).split('\n')[0]}${last ? ` (stderr: ${last})` : ''}`);
    await client.close().catch(() => {});
  }
  check(`${server.name} MCP started without a destination`, stderr.includes(INSPECTION), 'inspection-only mode');
  check(`${server.name} served on one registered copy of lib`, !stderr.includes(SECOND_COPY), 'no second-copy line');

  // The RFC stack: the start's logon to a host that does not resolve.
  const rfc = await rfcStart(bin);
  const lines = rfc.stderr.split('\n').filter((line) => line.startsWith('[MCP]'));
  const last = lines.at(-1) ?? '';
  const rfcKey = /\(RFC_[A-Z_]+\)/.test(last);
  check(
    `${server.name} RFC stack loads from nwrfcsdk/lib`,
    !rfc.error && rfc.status === 1 && rfcKey && !SDK_MISSING.test(rfc.stderr) && rfc.stdout === '',
    rfc.error ? `did not run: ${rfc.error.message}` : `exit ${rfc.status}: ${last}`,
  );
  check(`${server.name} started on one registered copy of lib (RFC)`, !rfc.stderr.includes(SECOND_COPY), 'no second-copy line');
}

restore();
fs.rmSync(scratch, { recursive: true, force: true });
if (!checked) {
  console.log(`nothing built for ${platform} at ${version}: run npm run portable:build first`);
  process.exit(1);
}
process.exit(failed ? 1 : 0);
