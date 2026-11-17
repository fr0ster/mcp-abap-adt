/**
 * The deny grammar (spec §2.1): an entry names a tool (`DeleteClass`), a
 * prefix of tool names (`Delete*`), one value of a tool's dispatching
 * argument or one ADT type code (`HandlerDelete.CLASS`,
 * `HandlerActivate.CLAS/OC`), or a prefix of those (`HandlerDebugSession.get*`).
 * Tool names and values are matched exactly, case included. Plain code, no
 * regular expression.
 */
import { ParameterRefusal } from '../config/authParameters.js';

/** One parsed deny entry. */
export interface DeniedEntry {
  /** The entry as configured. */
  readonly text: string;
  /** The tool name, or the prefix of tool names when `toolIsPrefix`. */
  readonly tool: string;
  readonly toolIsPrefix: boolean;
  /** The value (or its prefix when `valueIsPrefix`); `undefined` for a tool entry. */
  readonly value: string | undefined;
  readonly valueIsPrefix: boolean;
}

/** The denied actions of a start: none when nothing is configured. */
export type DeniedActions = readonly DeniedEntry[];

function isLetterOrDigit(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

/** Whether every character of `text` is an ASCII letter or digit. */
function lettersAndDigits(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (!isLetterOrDigit(text.charCodeAt(i))) return false;
  }
  return true;
}

/** Whether every character of `text` is an ASCII letter, digit, `_` or `/`. */
function valueCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (!isLetterOrDigit(code) && code !== 95 && code !== 47) return false;
  }
  return true;
}

function refused(name: string, text: string, why: string): ParameterRefusal {
  return new ParameterRefusal(`Invalid ${name} entry "${text}": ${why}`);
}

/** `text` without a last `*`, and whether it had one. */
function withoutStar(text: string): { body: string; prefix: boolean } {
  return text.endsWith('*')
    ? { body: text.slice(0, -1), prefix: true }
    : { body: text, prefix: false };
}

/**
 * One deny entry, as given in the form `name` (`--deny-actions`,
 * `MCP_DENY_ACTIONS`, `restrictions.deny-actions (config file)`); throws a
 * `ParameterRefusal` naming that form for a malformed one.
 */
export function parseDeniedEntry(text: string, name: string): DeniedEntry {
  if (text.length === 0) throw refused(name, text, 'an entry is empty');
  // The tool from the value on the first `.`; a further `.` is not a value
  // character, so an entry holds at most one.
  const dot = text.indexOf('.');
  const toolPart = dot === -1 ? text : text.slice(0, dot);
  const tool = withoutStar(toolPart);
  if (tool.body.length === 0) {
    throw refused(name, text, 'the tool part names no tool');
  }
  if (!lettersAndDigits(tool.body)) {
    throw refused(
      name,
      text,
      'a tool name holds ASCII letters and digits only, and "*" only at its end',
    );
  }
  if (dot === -1) {
    return {
      text,
      tool: tool.body,
      toolIsPrefix: tool.prefix,
      value: undefined,
      valueIsPrefix: false,
    };
  }
  if (tool.prefix) {
    throw refused(
      name,
      text,
      'a tool prefix ("Tool*") takes no value: name the tool',
    );
  }
  const value = withoutStar(text.slice(dot + 1));
  if (value.body.length === 0) {
    throw refused(name, text, 'the value part names no value');
  }
  if (!valueCharacters(value.body)) {
    throw refused(
      name,
      text,
      'a value holds ASCII letters, digits, "_" and "/" only, and "*" only at its end',
    );
  }
  return {
    text,
    tool: tool.body,
    toolIsPrefix: false,
    value: value.body,
    valueIsPrefix: value.prefix,
  };
}

/** Whether `pattern` (a prefix when `isPrefix`) names `candidate`, exactly, case included. */
export function namesText(
  pattern: string,
  isPrefix: boolean,
  candidate: string,
): boolean {
  return isPrefix ? candidate.startsWith(pattern) : candidate === pattern;
}
