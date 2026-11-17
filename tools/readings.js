'use strict';
// What the developer tools under tools/ read — names, lines, feeds — in plain
// code, CommonJS so the unit tests can load it. No regular expression.

const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';
const isUpper = (c) => c !== undefined && c >= 'A' && c <= 'Z';
const isHex = (c) =>
  isDigit(c) || (c !== undefined && c.length === 1 && 'abcdefABCDEF'.includes(c));
const isBlank = (c) => c !== undefined && c.length === 1 && c.trim() === '';

// `text` with its ASCII letters in upper / lower case, by char code; every
// other character as it is (no Unicode case mapping).
const shifted = (text, from, to, by) => {
  let out = '';
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    out += code >= from && code <= to ? String.fromCharCode(code + by) : text.charAt(at);
  }
  return out;
};
const asciiUpper = (text) => shifted(text, 97, 122, -32);
const asciiLower = (text) => shifted(text, 65, 90, 32);

// A line holding `@TODO` or `TODO:`, in any case.
function hasTodo(line) {
  const upper = asciiUpper(line);
  return upper.includes('@TODO') || upper.includes('TODO:');
}

// An ABAP name in upper case: a letter, then letters, digits and `_`.
function isUpperAbapName(name) {
  if (!isUpper(name[0])) return false;
  return [...name].every((c) => isUpper(c) || isDigit(c) || c === '_');
}

// An ABAP logon user in upper case: letters, digits and `_ . $ -`.
function isAbapUser(name) {
  return (
    name.length > 0 &&
    [...name].every((c) => isUpper(c) || isDigit(c) || '_.$-'.includes(c))
  );
}

// `text` with every occurrence of `from` replaced by `to`, compared as written.
function replacedEverywhere(text, from, to) {
  return from === '' ? text : text.split(from).join(to);
}

// `text` with every character other than A–Z, 0–9 and `_` turned into `_`.
function asNameCharacters(text) {
  return [...text]
    .map((c) => (isUpper(c) || isDigit(c) || c === '_' ? c : '_'))
    .join('');
}

// `text` with each run of white space turned into one blank.
function collapseBlanks(text) {
  let out = '';
  let gap = false;
  for (const c of text) {
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

// `text` split at every `:` and `;`.
function splitPathList(text) {
  return text.split(';').flatMap((entry) => entry.split(':'));
}

// The 32-hex-digit trace id after `/runtime/traces/abaptraces/` (that path
// in any case, ASCII), or `undefined`.
function traceIdIn(text) {
  const marker = '/runtime/traces/abaptraces/';
  const lower = asciiLower(text);
  for (let at = lower.indexOf(marker); at !== -1; at = lower.indexOf(marker, at + 1)) {
    const id = text.slice(at + marker.length, at + marker.length + 32);
    if (id.length === 32 && [...id].every(isHex)) return id;
  }
  return undefined;
}

// Every dump id a text names after `/sap/bc/adt/runtime/dumps/`: what follows,
// up to a quote, `?`, `&`, `<` or white space.
function dumpIdsIn(text) {
  const marker = '/sap/bc/adt/runtime/dumps/';
  const ids = [];
  for (let at = text.indexOf(marker); at !== -1; at = text.indexOf(marker, at + 1)) {
    let end = at + marker.length;
    while (end < text.length && !`"'?&<`.includes(text[end]) && !isBlank(text[end]))
      end++;
    if (end > at + marker.length) ids.push(text.slice(at + marker.length, end));
  }
  return ids;
}

// A parsed feed value as text: a string, or an element's text (`#text`).
function textOf(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value['#text'] === 'string')
    return value['#text'];
  return '';
}

// The user a profiler trace entry names, by field: `trc:extendedData/trc:user`,
// else `atom:author/atom:name` — in upper case.
function traceEntryUser(entry) {
  const ext = entry?.['trc:extendedData'];
  const author = entry?.['atom:author'];
  return (textOf(ext?.['trc:user']) || textOf(author?.['atom:name']))
    .trim()
    .toUpperCase();
}

// The title a profiler trace entry carries, `atom:title`, in upper case.
function traceEntryTitle(entry) {
  return textOf(entry?.['atom:title']).trim().toUpperCase();
}

module.exports = {
  hasTodo,
  isUpperAbapName,
  isAbapUser,
  replacedEverywhere,
  asNameCharacters,
  collapseBlanks,
  splitPathList,
  traceIdIn,
  dumpIdsIn,
  traceEntryUser,
  traceEntryTitle,
};
