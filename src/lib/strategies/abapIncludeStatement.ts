/**
 * The program include an ABAP statement names, read with plain code.
 *
 * A statement `INCLUDE <name>` or `INCLUDE <name> IF FOUND` — the keywords
 * in any case (ASCII letters only), white space around them, line ends
 * among it, a name of letters, digits, `_` and `/` (a namespace such as
 * `/NS/NAME`) — names the include `<name>`, in upper case.
 *
 * `abapStatementsOf` splits a source into statements as ABAP does: at a
 * period outside a comment and a literal. A full-line comment (`*` in the
 * first column) and a trailing one (`"`) are no code; a text literal
 * (`'…'`, `''` inside it), a string literal (`` `…` ``, ` `` ` inside it) and
 * a string template (`|…|`, `\|` inside it) hold no statement end.
 *
 * `includeNameOf` reads one line on its own: the reading `GetIncludesList`
 * makes of each line of a source.
 */
import { asciiUpper, isAsciiDigit, isAsciiLetter, linesOf } from '../plainText';

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

/** `text` after `keyword` in any case (ASCII), or `undefined` when it does not start with it. */
function afterKeyword(text: string, keyword: string): string | undefined {
  return asciiUpper(text.slice(0, keyword.length)) === keyword
    ? text.slice(keyword.length)
    : undefined;
}

/**
 * The include a statement names — its text without the closing period —
 * in upper case; `undefined` for any other statement.
 */
export function includeOfStatement(statement: string): string | undefined {
  const afterInclude = afterKeyword(statement.trimStart(), 'INCLUDE');
  if (afterInclude === undefined) return undefined;
  const named = afterBlanks(afterInclude);
  if (named === undefined) return undefined;
  let end = 0;
  while (end < named.length && isNameCharacter(named[end])) end++;
  if (end === 0) return undefined;
  const rest = named.slice(end);
  if (rest.trim() === '') return asciiUpper(named.slice(0, end));
  const afterIf = afterKeyword(afterBlanks(rest) ?? '', 'IF');
  if (afterIf === undefined) return undefined;
  const found = afterKeyword(afterBlanks(afterIf) ?? '', 'FOUND');
  return found !== undefined && found.trim() === ''
    ? asciiUpper(named.slice(0, end))
    : undefined;
}

/** The include one line of source names: a statement ending in a period on that line. */
export function includeNameOf(line: string): string | undefined {
  if (line.startsWith('*')) return undefined;
  const quote = line.indexOf('"');
  const code = quote === -1 ? line : line.slice(0, quote);
  const period = code.indexOf('.');
  return period === -1 ? undefined : includeOfStatement(code.slice(0, period));
}

/** The closing delimiter of each literal, and the character that escapes it inside. */
const LITERALS: Readonly<Record<string, { escape: string }>> = {
  "'": { escape: "'" },
  '`': { escape: '`' },
  '|': { escape: '\\' },
};

/**
 * The statements of ABAP source, each without its period, in order;
 * comments left out, literals kept as written. What follows the last
 * period is no statement.
 */
export function abapStatementsOf(source: string): string[] {
  const statements: string[] = [];
  let current = '';
  for (const line of linesOf(source)) {
    if (line.startsWith('*')) continue;
    let at = 0;
    while (at < line.length) {
      const character = line.charAt(at);
      if (character === '"') break;
      if (character === '.') {
        statements.push(current);
        current = '';
        at++;
        continue;
      }
      const literal = LITERALS[character];
      if (literal === undefined) {
        current += character;
        at++;
        continue;
      }
      // A literal: up to its closing delimiter on this line, escapes kept.
      let end = at + 1;
      while (end < line.length) {
        const inside = line.charAt(end);
        if (literal.escape !== character && inside === literal.escape) {
          end += 2;
          continue;
        }
        if (inside === character) {
          if (
            literal.escape === character &&
            line.charAt(end + 1) === character
          ) {
            end += 2;
            continue;
          }
          break;
        }
        end++;
      }
      current += line.slice(at, end + 1);
      at = end + 1;
    }
    current += '\n';
  }
  return statements;
}
