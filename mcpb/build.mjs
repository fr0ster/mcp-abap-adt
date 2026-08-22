#!/usr/bin/env node
/**
 * Build the Claude Desktop bundle (.mcpb).
 *
 * MUST run on the platform the bundle targets — it embeds a compiled RFC
 * binary (sap-rfc-lite) and the SAP NW RFC SDK libraries, both of which are
 * platform-specific. manifest.json declares win32, so build it on Windows.
 *
 *   set SAPNWRFC_HOME=C:\path\to\nwrfcsdk
 *   npm run build:mcpb          (from the repository root)
 *   node build.mjs              (from inside mcpb/)
 *
 * Output: mcpb/sap-abap-adt.mcpb — hand that single file to a consultant.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STAGE = path.join(HERE, 'build');
const REPO = path.dirname(HERE);

const SOURCE =
  process.env.MCPB_SOURCE || 'git+https://github.com/anggakharisma/mcp-abap-adt.git';

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  // npm/npx are .cmd shims on Windows, so they need a shell — but a shell does
  // no quoting for us, and paths like C:\Users\First Last\... would split.
  const shell = process.platform === 'win32';
  const finalArgs = shell
    ? args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))
    : args;

  execFileSync(command, finalArgs, { stdio: 'inherit', shell, ...options });
}

function step(message) {
  console.log(`\n=== ${message} ===`);
}

// ---------------------------------------------------------------------------

step('checking the SAP NW RFC SDK');

const sdkHome = process.env.SAPNWRFC_HOME;
if (!sdkHome || !fs.existsSync(sdkHome)) {
  console.error(
    'SAPNWRFC_HOME is not set or does not exist.\n' +
      'Point it at the unpacked nwrfcsdk directory, e.g.\n' +
      '  set SAPNWRFC_HOME=C:\\sap\\nwrfcsdk',
  );
  process.exit(1);
}

const sdkLib = path.join(sdkHome, 'lib');
if (!fs.existsSync(sdkLib)) {
  console.error(`${sdkLib} not found — is SAPNWRFC_HOME pointing one level too high?`);
  process.exit(1);
}

step('preparing a clean staging directory');

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

fs.copyFileSync(path.join(HERE, 'manifest.json'), path.join(STAGE, 'manifest.json'));
fs.cpSync(path.join(HERE, 'server'), path.join(STAGE, 'server'), { recursive: true });

const icon = path.join(REPO, 'logo.png');
if (fs.existsSync(icon)) {
  fs.copyFileSync(icon, path.join(STAGE, 'icon.png'));
}

fs.writeFileSync(
  path.join(STAGE, 'package.json'),
  `${JSON.stringify(
    {
      name: 'sap-abap-adt-mcpb',
      version: JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'))
        .version,
      private: true,
      dependencies: { '@mcp-abap-adt/core': SOURCE },
    },
    null,
    2,
  )}\n`,
);

step('installing the server and its dependencies');

// The install compiles sap-rfc-lite against the SDK and runs the SAProuter
// postinstall, so SAPNWRFC_HOME must be visible to it.
run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: STAGE,
  env: {
    ...process.env,
    SAPNWRFC_HOME: sdkHome,
    LD_LIBRARY_PATH: `${sdkLib}${path.delimiter}${process.env.LD_LIBRARY_PATH || ''}`,
  },
});

step('verifying the bundle can actually do RFC');

const rfcLite = path.join(STAGE, 'node_modules', '@mcp-abap-adt', 'sap-rfc-lite');
if (!fs.existsSync(rfcLite)) {
  console.error(
    'sap-rfc-lite is missing from the bundle. It is an optionalDependency, so\n' +
      'npm dropped it silently when the native build failed. RFC systems would\n' +
      'not work. Check that SAPNWRFC_HOME points at a matching SDK for this\n' +
      'platform and architecture, then rebuild.',
  );
  process.exit(1);
}

const rfcConnection = path.join(
  STAGE,
  'node_modules',
  '@mcp-abap-adt',
  'connection',
  'dist',
  'connection',
  'RfcAbapConnection.js',
);
if (!fs.readFileSync(rfcConnection, 'utf8').includes('SAP_SAPROUTER')) {
  console.error(
    'The SAProuter fix did not get applied — postinstall scripts were probably\n' +
      'blocked. Run it by hand and rebuild:\n' +
      '  node build/node_modules/@mcp-abap-adt/core/scripts/apply-saprouter-patch.js',
  );
  process.exit(1);
}

step('embedding the SAP NW RFC SDK');

fs.cpSync(sdkHome, path.join(STAGE, 'sdk', 'nwrfcsdk'), { recursive: true });
console.log(`copied ${sdkHome}`);
console.log(
  'NOTE: the SDK is licensed by SAP to your organisation. Keep this bundle\n' +
    'inside it — do not publish it or send it to another company.',
);

step('packing');

run('npx', ['--yes', '@anthropic-ai/mcpb', 'pack', STAGE, path.join(HERE, 'sap-abap-adt.mcpb')]);

console.log(`\nDone: ${path.join(HERE, 'sap-abap-adt.mcpb')}`);
console.log('Send that file to a consultant and have them double-click it.');
