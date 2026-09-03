#!/usr/bin/env node
/**
 * Fix syntax checks for programs and includes in @mcp-abap-adt/adt-clients.
 *
 * Two upstream defects (checked 8.0.0):
 *
 * 1. AdtProgram.check() maps a missing status to the INACTIVE version:
 *
 *      const version = status === 'active' ? 'active' : 'inactive';
 *
 *    The MCP CheckProgram tool calls check({ programName }) with no status, so
 *    every check asked SAP for a version that usually does not exist. SAP then
 *    answers with a misleading syntax error rather than "nothing to check":
 *
 *      "The REPORT/PROGRAM statement is missing, or the program type is INCLUDE."
 *
 *    Verified directly against ADT: the same program returns status="processed"
 *    with zero messages when checked with version="active". Default to active;
 *    'inactive' is still honoured when a caller asks for it explicitly.
 *
 * 2. Includes cannot be checked through the programs collection at all. SAP
 *    needs the master program as context:
 *
 *      /sap/bc/adt/programs/includes/{name}?context={master program uri}
 *
 *    Without it the check comes back notProcessed, "Select a master program for
 *    include ... in the properties view". The include's own ADT resource
 *    advertises its master in <include:contextRef adtcore:uri="..."/>, so the
 *    master can be discovered rather than guessed (D010INC not needed).
 *
 * The include retry is strictly a fallback: it only runs when the first check
 * produced the include-specific complaint, it never runs for live source-code
 * checks, and any failure inside it falls through to the original result. A
 * genuine program that really is missing its REPORT statement still reports
 * that error, because the include lookup 404s and the original throw stands.
 *
 * Follows apply-saprouter-patch.js: resolve via require.resolve, idempotent,
 * and never fails the install.
 */

const fs = require('node:fs');
const path = require('node:path');

const MARKER = 'MCP-ADT-CHECK-FIX';

// --- 1. AdtProgram.check(): stop defaulting to the inactive version --------

const VERSION_ANCHOR = [
  '            // Map status to version',
  "            const version = status === 'active' ? 'active' : 'inactive';",
].join('\n');

const VERSION_REPLACEMENT = [
  `            // ${MARKER}: a missing status used to mean 'inactive', so every`,
  '            // CheckProgram call asked SAP for a version that normally does not',
  '            // exist and got back a bogus "REPORT/PROGRAM statement is missing"',
  "            // error. Only use 'inactive' when it was actually requested.",
  "            const version = status === 'inactive' ? 'inactive' : 'active';",
].join('\n');

// --- 2. checkProgram(): retry an include against its master program --------

const CHECK_ANCHOR = `async function checkProgram(connection, programName, version = 'active', sourceCode, artifactContentType) {
    const response = await (0, checkRun_1.runCheckRun)(connection, 'program', programName, version, 'abapCheckRun', sourceCode, artifactContentType);
    const checkResult = (0, checkRun_1.parseCheckRunResponse)(response);
    if (checkResult.has_errors) {
        const errorMessages = checkResult.errors.map((err) => err.text).join('; ');
        throw new Error(\`Program check failed: \${errorMessages}\`);
    }
    return response;
}`;

const CHECK_REPLACEMENT = `/**
 * ${MARKER}: does this result look like "you pointed the check at an include"?
 */
function looksLikeIncludeCheck(checkResult) {
    const texts = (checkResult.errors || []).map((e) => String(e.text || ''));
    texts.push(String(checkResult.message || ''));
    return texts.some((t) => /program type is INCLUDE|Select a master program/i.test(t));
}
/**
 * ${MARKER}: re-run the check against the include collection, supplying the
 * master program as context. Returns null if this is not an include or if
 * anything goes wrong, so the caller can fall back to the original result.
 */
async function checkAsIncludeWithContext(connection, programName, version) {
    try {
        const internalUtils = require('../../utils/internalUtils');
        const timeouts = require('../../utils/timeouts');
        const encodedName = internalUtils
            .encodeSapObjectName(programName)
            .toLowerCase();
        const meta = await connection.makeAdtRequest({
            url: \`/sap/bc/adt/programs/includes/\${encodedName}\`,
            method: 'GET',
            timeout: timeouts.getTimeout('default'),
            headers: { Accept: 'application/*' },
        });
        const xml = typeof meta?.data === 'string' ? meta.data : '';
        const match = xml.match(/<include:contextRef[^>]*adtcore:uri="([^"]+)"/);
        if (!match) {
            return null; // no master program advertised - cannot check it
        }
        const includeUri = \`/sap/bc/adt/programs/includes/\${encodedName}?context=\${encodeURIComponent(match[1])}\`;
        return await connection.makeAdtRequest({
            url: '/sap/bc/adt/checkruns?reporters=abapCheckRun',
            method: 'POST',
            timeout: timeouts.getTimeout('default'),
            data: (0, checkRun_1.buildCheckRunXml)(includeUri, version),
            headers: {
                Accept: 'application/vnd.sap.adt.checkmessages+xml',
                'Content-Type': 'application/vnd.sap.adt.checkobjects+xml',
            },
        });
    }
    catch {
        return null;
    }
}
async function checkProgram(connection, programName, version = 'active', sourceCode, artifactContentType) {
    const response = await (0, checkRun_1.runCheckRun)(connection, 'program', programName, version, 'abapCheckRun', sourceCode, artifactContentType);
    const checkResult = (0, checkRun_1.parseCheckRunResponse)(response);
    // ${MARKER}: the object may be an include, which SAP can only check with
    // its master program as context. Only attempt this for the complaint that
    // actually indicates it, and never for live source-code checks.
    if (checkResult.has_errors && !sourceCode && looksLikeIncludeCheck(checkResult)) {
        const includeResponse = await checkAsIncludeWithContext(connection, programName, version);
        if (includeResponse) {
            const includeResult = (0, checkRun_1.parseCheckRunResponse)(includeResponse);
            if (!includeResult.has_errors) {
                return includeResponse;
            }
            const includeErrors = includeResult.errors.map((err) => err.text).join('; ');
            throw new Error(\`Program check failed: \${includeErrors}\`);
        }
    }
    if (checkResult.has_errors) {
        const errorMessages = checkResult.errors.map((err) => err.text).join('; ');
        throw new Error(\`Program check failed: \${errorMessages}\`);
    }
    return response;
}`;

function warn(message) {
  console.warn(`[checkprogram-fix] ${message}`);
}

function patchFile(target, anchor, replacement, label) {
  if (!fs.existsSync(target)) {
    warn(`${target} not found; ${label} left unpatched.`);
    return 'failed';
  }
  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(MARKER)) {
    return 'already';
  }
  if (!source.includes(anchor)) {
    warn(
      `${label} no longer matches the expected shape - upstream may have ` +
        'changed. Syntax checks will keep misbehaving until this script is updated.',
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
    // adt-clients ships an "exports" map without ./package.json, so resolving
    // that path throws. Resolve the entry point and take its directory.
    const entry = require.resolve('@mcp-abap-adt/adt-clients', {
      paths: [__dirname, process.cwd()],
    });
    distDir = path.dirname(entry);
  } catch {
    warn('@mcp-abap-adt/adt-clients not installed; nothing to do.');
    return;
  }

  const ver = patchFile(
    path.join(distDir, 'core', 'program', 'AdtProgram.js'),
    VERSION_ANCHOR,
    VERSION_REPLACEMENT,
    'AdtProgram.check()',
  );
  const chk = patchFile(
    path.join(distDir, 'core', 'program', 'check.js'),
    CHECK_ANCHOR,
    CHECK_REPLACEMENT,
    'checkProgram()',
  );

  if (ver === 'applied' || chk === 'applied') {
    console.log(
      '[checkprogram-fix] syntax checks now default to the active version and ' +
        'support includes.',
    );
  }
}

main();
