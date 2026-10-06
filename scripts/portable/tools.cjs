'use strict';
// How the portable build and smoke check start host tools, CommonJS so the unit
// tests can load it.
const fs = require('node:fs');
const path = require('node:path');

// npm run through node and npm-cli.js, so no shell is needed: on Windows npm is
// a .cmd, which Node only starts through a shell — where the build's arguments
// would be parsed by cmd.exe.
function npmCommand({
  env = process.env,
  execPath = process.execPath,
  platform = process.platform,
  exists = fs.existsSync,
} = {}) {
  const fromNpm = env.npm_execpath;
  if (fromNpm && /\.c?js$/.test(fromNpm) && exists(fromNpm)) {
    return { cmd: execPath, args: [fromNpm] };
  }
  const beside = path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (platform === 'win32' && exists(beside)) return { cmd: execPath, args: [beside] };
  return { cmd: 'npm', args: [] };
}

// Windows' own bsdtar reads and writes zip; a GNU tar earlier on the PATH (Git
// Bash) does neither.
function tarCommand(platform = process.platform, env = process.env) {
  if (platform !== 'win32') return 'tar';
  return path.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
}

// A search path without the folders that hold an SDK library, so the smoke
// check proves the archive's own SDK and not one installed elsewhere.
function withoutSdk(value, library, exists = fs.existsSync) {
  if (value === undefined) return undefined;
  return value
    .split(path.delimiter)
    .filter((entry) => !entry || !exists(path.join(entry, library)))
    .join(path.delimiter);
}

// The two tools the build itself runs, at the ranges the repository declares,
// installed into the build cache rather than taken from the checkout: building
// then needs only the production dependencies (`npm ci --omit=dev`), not the
// linter, the test runner and the rest of devDependencies.
const BUILD_TOOLS = ['esbuild', 'postject'];

function buildToolSpecs(manifest) {
  const dev = manifest.devDependencies || {};
  return BUILD_TOOLS.map((name) => {
    if (!dev[name]) throw new Error(`package.json declares no ${name} in devDependencies`);
    return `${name}@${dev[name]}`;
  });
}

const TOOLS_MARK = '.tools.json';

function toolsInstalled(dir, specs) {
  try {
    const marked = JSON.parse(fs.readFileSync(path.join(dir, TOOLS_MARK), 'utf8'));
    return JSON.stringify(marked) === JSON.stringify(specs);
  } catch {
    return false;
  }
}

function markToolsInstalled(dir, specs) {
  fs.writeFileSync(path.join(dir, TOOLS_MARK), `${JSON.stringify(specs)}\n`);
}

module.exports = { npmCommand, tarCommand, withoutSdk, buildToolSpecs, toolsInstalled, markToolsInstalled };
