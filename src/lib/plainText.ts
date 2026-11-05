/**
 * Reading text with plain code — character tests, `indexOf`, `slice`,
 * `split` on fixed literals — never a regular expression.
 */

/** The lines of a text: CR LF, LF and a lone CR each end one. */
export function linesOf(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    const character = text[at];
    if (character !== '\n' && character !== '\r') continue;
    lines.push(text.slice(start, at));
    if (character === '\r' && text[at + 1] === '\n') at++;
    start = at + 1;
  }
  lines.push(text.slice(start));
  return lines;
}

/** One ASCII digit, `0`–`9`. */
export function isAsciiDigit(character: string | undefined): boolean {
  return (
    character !== undefined &&
    character.length === 1 &&
    character >= '0' &&
    character <= '9'
  );
}

/** One or more ASCII digits and nothing else. */
export function isAsciiDigits(text: string): boolean {
  if (text.length === 0) return false;
  for (const character of text) if (!isAsciiDigit(character)) return false;
  return true;
}

/** The ASCII digits `text` starts with; empty when it starts with none. */
export function leadingDigits(text: string): string {
  let end = 0;
  while (end < text.length && isAsciiDigit(text[end])) end++;
  return text.slice(0, end);
}

/** One ASCII letter. */
export function isAsciiLetter(character: string | undefined): boolean {
  if (character === undefined || character.length !== 1) return false;
  const lower = character.toLowerCase();
  return lower >= 'a' && lower <= 'z';
}

/** A word character: an ASCII letter, an ASCII digit or `_`. */
export function isWordCharacter(character: string | undefined): boolean {
  return (
    isAsciiLetter(character) || isAsciiDigit(character) || character === '_'
  );
}

/**
 * A white-space character: what `String.prototype.trim` removes — the same
 * set of white space and line terminators as a pattern's `\s`.
 */
export function isBlank(character: string | undefined): boolean {
  return (
    character !== undefined && character.length === 1 && character.trim() === ''
  );
}

/** `text` with every trailing `character` removed. */
export function withoutTrailing(text: string, character: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === character) end--;
  return text.slice(0, end);
}

/** `text` with each run of white space turned into one blank. */
export function collapsedBlanks(text: string): string {
  let out = '';
  let gap = false;
  for (const character of text) {
    if (isBlank(character)) {
      gap = true;
      continue;
    }
    if (gap) out += ' ';
    gap = false;
    out += character;
  }
  return gap ? `${out} ` : out;
}

/**
 * Whether `text` matches the glob `pattern` as a whole, letters compared
 * without case: `*` stands for any run of characters (none included), `?`
 * for one; every other character, `.` among them, stands for itself.
 */
export function globMatches(pattern: string, text: string): boolean {
  const glob = [...pattern.toUpperCase()];
  const subject = [...text.toUpperCase()];
  let g = 0;
  let s = 0;
  let star = -1;
  let resume = 0;
  while (s < subject.length) {
    const wanted = glob[g];
    if (wanted === '*') {
      star = g;
      resume = s;
      g++;
    } else if (
      wanted !== undefined &&
      (wanted === '?' || wanted === subject[s])
    ) {
      g++;
      s++;
    } else if (star !== -1) {
      g = star + 1;
      resume++;
      s = resume;
    } else {
      return false;
    }
  }
  while (glob[g] === '*') g++;
  return g === glob.length;
}

/** Whether `text` holds `word` at `at`, letters compared without case. */
export function wordAt(text: string, at: number, word: string): boolean {
  return text.slice(at, at + word.length).toUpperCase() === word.toUpperCase();
}

/** The index after the run of white space at `at` (`at` itself when there is none). */
export function afterBlanksAt(text: string, at: number): number {
  let end = at;
  while (end < text.length && isBlank(text[end])) end++;
  return end;
}

/**
 * Whether `text` holds the words `words` in order anywhere, letters
 * compared without case, each pair apart by one or more white-space
 * characters (line ends among them).
 */
export function holdsPhrase(text: string, words: readonly string[]): boolean {
  const [first, ...rest] = words;
  if (first === undefined) return true;
  for (let at = 0; at < text.length; at++) {
    if (!wordAt(text, at, first)) continue;
    let end = at + first.length;
    let held = true;
    for (const word of rest) {
      const next = afterBlanksAt(text, end);
      if (next === end || !wordAt(text, next, word)) {
        held = false;
        break;
      }
      end = next + word.length;
    }
    if (held) return true;
  }
  return false;
}

/**
 * The digits after the first `marker` in `text` that has one or more ASCII
 * digits after it and stands where `stands` allows (by default anywhere);
 * `undefined` when none does. `stands` is given the character before the
 * marker, `undefined` at the start of the text.
 */
export function digitsAfter(
  text: string,
  marker: string,
  stands: (before: string | undefined) => boolean = () => true,
): string | undefined {
  for (
    let at = text.indexOf(marker);
    at !== -1;
    at = text.indexOf(marker, at + 1)
  ) {
    if (!stands(at === 0 ? undefined : text[at - 1])) continue;
    const digits = leadingDigits(text.slice(at + marker.length));
    if (digits !== '') return digits;
  }
  return undefined;
}

/** `text` split at every character of `separators`. */
export function splitOnAny(text: string, separators: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    if (!separators.includes(text.charAt(at))) continue;
    parts.push(text.slice(start, at));
    start = at + 1;
  }
  parts.push(text.slice(start));
  return parts;
}

/** `text` after the last `marker` in it; the whole of it when there is none. */
export function afterLast(text: string, marker: string): string {
  const at = text.lastIndexOf(marker);
  return at === -1 ? text : text.slice(at + marker.length);
}

/**
 * A name without its leading prefix of word characters and a colon:
 * `adtcore:name` is `name`; a name with no such prefix as it is.
 */
export function withoutNamePrefix(name: string): string {
  let end = 0;
  while (end < name.length && isWordCharacter(name[end])) end++;
  return end > 0 && name[end] === ':' ? name.slice(end + 1) : name;
}
