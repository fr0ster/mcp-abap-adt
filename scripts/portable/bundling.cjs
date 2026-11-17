'use strict';
// How scripts/portable/build.mjs bundles a server, CommonJS so the unit tests
// can load it: the esbuild options, and the version modules fixed in the
// stage before bundling. No esbuild plugin, so no filter pattern.
const fs = require('node:fs');
const path = require('node:path');

// The modules that read their version from ../package.json beside dist/ at
// run time — a single executable has no such file — by package, with the
// contents they get, fixed from that package's own manifest.
const VERSION_MODULES = {
  // core: its version and its name.
  '@mcp-abap-adt/core': {
    file: 'dist/coreVersion.js',
    contents: (manifest) =>
      `exports.CORE_VERSION = ${JSON.stringify(manifest.version)};\nexports.CORE_PACKAGE = ${JSON.stringify(manifest.name)};`,
  },
  // server-runtime (19.2.0 and later): its version.
  '@mcp-abap-adt/server-runtime': {
    file: 'dist/runtimeVersion.js',
    contents: (manifest) =>
      `exports.RUNTIME_VERSION = ${JSON.stringify(manifest.version)};`,
  },
};

// Every package directory installed under `root`, nested ones included.
function packageDirectories(root, out = []) {
  const modules = path.join(root, 'node_modules');
  let entries;
  try {
    entries = fs.readdirSync(modules, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(modules, entry.name);
    const packages = entry.name.startsWith('@')
      ? fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((scoped) => scoped.isDirectory())
          .map((scoped) => path.join(dir, scoped.name))
      : [dir];
    for (const pkg of packages) {
      out.push(pkg);
      packageDirectories(pkg, out);
    }
  }
  return out;
}

// Writes each version module of the stage — every installed copy — with its
// version fixed from its own manifest; the files written, in order.
function fixVersionModules(stageDir) {
  const written = [];
  for (const dir of packageDirectories(stageDir)) {
    let manifest;
    try {
      manifest = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      );
    } catch {
      continue;
    }
    const fixed = VERSION_MODULES[manifest.name];
    if (fixed === undefined) continue;
    const file = path.join(dir, fixed.file);
    if (!fs.existsSync(file)) continue;
    fs.writeFileSync(file, fixed.contents(manifest));
    written.push(file);
  }
  return written;
}

// The esbuild options of one server's bundle: `node-gyp-build`, wherever it
// is required, is the embedded-addon loader.
function bundleOptions({ entry, outfile, loader }) {
  return {
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    logLevel: 'warning',
    alias: { 'node-gyp-build': loader },
  };
}

module.exports = { fixVersionModules, bundleOptions };
