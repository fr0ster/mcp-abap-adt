'use strict';
// Arguments and platform table of scripts/portable/build.mjs (and smoke.mjs),
// CommonJS so the unit tests can load them.
const SERVERS = {
  full: { name: 'mcp-abap-adt', pkg: '@mcp-abap-adt/core' },
  compact: { name: 'mcp-abap-adt-compact', pkg: '@mcp-abap-adt/compact' },
};

const PLATFORMS = {
  'linux-x64': {
    node: 'linux-x64',
    ext: 'tar.xz',
    exe: '',
    sdkLib: 'libsapnwrfc.so',
    sdkExt: '.so',
    archive: 'tar.gz',
  },
  'win-x64': {
    node: 'win-x64',
    ext: 'zip',
    exe: '.exe',
    sdkLib: 'sapnwrfc.dll',
    sdkExt: '.dll',
    archive: 'zip',
  },
  'macos-arm64': {
    node: 'darwin-arm64',
    ext: 'tar.gz',
    exe: '',
    sdkLib: 'libsapnwrfc.dylib',
    sdkExt: '.dylib',
    archive: 'zip',
  },
};

// A semver or an npm dist-tag: the value reaches npm as `<package>@<version>`.
const VERSION = /^(\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?|[a-z][a-z0-9-]*)$/;

function currentPlatform(platform = process.platform, arch = process.arch) {
  const key = { linux: 'linux', win32: 'win', darwin: 'macos' }[platform];
  return `${key}-${arch}`;
}

// The server and the platform are chosen by the command; anything this
// version cannot build is refused here, before anything is installed.
function parseArgs(argv, here = currentPlatform()) {
  const opts = { which: 'all', platform: here };
  for (const arg of argv) {
    if (arg.startsWith('--platform=')) opts.platform = arg.slice(11);
    else if (arg.startsWith('--version=')) opts.version = arg.slice(10);
    else if (!arg.startsWith('--')) opts.which = arg;
    else throw new Error(`unknown option ${arg}`);
  }
  if (!['full', 'compact', 'all'].includes(opts.which)) {
    throw new Error(`unknown server "${opts.which}": full, compact or all`);
  }
  if (opts.version !== undefined && !VERSION.test(opts.version)) {
    throw new Error(`"${opts.version}" is not a version: a semver (1.2.3) or a dist-tag (latest)`);
  }
  if (!PLATFORMS[here] && opts.platform === here) {
    throw new Error(
      `this machine (${here}) cannot build portable executables: ${Object.keys(PLATFORMS).join(', ')}`,
    );
  }
  if (!PLATFORMS[opts.platform]) {
    throw new Error(
      `unknown platform "${opts.platform}": ${Object.keys(PLATFORMS).join(', ')}`,
    );
  }
  if (opts.platform !== here) {
    throw new Error(
      `cross-building ${opts.platform} on ${here} needs the target's prebuilt RFC addon (sap-rfc-lite prebuilds) — not in this version`,
    );
  }
  return opts;
}

module.exports = { SERVERS, PLATFORMS, currentPlatform, parseArgs };
