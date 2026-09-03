#!/usr/bin/env node
/**
 * Teach @mcp-abap-adt/adt-clients how to activate report includes (PROG/I).
 *
 * Upstream (checked 8.0.0) only ever builds the *programs* ADT collection URI:
 *
 *   core/program/activation.js   -> /sap/bc/adt/programs/programs/{name}
 *   utils/activationUtils.js     -> buildObjectUri() has cases for CLAS/OC,
 *                                   PROG/P, FUGR/FF ... but none for PROG/I,
 *                                   so includes fall through to the default,
 *                                   which is again programs/programs.
 *
 * Activating an include through that URI makes SAP evaluate the source as a
 * standalone report, which it rightly rejects with:
 *
 *   "The REPORT/PROGRAM statement is missing, or the program type is INCLUDE."
 *
 * That is SAP reporting a malformed request, not SAP refusing to activate
 * includes - the correct collection is /sap/bc/adt/programs/includes/{name},
 * which the same package already uses for reads (core/shared/include.js) and
 * where-used (core/shared/whereUsed.js).
 *
 * Two edits:
 *   1. buildObjectUri()  - add a PROG/I case, so ActivateObjects works when the
 *                          caller passes the real object type.
 *   2. activateProgram() - retry against the include collection, but only when
 *                          SAP came back with the include-specific complaint.
 *                          Any other failure is rethrown untouched.
 *
 * Follows apply-saprouter-patch.js: resolve via require.resolve (survives npm
 * hoisting), idempotent, and never fails the install - on any surprise it warns
 * and exits 0, leaving activation exactly as broken as it already was.
 */

const fs = require('node:fs');
const path = require('node:path');

const MARKER = 'MCP-ADT-INCLUDE-ACTIVATION';

// --- 1. buildObjectUri(): add the missing PROG/I case ----------------------

const URI_ANCHOR = [
  "        case 'PROG/P':",
  "        case 'PROG':",
  '            return `/sap/bc/adt/programs/programs/${lowerName}`;',
].join('\n');

const URI_REPLACEMENT = [
  `        // ${MARKER}: includes live in their own ADT collection.`,
  "        case 'PROG/I':",
  "        case 'INCL':",
  '            return `/sap/bc/adt/programs/includes/${lowerName}`;',
  "        case 'PROG/P':",
  "        case 'PROG':",
  '            return `/sap/bc/adt/programs/programs/${lowerName}`;',
].join('\n');

// --- 2. activateProgram(): fall back to the include collection -------------

const ACT_ANCHOR = [
  'async function activateProgram(connection, programName) {',
  '    const objectUri = `/sap/bc/adt/programs/programs/${(0, internalUtils_1.encodeSapObjectName)(programName).toLowerCase()}`;',
  '    return await (0, activationUtils_1.activateObjectInSession)(connection, objectUri, programName, true);',
  '}',
].join('\n');

const ACT_REPLACEMENT = [
  'async function activateProgram(connection, programName) {',
  '    const encodedName = (0, internalUtils_1.encodeSapObjectName)(programName).toLowerCase();',
  '    const objectUri = `/sap/bc/adt/programs/programs/${encodedName}`;',
  '    try {',
  '        return await (0, activationUtils_1.activateObjectInSession)(connection, objectUri, programName, true);',
  '    }',
  '    catch (error) {',
  `        // ${MARKER}: a PROG/I include cannot be activated through the`,
  '        // programs collection - SAP evaluates it as a standalone report and',
  '        // rejects it. Retry against the include collection, but only for that',
  '        // specific complaint so unrelated failures keep their original error.',
  '        const haystack = [',
  '            String(error && error.message ? error.message : ""),',
  '            error && error.response && typeof error.response.data === "string"',
  '                ? error.response.data',
  '                : "",',
  '        ].join(" ");',
  '        const looksLikeInclude = /program type is INCLUDE|REPORT\\/PROGRAM statement is missing/i.test(haystack);',
  '        if (!looksLikeInclude) {',
  '            throw error;',
  '        }',
  '        const includeUri = `/sap/bc/adt/programs/includes/${encodedName}`;',
  '        return await (0, activationUtils_1.activateObjectInSession)(connection, includeUri, programName, true);',
  '    }',
  '}',
].join('\n');

function warn(message) {
  console.warn(`[include-activation] ${message}`);
}

function patchFile(target, anchor, replacement, label) {
  if (!fs.existsSync(target)) {
    warn(`${target} not found; ${label} left unpatched.`);
    return false;
  }

  const source = fs.readFileSync(target, 'utf8');

  if (source.includes(MARKER)) {
    return 'already'; // installs are idempotent
  }

  if (!source.includes(anchor)) {
    warn(
      `${label} no longer matches the expected shape - upstream may have ` +
        'changed. Activating includes will keep failing until this script is ' +
        'updated.',
    );
    return 'failed';
  }

  try {
    fs.writeFileSync(target, source.replace(anchor, replacement));
    return 'applied';
  } catch (error) {
    warn(`could not write ${target}: ${error.message}`);
    return 'failed';
  }
}

function main() {
  let distDir;
  try {
    // Resolve the package entry point rather than its package.json: adt-clients
    // ships an "exports" map that does not expose ./package.json, so resolving
    // that path throws ERR_PACKAGE_PATH_NOT_EXPORTED. The entry is dist/index.js,
    // so its directory is the dist root we need.
    const entry = require.resolve('@mcp-abap-adt/adt-clients', {
      paths: [__dirname, process.cwd()],
    });
    distDir = path.dirname(entry);
  } catch {
    warn('@mcp-abap-adt/adt-clients not installed; nothing to do.');
    return;
  }

  const uri = patchFile(
    path.join(distDir, 'utils', 'activationUtils.js'),
    URI_ANCHOR,
    URI_REPLACEMENT,
    'buildObjectUri()',
  );

  const act = patchFile(
    path.join(distDir, 'core', 'program', 'activation.js'),
    ACT_ANCHOR,
    ACT_REPLACEMENT,
    'activateProgram()',
  );

  // Stay quiet when there was nothing to do, so repeated installs do not
  // imply work happened. Only announce a real change.
  if (uri === 'applied' || act === 'applied') {
    console.log('[include-activation] enabled activation of PROG/I includes.');
  }
}

main();
