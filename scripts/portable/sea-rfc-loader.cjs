'use strict';
// Stands in for `node-gyp-build` inside a portable executable (bundled by
// scripts/portable/build.mjs). `@mcp-abap-adt/sap-rfc-lite` asks node-gyp-build
// for its addon relative to its package directory, which a single executable
// does not have; this loads the addon embedded as a SEA asset instead.
//
// The addon is written next to the SAP NW RFC SDK libraries the user supplied
// and loaded from there, so the SDK resolves beside it: an rpath of $ORIGIN /
// @loader_path on Linux and macOS, the folder prepended to PATH on Windows.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SDK_LIBRARY = {
  win32: 'sapnwrfc.dll',
  darwin: 'libsapnwrfc.dylib',
  linux: 'libsapnwrfc.so',
}[process.platform];

function sdkLibDir() {
  const home = process.env.SAPNWRFC_HOME?.trim();
  if (home) return path.join(home, 'lib');
  return path.join(path.dirname(process.execPath), 'nwrfcsdk', 'lib');
}

let loaded;

module.exports = function loadEmbeddedAddon() {
  if (loaded) return loaded;
  const sea = require('node:sea');
  if (!sea.isSea()) {
    throw new Error('the embedded RFC addon is only available in a portable executable');
  }
  const dir = sdkLibDir();
  if (!SDK_LIBRARY || !fs.existsSync(path.join(dir, SDK_LIBRARY))) {
    throw new Error(
      `RFC needs the SAP NW RFC SDK: copy the files of the SDK's lib/ folder into ${dir}` +
        (process.env.SAPNWRFC_HOME ? ' (SAPNWRFC_HOME is set)' : '') +
        ` — ${SDK_LIBRARY ?? 'this platform'} was not found there`,
    );
  }
  const addon = Buffer.from(sea.getRawAsset('sapnwrfc.node'));
  const file = path.join(dir, 'sapnwrfc.node');
  const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
  let current;
  try {
    current = fs.readFileSync(file);
  } catch {
    current = undefined;
  }
  if (!current || digest(current) !== digest(addon)) {
    try {
      fs.writeFileSync(file, addon);
    } catch (error) {
      throw new Error(
        `the RFC addon could not be written into ${dir}: ${error.code ?? error.message} — the folder must be writable`,
      );
    }
  }
  if (process.platform === 'win32') {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ''}`;
  }
  const module_ = { exports: {} };
  process.dlopen(module_, file);
  loaded = module_.exports;
  return loaded;
};
