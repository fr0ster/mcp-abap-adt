#!/usr/bin/env node
/**
 * Inject SAP_SAPROUTER support into @mcp-abap-adt/connection.
 *
 * Upstream does not implement SAProuter for RFC in any published version
 * (checked 1.10.0 and 5.0.0): buildRfcParams() sets `ashost` from the SAP_URL
 * hostname and nothing else, so any system behind a router is unreachable.
 *
 * This used to live in patches/@mcp-abap-adt+connection+<version>.patch, but
 * patch-package is unusable for consumers of this package: it is a devDep (so
 * it is absent during a dependency install) and it resolves the target package
 * relative to cwd, which breaks the moment npm hoists connection to the
 * consumer's top-level node_modules. require.resolve handles both.
 *
 * Never fails the install: on any surprise it warns and exits 0, leaving HTTP
 * connections working and only RFC-through-SAProuter degraded.
 */

const fs = require('node:fs');
const path = require('node:path');

const ANCHOR = `    return {
        ashost: parsed.hostname,
        sysnr,`;

const REPLACEMENT = `    // SAP_SAPROUTER env var enables RFC through SAProuter
    // Format: /H/router-host/H/target-app-server/H/  (standard route string)
    const saprouter = process.env.SAP_SAPROUTER?.trim();
    return {
        ashost: parsed.hostname,
        sysnr,`;

const TAIL_ANCHOR = `        lang: 'EN',
    };`;

const TAIL_REPLACEMENT = `        lang: 'EN',
        ...(saprouter && { saprouter }),
    };`;

function warn(message) {
  console.warn(`[saprouter] ${message}`);
}

function main() {
  let target;
  try {
    const pkgJson = require.resolve('@mcp-abap-adt/connection/package.json', {
      paths: [__dirname, process.cwd()],
    });
    target = path.join(
      path.dirname(pkgJson),
      'dist',
      'connection',
      'RfcAbapConnection.js',
    );
  } catch {
    warn('@mcp-abap-adt/connection not installed; nothing to do.');
    return;
  }

  if (!fs.existsSync(target)) {
    warn(`${target} not found; RFC through SAProuter will not work.`);
    return;
  }

  const source = fs.readFileSync(target, 'utf8');

  if (source.includes('SAP_SAPROUTER')) {
    return; // already applied — installs are idempotent
  }

  if (!source.includes(ANCHOR) || !source.includes(TAIL_ANCHOR)) {
    warn(
      'buildRfcParams() no longer matches the expected shape — upstream may ' +
        'have changed. RFC through SAProuter will not work until this script ' +
        'is updated.',
    );
    return;
  }

  const patched = source
    .replace(ANCHOR, REPLACEMENT)
    .replace(TAIL_ANCHOR, TAIL_REPLACEMENT);

  try {
    fs.writeFileSync(target, patched);
    console.log('[saprouter] enabled RFC through SAProuter.');
  } catch (error) {
    warn(`could not write ${target}: ${error.message}`);
  }
}

main();
