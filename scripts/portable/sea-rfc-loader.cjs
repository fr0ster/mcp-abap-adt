'use strict';
// Stands in for `node-gyp-build` inside a portable executable (bundled by
// scripts/portable/build.mjs). `@mcp-abap-adt/sap-rfc-lite` asks node-gyp-build
// for its addon relative to its package directory, which a single executable
// does not have; this loads the addon embedded as a SEA asset instead.
//
// The addon is loaded from the SAP NW RFC SDK folder — `nwrfcsdk/lib` beside the
// executable, where the build put the SDK and the addon, or SAPNWRFC_HOME/lib —
// so the SDK resolves beside it: an rpath of $ORIGIN / @loader_path on Linux and
// macOS, the folder prepended to PATH on Windows. It is written there only when
// the folder does not already hold the identical addon.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LIBRARY = {
  win32: 'sapnwrfc.dll',
  darwin: 'libsapnwrfc.dylib',
  linux: 'libsapnwrfc.so',
};

function sdkLibraryName(platform) {
  return LIBRARY[platform];
}

function resolveSdkLibDir({ env, execPath }) {
  const home = env.SAPNWRFC_HOME?.trim();
  if (home) return path.join(home, 'lib');
  return path.join(path.dirname(execPath), 'nwrfcsdk', 'lib');
}

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function prepareAddon({ dir, addon, platform, fromEnv = false, fsImpl = fs }) {
  const library = sdkLibraryName(platform);
  if (!library || !fsImpl.existsSync(path.join(dir, library))) {
    throw new Error(
      `RFC needs the SAP NW RFC SDK: copy the files of the SDK's lib/ folder into ${dir}` +
        (fromEnv ? ' (SAPNWRFC_HOME is set)' : '') +
        ` — ${library ?? 'this platform'} was not found there`,
    );
  }
  const file = path.join(dir, 'sapnwrfc.node');
  let current;
  try {
    current = fsImpl.readFileSync(file);
  } catch {
    current = undefined;
  }
  if (!current || digest(current) !== digest(addon)) {
    try {
      fsImpl.writeFileSync(file, addon);
    } catch (error) {
      throw new Error(
        `the RFC addon could not be written into ${dir}: ${error.code ?? error.message} — the folder must be writable`,
      );
    }
  }
  return file;
}

let loaded;

function loadEmbeddedAddon() {
  if (loaded) return loaded;
  const sea = require('node:sea');
  if (!sea.isSea()) {
    throw new Error('the embedded RFC addon is only available in a portable executable');
  }
  const dir = resolveSdkLibDir({ env: process.env, execPath: process.execPath });
  const file = prepareAddon({
    dir,
    addon: Buffer.from(sea.getRawAsset('sapnwrfc.node')),
    platform: process.platform,
    fromEnv: Boolean(process.env.SAPNWRFC_HOME?.trim()),
  });
  if (process.platform === 'win32') {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ''}`;
  }
  const module_ = { exports: {} };
  process.dlopen(module_, file);
  loaded = module_.exports;
  return loaded;
}

module.exports = loadEmbeddedAddon;
module.exports.sdkLibraryName = sdkLibraryName;
module.exports.resolveSdkLibDir = resolveSdkLibDir;
module.exports.prepareAddon = prepareAddon;
