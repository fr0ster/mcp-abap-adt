/**
 * The rules a tool's description is held to (plan step 10.4): its purpose
 * is one sentence of at most `PURPOSE_LIMIT` characters, and it never says a word of the answer's form or of how the tool
 * works (`FORM_MARKERS`) — the `detail` parameter's shared text alone
 * describes form. Adding a marker is a reviewed change of this file.
 */

/** The longest purpose sentence, in characters. */
export const PURPOSE_LIMIT = 160;

/** Words and signs of an answer's form or a tool's mechanism, compared case-insensitively. */
export const FORM_MARKERS: readonly string[] = [
  '{',
  '}',
  '[',
  ']',
  '`',
  '#',
  'json',
  'tsv',
  'xml',
  'list of',
  'flat',
  'tree',
  'array',
  'row',
  'rows',
  'column',
  'columns',
  'entry',
  'entries',
  'batch',
  'envelope',
  'request',
  'requests',
  'node structure',
  'nodestructure',
  'endpoint',
  'parse',
  'document',
  'field',
  'fields',
  'returns',
  'answers',
  'line',
  'lines',
  'indented',
  'mark',
  'tab',
  'list-of',
  'parsed',
  'read with',
  'at raw',
  'terse',
  'medium',
  'full',
  'raw',
  'read by',
];

/**
 * The one marker a note may say: the batch note's `batch` (batch mode is
 * what it tells of), named here so nothing else passes unseen.
 */
export const NOTE_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  batch: ['batch'],
};

function isWordCharacter(character: string | undefined): boolean {
  if (character === undefined || character === '') return false;
  const lower = character.toLowerCase();
  return (
    (lower >= 'a' && lower <= 'z') ||
    (character >= '0' && character <= '9') ||
    character === '_'
  );
}

/** Whether `marker` is a word (letters and spaces), matched on word boundaries. */
function isWordMarker(marker: string): boolean {
  for (const character of marker) {
    if (character !== ' ' && !isWordCharacter(character)) return false;
  }
  return true;
}

/** The markers `text` holds: a word marker on word boundaries, a sign anywhere. */
export function markersIn(text: string): string[] {
  const lower = text.toLowerCase();
  return FORM_MARKERS.filter((marker) => {
    if (!isWordMarker(marker)) return lower.includes(marker);
    let from = 0;
    for (;;) {
      const at = lower.indexOf(marker, from);
      if (at < 0) return false;
      const before = lower[at - 1];
      const after = lower[at + marker.length];
      if (!isWordCharacter(before) && !isWordCharacter(after)) return true;
      from = at + 1;
    }
  });
}

/** What breaks the purpose rules in `text`, each fault in words; none for a good purpose. */
export function purposeFaults(text: string, types?: string): string[] {
  const faults: string[] = [];
  // The object types a compact purpose names come from its schema enum:
  // counted as one word.
  const length =
    types === undefined
      ? text.length
      : text.length - types.length + 'types'.length;
  if (length > PURPOSE_LIMIT) {
    faults.push(`longer than ${PURPOSE_LIMIT} characters (${length})`);
  }
  const trimmed = text.trim();
  if (!trimmed.endsWith('.')) faults.push('does not end with a full stop');
  const body = trimmed.slice(0, -1);
  if (text.includes('\n') || text.includes('\r')) {
    faults.push('holds a line break');
  }
  if (text.includes('..')) faults.push('holds ".."');
  const characters = [...body];
  const second = characters.some((character, i) => {
    if (character === '?' || character === '!') return true;
    if (character !== '.') return false;
    // A full stop followed by any white space, then more text: a second
    // sentence (a tab or a line break as well as a space).
    const next = characters[i + 1];
    return (
      next !== undefined &&
      next.trim() === '' &&
      body.slice(i + 1).trim() !== ''
    );
  });
  if (second) faults.push('holds more than one sentence');
  for (const marker of markersIn(text)) faults.push(`says "${marker}"`);
  return faults;
}

/** What breaks the rules in a note: a marker of form, but its named exception. */
export function noteFaults(
  text: string,
  kind: keyof typeof NOTE_EXCEPTIONS | 'long',
): string[] {
  const allowed = new Set(NOTE_EXCEPTIONS[kind] ?? []);
  return markersIn(text)
    .filter((marker) => !allowed.has(marker))
    .map((marker) => `says "${marker}"`);
}

/**
 * The level names: words of form everywhere but in the `detail` parameter's
 * shared text, the one place they belong (the owner's option A).
 */
export const LEVEL_NAMES: readonly string[] = [
  'terse',
  'medium',
  'full',
  'raw',
];

/** What breaks the rules in the shared `detail` text: a marker of form, its level names excepted. */
export function detailFaults(text: string): string[] {
  return markersIn(text)
    .filter((marker) => !LEVEL_NAMES.includes(marker))
    .map((marker) => `says "${marker}"`);
}

/** The tags a description may open with, rendered. */
export const TAGS: readonly string[] = [
  '[read-only]',
  '[low-level]',
  '[debug]',
];
