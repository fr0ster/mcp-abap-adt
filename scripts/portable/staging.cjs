'use strict';
// The staging cache of scripts/portable/build.mjs: the published servers
// installed from npm, with the RFC binding sap-rfc-lite installed for them.
// CommonJS so the unit tests can load it.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

// SAPNWRFC_HOME, raw: the SDK whose runtime libraries go into the archive, and
// the one binding.gyp compiles against when the binding is built from source.
// Relative paths do not resolve from node-gyp's working directory, so the
// addon would silently not be built.
function sdkHome(env) {
  const home = env.SAPNWRFC_HOME?.trim();
  if (!home) {
    throw new Error(
      'set SAPNWRFC_HOME to the SAP NW RFC SDK of this platform: its runtime libraries go into the archive',
    );
  }
  if (!path.isAbsolute(home)) {
    throw new Error(`SAPNWRFC_HOME must be an absolute path (got "${home}")`);
  }
  return home;
}

// The RFC binding the staged sap-rfc-lite loads, found by the package's own
// loader (node-gyp-build, resolved from the package): build/Release when it was
// compiled (`--build-from-source`, or a platform with no prebuild), else the
// prebuilt one under prebuilds/<platform>-<arch>/ that sap-rfc-lite 0.2.3 and
// later install. `undefined` when there is neither, or no package.
function stagedAddon(dir) {
  const pkg = path.join(dir, 'node_modules/@mcp-abap-adt/sap-rfc-lite');
  try {
    const resolveFrom = createRequire(path.join(pkg, 'package.json'));
    return resolveFrom('node-gyp-build').resolve(pkg);
  } catch {
    return undefined;
  }
}

const markerOf = (dir) => path.join(dir, '.staged');

// Staged for this version, this SDK and this way of getting the binding, and
// the binding is really there.
function isStaged(dir, { version, sdk, fromSource = false }) {
  try {
    const staged = JSON.parse(fs.readFileSync(markerOf(dir), 'utf8'));
    return (
      staged.version === version &&
      staged.sdk === sdk &&
      (staged.fromSource ?? false) === fromSource &&
      stagedAddon(dir) !== undefined
    );
  } catch {
    return false;
  }
}

// Written only once the binding exists: an install that left it out must not
// leave a cache that the next run would trust.
function markStaged({ dir, version, sdk, fromSource = false }) {
  if (stagedAddon(dir) === undefined) {
    throw new Error(
      'the RFC binding is not in the staged @mcp-abap-adt/sap-rfc-lite: no prebuilt binding for this platform and none compiled (check SAPNWRFC_HOME and the C++ toolchain; npm left the optional dependency out if the compile failed)',
    );
  }
  fs.writeFileSync(markerOf(dir), JSON.stringify({ version, sdk, fromSource }));
}

module.exports = { sdkHome, stagedAddon, isStaged, markStaged };
