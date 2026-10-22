'use strict';
// The staging cache of scripts/portable/build.mjs: the published servers
// installed from npm, with the RFC binding their sap-rfc-lite carries.
// CommonJS so the unit tests can load it.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

// SAPNWRFC_HOME, raw: the SDK whose runtime libraries go into the archive.
// Absolute only: a relative one would name a folder depending on where the
// build happens to run.
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
// loader (node-gyp-build, resolved from the package): one built by hand in the
// staged package (build/Release) when there is one, else the prebuilt one
// under prebuilds/<platform>-<arch>/. Installing compiles nothing (0.3.0 and
// later have no install script). `undefined` when there is neither, or no
// package.
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

// Staged for this version and this SDK, and the binding is really there.
function isStaged(dir, { version, sdk }) {
  try {
    const staged = JSON.parse(fs.readFileSync(markerOf(dir), 'utf8'));
    return staged.version === version && staged.sdk === sdk && stagedAddon(dir) !== undefined;
  } catch {
    return false;
  }
}

// Written only once the binding exists: an install that left it out must not
// leave a cache that the next run would trust.
function markStaged({ dir, version, sdk }) {
  if (stagedAddon(dir) === undefined) {
    throw new Error(
      'the RFC binding is not in the staged @mcp-abap-adt/sap-rfc-lite: it ships prebuilt ones for linux-x64 (glibc), win32-x64 and darwin-arm64 only, and installing builds none (to build one, see its README, "Installation")',
    );
  }
  fs.writeFileSync(markerOf(dir), JSON.stringify({ version, sdk }));
}

// Every copy of sap-rfc-lite in the stage's node_modules tree, hoisted or
// nested under the package that pinned it, older than 0.3.0: `{ dir, version }`.
const RFC_LITE = path.join('@mcp-abap-adt', 'sap-rfc-lite');

function rfcLiteTooOld(dir) {
  const old = [];
  const walk = (modules) => {
    let names;
    try {
      names = fs.readdirSync(modules);
    } catch {
      return;
    }
    for (const name of names) {
      const entries = name.startsWith('@')
        ? (() => {
            try {
              return fs.readdirSync(path.join(modules, name)).map((n) => path.join(name, n));
            } catch {
              return [];
            }
          })()
        : [name];
      for (const entry of entries) {
        const pkg = path.join(modules, entry);
        if (entry === RFC_LITE) {
          let version;
          try {
            version = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;
          } catch {
            version = undefined;
          }
          const [major, minor] = String(version).split('.').map(Number);
          if (!(major > 0 || minor >= 3)) old.push({ dir: pkg, version: String(version) });
        }
        walk(path.join(pkg, 'node_modules'));
      }
    }
  };
  walk(path.join(dir, 'node_modules'));
  return old;
}

module.exports = { sdkHome, stagedAddon, isStaged, markStaged, rfcLiteTooOld };
