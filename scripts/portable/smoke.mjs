#!/usr/bin/env node
// Checks the portable executables built for this platform (npm run portable:smoke):
// the version they report, MCP initialize + tools/list over stdio, and an RFC call
// that must reach the RFC stack — an unreachable host answers an RFC error —
// rather than fail to load the addon or the SDK.
//
//   node scripts/portable/smoke.mjs [version]
import { execFileSync } from 'node:child_process';
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

const envFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'portable-smoke-')), 'rfc.env');
fs.writeFileSync(
  envFile,
  [
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

for (const server of Object.values(SERVERS)) {
  const dir = path.join(repo, 'dist-portable', `${server.name}-${version}-${platform}`);
  const bin = path.join(dir, `${server.name}${exe}`);
  if (!fs.existsSync(bin)) {
    console.log(`skip ${server.name}: not built (${dir})`);
    continue;
  }
  checked++;
  let answered;
  try {
    answered = execFileSync(bin, ['--version'], { env, encoding: 'utf8' }).trim();
  } catch (error) {
    check(`${server.name} --version`, false, `did not run: ${String(error.message).split('\n')[0]}`);
    continue;
  }
  check(`${server.name} --version`, answered === version, answered);

  const client = new Client({ name: 'portable-smoke', version: '0' });
  await client.connect(
    new StdioClientTransport({ command: bin, args: [`--env-path=${envFile}`], env, stderr: 'ignore' }),
  );
  const tools = (await client.listTools()).tools.map((t) => t.name);
  const compact = server.name.endsWith('-compact');
  check(`${server.name} tools/list`, compact ? tools.length === 25 : tools.length > 25, `${tools.length} tools`);

  const search = tools.includes('SearchObject')
    ? { name: 'SearchObject', arguments: { object_name: 'X*', maxResults: 1 } }
    : { name: 'HandlerSearch', arguments: { query: 'X*', max_results: 1 } };
  const result = await client.callTool(search);
  const text = String(result.content?.[0]?.text ?? '').replace(/\s+/g, ' ');
  const reachedRfc = /RFC_[A-Z_]+/.test(text) && !/needs the SAP NW RFC SDK|is not available/.test(text);
  check(`${server.name} RFC stack loads from nwrfcsdk/lib`, result.isError === true && reachedRfc, text.slice(0, 160));
  await client.close();
}

if (!checked) {
  console.log(`nothing built for ${platform} at ${version}: run npm run portable:build first`);
  process.exit(1);
}
process.exit(failed ? 1 : 0);
