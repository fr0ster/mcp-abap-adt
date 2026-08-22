#!/usr/bin/env node
/**
 * Claude Desktop (.mcpb) entry point.
 *
 * Claude Desktop collects each person's SAP credentials through the extension
 * settings form and hands them to us as MCPB_* environment variables. The ADT
 * server itself is configured by .env files, so this wrapper:
 *
 *   1. merges the non-secret profiles in systems.json with those credentials
 *   2. writes one .env.<system> per system the person filled in, into a
 *      per-user directory outside the bundle (the bundle may be read-only, and
 *      a reinstall would wipe it)
 *   3. points MCP_SYSTEMS_PATH at that directory so ListSystems/SwitchSystem
 *      can see all of them
 *   4. puts the bundled SAP NW RFC SDK on the DLL search path
 *   5. hands over to the real launcher
 *
 * Anything written to stdout would corrupt the MCP stream, so every diagnostic
 * here goes to stderr, which Claude Desktop shows in the extension logs.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BUNDLE_DIR = process.env.MCPB_DIR || path.join(__dirname, '..');
const PROFILE_DIR = path.join(os.homedir(), '.mcp-abap-adt', 'systems');

function log(message) {
  process.stderr.write(`[sap-adt] ${message}\n`);
}

function fail(message) {
  log(message);
  process.exit(1);
}

/** Bundled NW RFC SDK — Windows resolves sapnwrfc.dll through PATH. */
function enableBundledRfcSdk() {
  const sdkHome = path.join(BUNDLE_DIR, 'sdk', 'nwrfcsdk');
  if (!fs.existsSync(sdkHome)) {
    log('no bundled RFC SDK; systems using RFC will not connect.');
    return;
  }

  const libDir = path.join(sdkHome, 'lib');
  process.env.SAPNWRFC_HOME = sdkHome;
  process.env.PATH = `${libDir}${path.delimiter}${process.env.PATH || ''}`;
  // Harmless on Windows, and lets the same bundle be tested on Linux/macOS.
  process.env.LD_LIBRARY_PATH = `${libDir}${path.delimiter}${process.env.LD_LIBRARY_PATH || ''}`;
  process.env.DYLD_LIBRARY_PATH = `${libDir}${path.delimiter}${process.env.DYLD_LIBRARY_PATH || ''}`;
}

function readSystems() {
  const file = path.join(__dirname, 'systems.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).systems || {};
  } catch (error) {
    fail(`cannot read systems.json: ${error.message}`);
  }
}

function renderEnvFile(env) {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

/**
 * Write one .env.<name> per system the person supplied credentials for.
 * Returns the names actually written.
 */
function writeProfiles(systems) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });

  // A profile removed from the settings form should stop being offered.
  for (const stale of fs.readdirSync(PROFILE_DIR)) {
    if (stale.startsWith('.env.')) {
      fs.rmSync(path.join(PROFILE_DIR, stale), { force: true });
    }
  }

  const written = [];

  for (const [name, system] of Object.entries(systems)) {
    const key = system.credentialsKey;
    const username = (process.env[`MCPB_${key}_USERNAME`] || '').trim();
    const password = process.env[`MCPB_${key}_PASSWORD`] || '';

    if (!username || !password) {
      continue; // person does not use this system
    }

    const target = path.join(PROFILE_DIR, `.env.${name}`);
    fs.writeFileSync(
      target,
      renderEnvFile({
        ...system.env,
        SAP_USERNAME: username,
        SAP_PASSWORD: password,
      }),
      { mode: 0o600 },
    );
    written.push(name);
  }

  return written;
}

function main() {
  const systems = readSystems();
  const written = writeProfiles(systems);

  if (written.length === 0) {
    fail(
      'No SAP credentials configured. Open Settings > Extensions > SAP ABAP ' +
        'ADT and fill in your user name and password for at least one system.',
    );
  }

  const requested = (process.env.MCPB_DEFAULT_SYSTEM || '').trim();
  const start = written.includes(requested) ? requested : written[0];

  if (requested && start !== requested) {
    log(
      `no credentials for "${requested}", starting on "${start}" instead. ` +
        `Ask Claude to switch systems once connected.`,
    );
  }

  enableBundledRfcSdk();

  process.env.MCP_SYSTEMS_PATH = PROFILE_DIR;
  const envPath = path.join(PROFILE_DIR, `.env.${start}`);

  log(`configured: ${written.join(', ')} — starting on ${start}`);

  // The launcher reads --env-path off process.argv and starts on require.
  process.argv = [process.argv[0], __filename, `--env-path=${envPath}`];
  require(launcherPath());
}

/**
 * Absolute path to the launcher.
 *
 * It cannot be required as '@mcp-abap-adt/core/dist/server/launcher.js' — the
 * package's `exports` map only publishes ".", "./handlers", "./utils" and
 * "./server", so that subpath is blocked. `exports` constrains package
 * specifiers, not filesystem paths, so resolve the package root and join.
 */
function launcherPath() {
  const candidates = [];

  try {
    // "." resolves to <root>/dist/index.js
    candidates.push(path.resolve(path.dirname(require.resolve('@mcp-abap-adt/core')), '..'));
  } catch {
    // fall through to the bundle layout
  }
  candidates.push(path.join(BUNDLE_DIR, 'node_modules', '@mcp-abap-adt', 'core'));

  for (const root of candidates) {
    const launcher = path.join(root, 'dist', 'server', 'launcher.js');
    if (fs.existsSync(launcher)) {
      return launcher;
    }
  }

  return fail(
    'The SAP ADT server is missing from this bundle. Reinstall the extension; ' +
      'if it keeps happening the bundle was built without its dependencies.',
  );
}

main();
