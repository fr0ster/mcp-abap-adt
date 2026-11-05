'use strict';
// What the portable build and its smoke check read — arguments, environment
// keys, file names, readelf / otool output, the server's stderr — in plain
// code, CommonJS so the unit tests can load it. No regular expression.

const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';
const isLower = (c) => c !== undefined && c >= 'a' && c <= 'z';
const isUpper = (c) => c !== undefined && c >= 'A' && c <= 'Z';
const isHex = (c) =>
  isDigit(c) ||
  (c !== undefined && c.length === 1 && 'abcdefABCDEF'.includes(c));
const isBlank = (c) => c !== undefined && c.length === 1 && c.trim() === '';
const allOf = (text, accepts) => [...text].every(accepts);

// A semver `x.y.z` with an optional `-pre-release` (letters, digits, `.`, `-`),
// or an npm dist-tag (a lower-case letter, then lower-case letters, digits, `-`).
function isVersionSpec(value) {
  if (typeof value !== 'string' || value === '') return false;
  if (isLower(value[0])) {
    return allOf(value, (c) => isLower(c) || isDigit(c) || c === '-');
  }
  const dash = value.indexOf('-');
  const core = dash === -1 ? value : value.slice(0, dash);
  const parts = core.split('.');
  if (parts.length !== 3 || !parts.every((p) => p !== '' && allOf(p, isDigit)))
    return false;
  if (dash === -1) return true;
  const pre = value.slice(dash + 1);
  return (
    pre !== '' &&
    allOf(
      pre,
      (c) => isDigit(c) || isLower(c) || isUpper(c) || c === '.' || c === '-',
    )
  );
}

// The environment without the npm_* settings `npm run` hands a script, the
// prefix in any case.
function withoutNpmSettings(env) {
  const out = { ...env };
  for (const key of Object.keys(out)) {
    if (key.toLowerCase().startsWith('npm_')) delete out[key];
  }
  return out;
}

// An `otool -l` LC_RPATH path, without the ` (offset N)` otool puts after it.
function withoutOffset(text) {
  const at = text.lastIndexOf(' (offset ');
  if (at === -1 || !text.endsWith(')')) return text;
  const digits = text.slice(at + ' (offset '.length, -1);
  return digits !== '' && allOf(digits, isDigit) ? text.slice(0, at) : text;
}

const DYNAMIC_TAGS = ['(NEEDED)', '(SONAME)', '(RUNPATH)', '(RPATH)'];
const isRunpath = (line) =>
  line.includes('(RUNPATH)') || line.includes('(RPATH)');

// A `readelf -d` line without its leading blanks, its tag's `0x…` value and
// the blanks after it.
function withoutTagValue(line) {
  const start = line.length - line.trimStart().length;
  if (
    line[start] !== '0' ||
    (line[start + 1] !== 'x' && line[start + 1] !== 'X')
  )
    return line;
  let end = start + 2;
  while (end < line.length && isHex(line[end])) end++;
  if (end === start + 2 || !isBlank(line[end])) return line;
  while (end < line.length && isBlank(line[end])) end++;
  return line.slice(end);
}

// The NEEDED, SONAME, RUNPATH and RPATH entries of `readelf -d` output.
function dynamicEntries(output) {
  return output
    .split('\n')
    .filter((line) => DYNAMIC_TAGS.some((tag) => line.includes(tag)))
    .map((line) => withoutTagValue(line).trim());
}

// `line` with each run of white space turned into one blank.
function collapseBlanks(line) {
  let out = '';
  let gap = false;
  for (const c of line) {
    if (isBlank(c)) {
      gap = true;
      continue;
    }
    if (gap) out += ' ';
    gap = false;
    out += c;
  }
  return gap ? `${out} ` : out;
}

// A `… [<path>]` line with its bracketed path replaced by `[$ORIGIN]`.
function withOriginPath(line) {
  const open = line.indexOf('[');
  return open !== -1 && line.endsWith(']')
    ? `${line.slice(0, open)}[$ORIGIN]`
    : line;
}

// The dynamic entries the patched addon must have: the RUNPATH (or RPATH)
// rewritten to $ORIGIN, or — where there was none — the SONAME turned into a
// RUNPATH of $ORIGIN; blanks collapsed.
function expectedDynamicEntries(original) {
  const added = !original.some(isRunpath);
  const runpath = '(RUNPATH) Library runpath: [$ORIGIN]';
  return original
    .map((line) => {
      if (isRunpath(line)) return withOriginPath(line);
      return added && line.includes('(SONAME)') ? runpath : line;
    })
    .map(collapseBlanks);
}

// Whether the server's stderr says the SAP NW RFC SDK is missing.
function sdkMissing(stderr) {
  return (
    stderr.includes('needs the SAP NW RFC SDK') ||
    stderr.includes('is not available')
  );
}

// Whether a line names an RFC key in parentheses: `(RFC_COMMUNICATION_FAILURE)`.
function namesRfcKey(line) {
  for (
    let at = line.indexOf('(RFC_');
    at !== -1;
    at = line.indexOf('(RFC_', at + 1)
  ) {
    let end = at + '(RFC_'.length;
    while (end < line.length && (isUpper(line[end]) || line[end] === '_'))
      end++;
    if (end > at + '(RFC_'.length && line[end] === ')') return true;
  }
  return false;
}

// A JavaScript file: `.js` or `.cjs`.
function isScriptFile(file) {
  return file.endsWith('.js') || file.endsWith('.cjs');
}

// The keys that state a system or a destination: SAP_* and MCP_*,
// SAPNWRFC_HOME and AUTH_BROKER_PATH — in any case.
function statesASystem(key) {
  const upper = key.toUpperCase();
  return (
    upper.startsWith('SAP_') ||
    upper.startsWith('MCP_') ||
    upper === 'SAPNWRFC_HOME' ||
    upper === 'AUTH_BROKER_PATH'
  );
}

module.exports = {
  isVersionSpec,
  withoutNpmSettings,
  withoutOffset,
  dynamicEntries,
  collapseBlanks,
  expectedDynamicEntries,
  sdkMissing,
  namesRfcKey,
  isScriptFile,
  statesASystem,
};
