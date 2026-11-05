/**
 * The program include one line of ABAP source names, read with plain code.
 *
 * A line `INCLUDE <name>.` or `INCLUDE <name> IF FOUND.` — the keywords in
 * any case, blanks around them, a name of letters, digits, `_` and `/` (a
 * namespace such as `/NS/NAME`) — names the include `<name>`, in upper case.
 * A full-line comment (`*` in the first column) is no statement; a trailing
 * comment (`"`) is not part of one. The statement is read on its line only.
 */
import { isAsciiDigit, isAsciiLetter, isBlank } from '../plainText';

const isNameCharacter = (character: string | undefined): boolean =>
  isAsciiLetter(character) ||
  isAsciiDigit(character) ||
  character === '_' ||
  character === '/';

/** `text` after its leading white space, or `undefined` when it has none. */
function afterBlanks(text: string): string | undefined {
  const rest = text.trimStart();
  return rest.length < text.length ? rest : undefined;
}

/** `text` after `keyword` in any case, or `undefined` when it does not start with it. */
function afterKeyword(text: string, keyword: string): string | undefined {
  return text.slice(0, keyword.length).toUpperCase() === keyword
    ? text.slice(keyword.length)
    : undefined;
}

/** The include `line` names, in upper case; `undefined` for any other line. */
export function includeNameOf(line: string): string | undefined {
  if (line.startsWith('*')) return undefined;
  const quote = line.indexOf('"');
  const code = quote === -1 ? line : line.slice(0, quote);
  const afterInclude = afterKeyword(code.trimStart(), 'INCLUDE');
  if (afterInclude === undefined) return undefined;
  const named = afterBlanks(afterInclude);
  if (named === undefined) return undefined;
  let end = 0;
  while (end < named.length && isNameCharacter(named[end])) end++;
  if (end === 0) return undefined;
  let rest = named.slice(end).trimStart();
  const afterIf = afterKeyword(rest, 'IF');
  if (afterIf !== undefined && isBlank(afterIf[0])) {
    const afterFound = afterKeyword(afterIf.trimStart(), 'FOUND');
    if (afterFound === undefined) return undefined;
    rest = afterFound.trimStart();
  }
  return rest.startsWith('.') ? named.slice(0, end).toUpperCase() : undefined;
}
