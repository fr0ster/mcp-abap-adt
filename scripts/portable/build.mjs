#!/usr/bin/env node
// Portable builds: one executable per server and platform, Node.js inside, the
// RFC addon embedded. See docs/superpowers/specs/2026-10-05-portable-builds-design.md.
//
//   node scripts/portable/build.mjs <full|compact|all> [--platform=<p>] [--version=<v>]
//
// PROTOTYPE: builds for the platform it runs on. Cross-building needs the RFC
// addon of the target platform, which arrives with sap-rfc-lite's prebuilds.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

const SERVERS = {
  full: { name: 'mcp-abap-adt', pkg: '@mcp-abap-adt/core' },
  compact: { name: 'mcp-abap-adt-compact', pkg: '@mcp-abap-adt/compact' },
};
const PLATFORMS = {
  'linux-x64': { node: 'linux-x64', ext: 'tar.xz', exe: '', sdkLib: 'libsapnwrfc.so', archive: 'tar.gz' },
  'win-x64': { node: 'win-x64', ext: 'zip', exe: '.exe', sdkLib: 'sapnwrfc.dll', archive: 'zip' },
  'macos-arm64': { node: 'darwin-arm64', ext: 'tar.gz', exe: '', sdkLib: 'libsapnwrfc.dylib', archive: 'zip' },
};
const NODE_MAJOR = 'v24.';
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function fail(message) {
  console.error(`portable: ${message}`);
  process.exit(1);
}

function currentPlatform() {
  const key = { linux: 'linux', win32: 'win', darwin: 'macos' }[process.platform];
  return `${key}-${process.arch}`;
}

function parseArgs(argv) {
  const opts = { which: 'all', platform: currentPlatform(), version: undefined };
  for (const arg of argv) {
    if (arg.startsWith('--platform=')) opts.platform = arg.slice(11);
    else if (arg.startsWith('--version=')) opts.version = arg.slice(10);
    else if (!arg.startsWith('--')) opts.which = arg;
    else fail(`unknown option ${arg}`);
  }
  if (!['full', 'compact', 'all'].includes(opts.which)) {
    fail(`unknown server "${opts.which}": full, compact or all`);
  }
  if (!PLATFORMS[opts.platform]) {
    fail(`unknown platform "${opts.platform}": ${Object.keys(PLATFORMS).join(', ')}`);
  }
  if (opts.platform !== currentPlatform()) {
    fail(
      `cross-building ${opts.platform} on ${currentPlatform()} needs the target's prebuilt RFC addon (sap-rfc-lite prebuilds) — not in this prototype`,
    );
  }
  opts.version ??= JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
  return opts;
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', ...opts });

// npm and node-gyp must not see FORCE_COLOR: sap-rfc-lite's binding.gyp reads
// its N-API version through `node -p`, which then prints ANSI colour codes.
// Under `npm run` the inherited npm_* settings make the nested npm colour its
// scripts again, so those go too and colour is switched off explicitly.
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) if (/^npm_/i.test(key)) delete env[key];
  env.FORCE_COLOR = '0';
  env.npm_config_color = 'false';
  return env;
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function stage(work, version) {
  const dir = path.join(work, 'stage');
  const marker = path.join(dir, '.staged');
  if (fs.existsSync(marker)) {
    const staged = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (staged.version === version) return { dir, sdk: staged.sdk };
  }
  if (!process.env.SAPNWRFC_HOME) {
    fail('set SAPNWRFC_HOME to the SAP NW RFC SDK of this platform: the RFC addon is compiled against it');
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true}\n');
  console.log(`portable: installing ${SERVERS.full.pkg}@${version} and ${SERVERS.compact.pkg}@${version} from npm`);
  run(
    npm,
    ['install', '--prefer-online', '--no-audit', '--no-fund', '--foreground-scripts',
      `${SERVERS.full.pkg}@${version}`, `${SERVERS.compact.pkg}@${version}`],
    { cwd: dir, env: cleanEnv(), stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' },
  );
  // The SDK the addon was compiled against: its RUNPATH names this folder.
  const sdk = path.resolve(process.env.SAPNWRFC_HOME);
  fs.writeFileSync(marker, JSON.stringify({ version, sdk }));
  return { dir, sdk };
}

function addon(stageDir, sdk, work, platform) {
  const built = path.join(stageDir, 'node_modules/@mcp-abap-adt/sap-rfc-lite/build/Release/sapnwrfc.node');
  if (!fs.existsSync(built)) {
    fail('the RFC addon was not built: check SAPNWRFC_HOME and the C++ toolchain (npm left the optional dependency out)');
  }
  const out = path.join(work, 'sapnwrfc.node');
  const bytes = fs.readFileSync(built);
  if (platform === 'linux-x64') {
    // The addon's RUNPATH names the SDK on this machine; rewrite it to $ORIGIN
    // in place (NUL-terminated, shorter than the original) so it finds the SDK
    // in its own folder — where the loader writes it.
    const old = Buffer.from(`${path.join(sdk, 'lib')}\0`);
    const at = bytes.indexOf(old);
    if (at < 0 || bytes.indexOf(old, at + 1) >= 0) fail('could not locate exactly one RUNPATH in the RFC addon');
    const origin = Buffer.from('$ORIGIN\0');
    origin.copy(bytes, at);
    bytes.fill(0, at + origin.length, at + old.length);
  }
  fs.writeFileSync(out, bytes);
  if (platform === 'macos-arm64') {
    run('install_name_tool', ['-delete_rpath', path.join(sdk, 'lib'), '-add_rpath', '@loader_path', out]);
    run('codesign', ['--force', '--sign', '-', out]);
  }
  return out;
}

async function nodeBinary(work, platform) {
  const { node: target, ext, exe } = PLATFORMS[platform];
  const index = await (await fetch('https://nodejs.org/dist/index.json')).json();
  const version = index.find((v) => v.version.startsWith(NODE_MAJOR)).version;
  const dir = path.join(work, 'node');
  const bin = path.join(dir, `node-${version}-${target}`, exe ? 'node.exe' : 'bin/node');
  if (fs.existsSync(bin)) return { bin, version };
  fs.mkdirSync(dir, { recursive: true });
  const file = `node-${version}-${target}.${ext}`;
  const base = `https://nodejs.org/dist/${version}`;
  const data = Buffer.from(await (await fetch(`${base}/${file}`)).arrayBuffer());
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const expected = sums.split('\n').find((l) => l.endsWith(`  ${file}`))?.split(' ')[0];
  const actual = createHash('sha256').update(data).digest('hex');
  if (!expected || expected !== actual) fail(`checksum mismatch for ${file}`);
  fs.writeFileSync(path.join(dir, file), data);
  run('tar', ['-xf', file], { cwd: dir });
  console.log(`portable: Node ${version} for ${target}, checksum verified`);
  return { bin, version };
}

async function bundle(work, stageDir, server) {
  const esbuild = await import('esbuild');
  const entry = path.join(work, `${server.name}-entry.cjs`);
  const launcher = path.join(stageDir, 'node_modules', server.pkg, 'dist/launcher.js');
  fs.writeFileSync(
    entry,
    `const { main } = require(${JSON.stringify(launcher)});\n` +
      'void main().catch((err) => { console.error("[MCP] launcher failed:", err instanceof Error ? err.message : String(err)); process.exit(1); });\n',
  );
  const outfile = path.join(work, `${server.name}.bundle.cjs`);
  const loader = path.join(here, 'sea-rfc-loader.cjs');
  const coreVersion = JSON.parse(
    fs.readFileSync(path.join(stageDir, 'node_modules/@mcp-abap-adt/core/package.json'), 'utf8'),
  ).version;
  const result = await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    logLevel: 'warning',
    plugins: [
      {
        name: 'sea-rfc-addon',
        setup(b) {
          b.onResolve({ filter: /^node-gyp-build$/ }, () => ({ path: loader }));
          // core reads its version from ../package.json beside dist/ at run time;
          // a single executable has no such file, so the version is fixed at build.
          b.onLoad({ filter: /[\\/]@mcp-abap-adt[\\/]core[\\/]dist[\\/]coreVersion\.js$/ }, () => ({
            contents: `exports.CORE_VERSION = ${JSON.stringify(coreVersion)};`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  if (result.errors.length) fail('bundling failed');
  return outfile;
}

function inject({ bundleFile, addonFile, nodeBin, work, server, platform, version }) {
  const { exe, sdkLib, archive } = PLATFORMS[platform];
  const name = `${server.name}-${version}-${platform}`;
  const outDir = path.join(repo, 'dist-portable', name);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'nwrfcsdk', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'nwrfcsdk', 'lib', '.keep'), '');

  const config = path.join(work, `${server.name}.sea.json`);
  const blob = path.join(work, `${server.name}.blob`);
  fs.writeFileSync(
    config,
    JSON.stringify({
      main: bundleFile,
      output: blob,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
      assets: { 'sapnwrfc.node': addonFile },
    }),
  );
  run(nodeBin, ['--experimental-sea-config', config]);

  const target = path.join(outDir, `${server.name}${exe}`);
  fs.copyFileSync(nodeBin, target);
  if (platform === 'macos-arm64') run('codesign', ['--remove-signature', target]);
  const postject = path.join(repo, 'node_modules', 'postject', 'dist', 'cli.js');
  run(process.execPath, [
    postject, target, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', SEA_FUSE,
    ...(platform === 'macos-arm64' ? ['--macho-segment-name', 'NODE_SEA'] : []),
  ]);
  if (platform === 'macos-arm64') run('codesign', ['--sign', '-', target]);
  fs.chmodSync(target, 0o755);

  fs.writeFileSync(
    path.join(outDir, 'README.txt'),
    [
      `${server.name} ${version} — portable build for ${platform}`,
      '',
      'Nothing to install. Start it the way an MCP client starts the npm server:',
      `  ${server.name}${exe} --env-path=<your .env>`,
      '',
      'HTTP needs nothing else.',
      `RFC and SNC: copy the files of the SAP NW RFC SDK's lib/ folder into nwrfcsdk/lib/ (${sdkLib} among them),`,
      'or set SAPNWRFC_HOME to an installed SDK. SNC also needs the SNC product (SAP Secure Login Client).',
      '',
      'Documentation: https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/INSTALLATION.md',
      '',
    ].join('\n'),
  );

  const archiveFile = path.join(repo, 'dist-portable', `${name}.${archive}`);
  fs.rmSync(archiveFile, { force: true });
  const cwd = path.join(repo, 'dist-portable');
  if (archive === 'tar.gz') run('tar', ['-czf', archiveFile, name], { cwd });
  else run('tar', ['-a', '-cf', archiveFile, name], { cwd });
  const size = (f) => `${(fs.statSync(f).size / 1048576).toFixed(1)} MB`;
  console.log(`portable: ${target} (${size(target)}), ${archiveFile} (${size(archiveFile)})`);
}

const opts = parseArgs(process.argv.slice(2));
const work = path.join(os.tmpdir(), 'mcp-abap-adt-portable', opts.version, opts.platform);
fs.mkdirSync(work, { recursive: true });
const { dir: stageDir, sdk } = stage(work, opts.version);
const addonFile = addon(stageDir, sdk, work, opts.platform);
const { bin: nodeBin } = await nodeBinary(work, opts.platform);
const servers = opts.which === 'all' ? ['full', 'compact'] : [opts.which];
for (const key of servers) {
  const server = SERVERS[key];
  const bundleFile = await bundle(work, stageDir, server);
  inject({ bundleFile, addonFile, nodeBin, work, server, platform: opts.platform, version: opts.version });
}
