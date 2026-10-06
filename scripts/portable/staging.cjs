'use strict';
// The staging cache of scripts/portable/build.mjs: the published servers
// installed from npm, with the RFC addon compiled against the builder's SDK.
// CommonJS so the unit tests can load it.
const fs = require('node:fs');
const path = require('node:path');

// SAPNWRFC_HOME as binding.gyp reads it — raw, so the RUNPATH below is the
// string the addon carries. Relative paths do not resolve from node-gyp's
// working directory, so the addon would silently not be built.
function sdkHome(env) {
  const home = env.SAPNWRFC_HOME?.trim();
  if (!home) {
    throw new Error(
      'set SAPNWRFC_HOME to the SAP NW RFC SDK of this platform: the RFC addon is compiled against it',
    );
  }
  if (!path.isAbsolute(home)) {
    throw new Error(`SAPNWRFC_HOME must be an absolute path (got "${home}")`);
  }
  return home;
}

// binding.gyp links with `-Wl,-rpath,<(nwrfcsdk_dir)/lib`, nwrfcsdk_dir being
// SAPNWRFC_HOME unchanged: `/opt/sdk/` gives `/opt/sdk//lib`.
function addonRpath(home) {
  return `${home}/lib`;
}

function builtAddon(dir) {
  return path.join(dir, 'node_modules/@mcp-abap-adt/sap-rfc-lite/build/Release/sapnwrfc.node');
}

const markerOf = (dir) => path.join(dir, '.staged');

// Staged for this version and this SDK, and the addon is really there.
function isStaged(dir, { version, sdk }) {
  try {
    const staged = JSON.parse(fs.readFileSync(markerOf(dir), 'utf8'));
    return staged.version === version && staged.sdk === sdk && fs.existsSync(builtAddon(dir));
  } catch {
    return false;
  }
}

// Written only once the addon exists: a run without a compiler must not leave a
// cache that the next run, with one, would trust.
function markStaged({ dir, version, sdk }) {
  if (!fs.existsSync(builtAddon(dir))) {
    throw new Error(
      'the RFC addon was not built: check SAPNWRFC_HOME and the C++ toolchain (npm left the optional dependency out)',
    );
  }
  fs.writeFileSync(markerOf(dir), JSON.stringify({ version, sdk }));
}

module.exports = { sdkHome, addonRpath, builtAddon, isStaged, markStaged };
