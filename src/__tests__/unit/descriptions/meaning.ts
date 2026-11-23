/**
 * Plan step 10.8a: vector checks of meaning, by ranks among the tools,
 * never by an absolute similarity. A tool's description, and its name in
 * words, must each rank its own function first among every tool's
 * function; a failure names the tool and the one ranked above it.
 */

/** A text's owner and its embedding. */
export interface Embedded {
  readonly tool: string;
  readonly vector: readonly number[];
}

/** One check's failure: the tool, and the tool whose function ranked above its own. */
export interface MeaningFailure {
  readonly tool: string;
  readonly check: 'description' | 'name';
  readonly confusedWith: string;
}

/** The baseline of one model: each failure recorded, with the owner's reason when accepted. */
export type MeaningBaseline = Readonly<
  Record<string, readonly (MeaningFailure & { readonly reason?: string })[]>
>;

function isUpper(character: string): boolean {
  return character >= 'A' && character <= 'Z';
}
function isLower(character: string): boolean {
  return character >= 'a' && character <= 'z';
}
function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

/**
 * A tool's name in words, lower-cased: split on case changes, underscores
 * and digits (`GetPackageContents` → `get package contents`); a compact
 * action adds its action's words after the handler's.
 */
export function nameWords(name: string, action?: string): string {
  const words: string[] = [];
  let word = '';
  const flush = () => {
    if (word !== '') words.push(word.toLowerCase());
    word = '';
  };
  const characters = [...name];
  characters.forEach((character, i) => {
    const previous = characters[i - 1] ?? '';
    const next = characters[i + 1] ?? '';
    if (character === '_' || character === '-' || character === ' ') {
      flush();
      return;
    }
    const startsWord =
      word !== '' &&
      ((isUpper(character) && (isLower(previous) || isLower(next))) ||
        isDigit(character) !== isDigit(previous));
    if (startsWord) flush();
    word += character;
  });
  flush();
  return [
    ...words,
    ...(action === undefined ? [] : nameWords(action).split(' ')),
  ].join(' ');
}

/** The cosine of two vectors; 0 when either is empty. */
function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/**
 * The queries whose own tool's function text does not rank first among
 * every function text: each named with the tool ranked first instead (a tie
 * fails: the own function must be strictly nearest).
 */
export function rankFailures(
  check: MeaningFailure['check'],
  queries: readonly Embedded[],
  functions: readonly Embedded[],
): MeaningFailure[] {
  return queries.flatMap((query): MeaningFailure[] => {
    let own = Number.NEGATIVE_INFINITY;
    let best: { tool: string; score: number } | undefined;
    for (const fn of functions) {
      const score = cosine(query.vector, fn.vector);
      if (fn.tool === query.tool) own = score;
      else if (best === undefined || score > best.score) {
        best = { tool: fn.tool, score };
      }
    }
    return best !== undefined && best.score >= own
      ? [{ tool: query.tool, check, confusedWith: best.tool }]
      : [];
  });
}

/** The key a failure is compared by. */
const keyOf = (failure: MeaningFailure) =>
  `${failure.check} ${failure.tool} ~ ${failure.confusedWith}`;

/**
 * What breaks the baseline: a failure it does not hold, and an entry it
 * holds that no longer fails (the baseline only shrinks).
 */
export function baselineFaults(
  failures: readonly MeaningFailure[],
  baseline: readonly MeaningFailure[],
): string[] {
  const now = new Set(failures.map(keyOf));
  const recorded = new Set(baseline.map(keyOf));
  return [
    ...[...now].filter((key) => !recorded.has(key)).map((key) => `new: ${key}`),
    ...[...recorded]
      .filter((key) => !now.has(key))
      .map((key) => `resolved, still in the baseline: ${key}`),
  ];
}
