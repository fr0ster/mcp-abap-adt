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
    sdkHome
      ? `SAPNWRFC_HOME points at ${sdkHome}, which does not exist.`
      : 'SAPNWRFC_HOME is not set.',
  );
  console.error('\nPoint it at the unpacked nwrfcsdk directory:');
  console.error('  PowerShell:  $env:SAPNWRFC_HOME = "C:\\sap\\nwrfcsdk"');
  console.error('  cmd.exe:     set SAPNWRFC_HOME=C:\\sap\\nwrfcsdk');
  console.error(
    '\nIn PowerShell `set` is an alias for Set-Variable and does NOT set an\n' +
      'environment variable — use the $env: form above.',
  );
  process.exit(1);
}

const sdkLib = path.join(sdkHome, 'lib');
if (!fs.existsSync(sdkLib)) {
  console.error(`${sdkLib} not found — is SAPNWRFC_HOME pointing one level too high?`);
  console.error('It should be the directory that contains lib/, bin/ and include/.');
  process.exit(1);
}

// A Linux SDK in a win32 bundle produces a file that fails on every
// consultant's machine, so catch the wrong download here rather than there.
const expectedLib = { win32: 'sapnwrfc.dll', darwin: 'libsapnwrfc.dylib' }[process.platform] ?? 'libsapnwrfc.so';
if (!fs.existsSync(path.join(sdkLib, expectedLib))) {
  console.error(
    `${expectedLib} is missing from ${sdkLib}.\n\n` +
      `This looks like an SDK for a different operating system. The bundle is\n` +
      `built for ${process.platform}, so you need the ${process.platform} download of the\n` +
      `SAP NW RFC SDK — a Linux SDK (libsapnwrfc.so) cannot go into a Windows\n` +
      `bundle. Get the matching one from the SAP Software Download Center.\n\n` +
      `Found instead: ${fs.readdirSync(sdkLib).slice(0, 8).join(', ')}`,
  );
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
const installEnv = {
  ...process.env,
  SAPNWRFC_HOME: sdkHome,
  LD_LIBRARY_PATH: `${sdkLib}${path.delimiter}${process.env.LD_LIBRARY_PATH || ''}`,
  PATH: `${sdkLib}${path.delimiter}${process.env.PATH || ''}`,
};

// --foreground-scripts so the native build's output is visible; without it a
// failed compile scrolls past as a single npm warning.
run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--foreground-scripts'], {
  cwd: STAGE,
  env: installEnv,
});

step('verifying the bundle can actually do RFC');

const rfcLite = path.join(STAGE, 'node_modules', '@mcp-abap-adt', 'sap-rfc-lite');
if (!fs.existsSync(rfcLite)) {
  console.error(
    '\nsap-rfc-lite is missing — it is an optionalDependency, so npm dropped it\n' +
      'silently when its native build failed. Reinstalling it directly to show\n' +
      'the real error:\n',
  );

  // Not optional when named explicitly, so this fails loudly with the cause.
  try {
    run(
      'npm',
      [
        'install',
        '@mcp-abap-adt/sap-rfc-lite',
        '--no-save',
        '--no-audit',
        '--no-fund',
        '--foreground-scripts',
      ],
      { cwd: STAGE, env: installEnv },
    );
  } catch {
    // the output above is the point
  }

  if (!fs.existsSync(rfcLite)) {
    console.error(
      '\n' +
        'sap-rfc-lite ships no prebuilt binaries, so it is compiled from source\n' +
        'on install. That needs a C++ toolchain:\n' +
        '\n' +
        '  Windows:  Visual Studio Build Tools with the "Desktop development\n' +
        '            with C++" workload, plus Python 3.\n' +
        '            winget install Microsoft.VisualStudio.2022.BuildTools\n' +
        '            winget install Python.Python.3.12\n' +
        '            Then open a NEW terminal so PATH picks them up.\n' +
        '  macOS:    xcode-select --install\n' +
        '  Linux:    build-essential and python3\n' +
        '\n' +
        'The compiler also needs the SDK headers, which is why SAPNWRFC_HOME\n' +
        `must point at a ${process.platform} SDK — currently ${sdkHome}\n`,
    );
    process.exit(1);
  }

  console.log('\nsap-rfc-lite built on the retry — continuing.');
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
