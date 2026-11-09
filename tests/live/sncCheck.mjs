// The SNC live check of RFC plan step 21 — a TEMPORARY hand-run script:
// it is deleted with `sncCheckRules.ts` at step 22, once the run is recorded.
//
// What it does, stopping at the first failure with a plain reason:
//   1. preflight: Node, platform, HEAD; SAPNWRFC_HOME (informational only);
//      the sap-rfc-lite binding loads (the one check); the SNC library, found as
//      SncLogonProvider's default locator finds it;
//   2. the .env: key NAMES only, never a value; the SNC destination's keys;
//   3. the realm check: an unauthenticated GET of the ADT discovery must
//      answer 401 with exactly the expected realm (no logon) — --realm when
//      given, else "SAP NetWeaver Application Server
//      [<SAP_MASTER_SYSTEM>/<SAP_CLIENT>]" derived from the .env (the realm
//      measured on premise) —,
//      at --realm-url when given,
//      else at http://<SAP_ASHOST>:80<SAP_SYSNR> derived from the .env (the
//      ICM's default HTTP port; a message-server .env needs --realm-url);
//   4. `npm run build` when dist is missing or older than src;
//   5. `npm run test:live-connection` on this .env (the live connection test:
//      the installed server started over stdio, tools listed, one tool
//      called), its output streamed.
// Everything also goes to live-snc-<timestamp>.log in the current directory,
// ending with a summary: each step, and the live run's test counts.
//
// Prerequisites on the machine:
//   - Node.js 22 or 24, and this checkout at refactor/static-types with
//     `npm ci --ignore-scripts` run;
//   - the NW RFC SDK or SAP GUI's sapnwrfc.dll (Windows), loadable by the
//     process: on Windows SAP GUI's 64-bit sapnwrfc.dll in System32 needs
//     nothing set (SAPNWRFC_HOME is not needed); else the SDK's lib directory
//     on the library path — Windows %SAPNWRFC_HOME%\lib on PATH, Linux on
//     LD_LIBRARY_PATH, macOS on DYLD_LIBRARY_PATH;
//   - the Secure Login Client installed, logged on, with a valid ticket;
//   - the destination's .env: SAP_CONNECTION_TYPE=rfc, SAP_AUTH_TYPE=snc,
//     SAP_SYSTEM_TYPE=onprem, SAP_ASHOST + SAP_SYSNR (or SAP_MSHOST with
//     SAP_MSSERV or SAP_SYSID and SAP_GROUP), SAP_CLIENT, SAP_LANGUAGE,
//     SAP_SNC_PARTNERNAME, SAP_MASTER_SYSTEM (for the expected realm);
//     no SAP_URL, SAP_USERNAME, SAP_PASSWORD
//     (SAP_RESPONSIBLE too, where the system answers no systeminformation).
//
// The command (any shell — PowerShell, cmd, bash, zsh):
//   npm run test:live-snc -- --env <path to .env>
// Overrides, each optional: --realm <expected realm> (when the .env states no
// SAP_MASTER_SYSTEM, or the system's realm has another form), and --realm-url
// <http(s) URL of the same system> (when its HTTP port is not 80<SAP_SYSNR>,
// or the .env names a message server).
// Run it from any directory: the log, live-snc-<timestamp>.log, is written
// to the directory the command is typed in, and a relative --env is read from
// there. Upload the log it names at the end.
//
// It prints no value of the .env, no cookie, no token and no password: key
// names and local paths only. It has no timeout of its own: stop it with
// Ctrl+C if the live run hangs.

import { spawn, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import {
  checkSncEnv,
  expectedRealmFor,
  parseSncCheckArguments,
  realmCheckUrlFor,
  statedKeyNames,
} from './sncCheckRules.ts';
import {
  realmCheck,
  realmCheckUrlOf,
} from '../../src/__tests__/integration/helpers/realmCheck.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requireHere = createRequire(import.meta.url);

/**
 * Where the owner typed the command: `npm run` starts a script in the
 * package's directory and names the caller's in INIT_CWD. The log goes
 * there, and a relative --env is read from there.
 */
const HERE = process.env.INIT_CWD ?? process.cwd();
const stamp = new Date().toISOString().split(':').join('-').split('.').join('-');
const LOG = path.resolve(HERE, `live-snc-${stamp}.log`);

/** A line to the console and the log. */
function say(line = '') {
  process.stdout.write(`${line}\n`);
  fs.appendFileSync(LOG, `${line}\n`);
}

const steps = [];
let liveCounts = 'not run';

function summary() {
  say('');
  say('=== Summary');
  for (const { name, result } of steps) say(`  ${result.padEnd(4)}  ${name}`);
  say(`  live run tests: ${liveCounts}`);
  say(`  log: ${LOG}`);
}

/** Ends the run at a failed step, with its plain reason. */
function fail(name, reason) {
  say(`FAIL: ${reason}`);
  steps.push({ name, result: 'FAIL' });
  summary();
  process.exit(1);
}

function pass(name) {
  steps.push({ name, result: 'pass' });
}

/** The error's words, for a local failure (no secret is involved). */
function wordsOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// --- Arguments --------------------------------------------------------------
let args;
try {
  args = parseSncCheckArguments(process.argv.slice(2));
} catch (error) {
  fs.writeFileSync(LOG, '');
  fail('arguments', wordsOf(error));
}
const envPath = path.resolve(HERE, args.env);
/** The realm and the realm-check URL step 3 settles on, handed on to the live run. */
let realm = '';
let realmUrl = '';
fs.writeFileSync(LOG, '');
say(`SNC live check — log: ${LOG}`);

// --- 1. Preflight -----------------------------------------------------------
{
  const name = '1. preflight';
  say('');
  say(`=== ${name}`);
  say(`node ${process.version}, ${process.platform}-${process.arch}`);
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO,
      encoding: 'utf8',
    }).trim();
    say(`HEAD ${head}`);
  } catch (error) {
    fail(name, `git rev-parse failed: ${wordsOf(error)}`);
  }
  // Informational: SAP GUI's sapnwrfc.dll on Windows needs no SAPNWRFC_HOME.
  const home = process.env.SAPNWRFC_HOME;
  if (home === undefined || home.trim() === '') {
    say('SAPNWRFC_HOME not set (informational: the RFC library is found on the loader\'s search path)');
  } else {
    const lib = path.join(home, 'lib');
    say(
      `SAPNWRFC_HOME ${home} (lib directory ${fs.existsSync(lib) ? 'present' : 'absent'}; informational)`,
    );
  }
  try {
    const { binding } = requireHere('@mcp-abap-adt/sap-rfc-lite');
    say(`sap-rfc-lite binding loaded: ${JSON.stringify(binding.bindingVersions)}`);
  } catch (error) {
    fail(
      name,
      `the sap-rfc-lite binding did not load: ${wordsOf(error)}\n` +
        'Hint (docs/installation/RFC_SETUP.md): the SAP NW RFC library must be loadable by this process — ' +
        "on Windows SAP GUI's 64-bit sapnwrfc.dll in System32 (where.exe sapnwrfc.dll lists it), or the SDK with %SAPNWRFC_HOME%\\lib on PATH; " +
        'on Linux the SDK lib directory on LD_LIBRARY_PATH, on macOS on DYLD_LIBRARY_PATH; then open a new terminal',
    );
  }
  if (!fs.existsSync(envPath)) fail(name, `the .env file does not exist: ${envPath}`);
  const explicitLib = dotenv.parse(fs.readFileSync(envPath, 'utf8')).SAP_SNC_LIB;
  try {
    const { DefaultSncLibraryLocator, nodeSncSystem } = requireHere(
      '@mcp-abap-adt/auth-providers',
    );
    const located = await new DefaultSncLibraryLocator(
      nodeSncSystem(),
      explicitLib === undefined || explicitLib.trim() === '' ? undefined : explicitLib.trim(),
    ).locate();
    say(`SNC library: ${located.path} (${located.archs.join(', ')})`);
  } catch (error) {
    const reported = error !== null && typeof error === 'object' ? error.error : undefined;
    const detail =
      reported === undefined
        ? wordsOf(error)
        : `${reported.reason} ${JSON.stringify({ facts: reported.facts, diagnostics: reported.diagnostics })}`;
    fail(name, `no usable SNC library was found (set SAP_SNC_LIB in the .env): ${detail}`);
  }
  pass(name);
}

// --- 2. The .env ------------------------------------------------------------
{
  const name = '2. .env check';
  say('');
  say(`=== ${name}`);
  say(`file: ${envPath}`);
  const env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  say(`keys stated: ${statedKeyNames(env).join(', ')}`);
  const faults = checkSncEnv(env);
  if (faults.length > 0) {
    for (const { key, fix } of faults) say(`  ${key}: ${fix}`);
    fail(name, `the .env is not an SNC destination of this release (${faults.length} key(s) above); nothing was sent`);
  }
  pass(name);
}

// --- 3. Realm check ---------------------------------------------------------
{
  const name = '3. realm check';
  say('');
  say(`=== ${name}`);
  try {
    const stated = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    const expected = expectedRealmFor(args, stated);
    realm = expected.realm;
    say(
      `expected realm: ${realm} (${expected.derived ? 'derived from SAP_MASTER_SYSTEM and SAP_CLIENT' : 'from --realm'})`,
    );
    const target = realmCheckUrlFor(args, stated);
    realmUrl = target.url;
    const url = realmCheckUrlOf('rfc', undefined, target.url, '--realm-url');
    say(
      `realm-check URL: ${url} (${target.derived ? 'derived from SAP_ASHOST and SAP_SYSNR' : 'from --realm-url'})`,
    );
    say('unauthenticated GET of the ADT discovery there, expecting 401 with the expected realm');
    await realmCheck('onprem', url, realm, { jwt: undefined });
  } catch (error) {
    fail(name, `${wordsOf(error)} — nothing else was sent`);
  }
  say('401 with the expected realm');
  pass(name);
}

/** The npm the owner ran this with: its own CLI under this Node, no shell. */
function npmCommand(npmArgs) {
  const cli = process.env.npm_execpath;
  if (cli === undefined || cli === '') {
    fail('npm', 'start this through `npm run test:live-snc -- …`, which names npm to the script');
  }
  return [process.execPath, [cli, ...npmArgs]];
}

/** Runs npm with `npmArgs` and `env`, streaming to the console and the log; answers the exit code and the output. */
function runNpm(npmArgs, env) {
  const [command, commandArgs] = npmCommand(npmArgs);
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(command, commandArgs, {
      cwd: REPO,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const relay = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      fs.appendFileSync(LOG, text);
    };
    child.stdout.on('data', relay);
    child.stderr.on('data', relay);
    child.on('error', (error) => resolve({ code: 1, output: `${output}\n${wordsOf(error)}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

/** The newest modification time under `dir` (0 when absent). */
function newestUnder(dir) {
  if (!fs.existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      newest = Math.max(newest, newestUnder(full));
    } else {
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  }
  return newest;
}

// --- 4. Build if needed -----------------------------------------------------
{
  const name = '4. build';
  say('');
  say(`=== ${name}`);
  const built = path.join(REPO, 'dist', 'index.js');
  const stale =
    !fs.existsSync(built) ||
    !fs.existsSync(path.join(REPO, 'server', 'dist')) ||
    !fs.existsSync(path.join(REPO, 'server-runtime', 'dist')) ||
    newestUnder(path.join(REPO, 'src')) > fs.statSync(built).mtimeMs ||
    newestUnder(path.join(REPO, 'server-runtime', 'src')) > fs.statSync(built).mtimeMs;
  if (stale) {
    say('dist is missing or older than src: npm run build');
    const { code } = await runNpm(['run', 'build'], {});
    if (code !== 0) fail(name, `npm run build exited ${code}`);
  } else {
    say('dist is current: no build');
  }
  pass(name);
}

// --- 5. The live connection test --------------------------------------------
{
  const name = '5. live connection test';
  say('');
  say(`=== ${name}`);
  const { code, output } = await runNpm(['run', 'test:live-connection'], {
    MCP_LIVE_ENV_PATHS: envPath,
    MCP_LIVE_EXPECTED_REALMS: realm,
    MCP_LIVE_REALM_CHECK_URLS: realmUrl,
  });
  const line = output.split('\n').find((each) => each.trim().startsWith('Tests:'));
  liveCounts = line === undefined ? 'no Jest summary line' : line.trim();
  if (code !== 0) fail(name, `npm run test:live-connection exited ${code}`);
  pass(name);
}

summary();
