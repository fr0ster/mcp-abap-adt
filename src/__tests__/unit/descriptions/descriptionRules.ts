/**
 * The rules a tool's description is held to (plan step 10.4): its purpose
 * is one sentence of at most `PURPOSE_LIMIT` characters, and neither it nor
 * any generated fact says a word of the answer's form or of how the tool
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
];

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
export function purposeFaults(text: string): string[] {
  const faults: string[] = [];
  if (text.length > PURPOSE_LIMIT) {
    faults.push(`longer than ${PURPOSE_LIMIT} characters (${text.length})`);
  }
  const trimmed = text.trim();
  if (!trimmed.endsWith('.')) faults.push('does not end with a full stop');
  const body = trimmed.slice(0, -1);
  for (const end of ['. ', '? ', '! ', '?', '!']) {
    if (body.includes(end)) {
      faults.push('holds more than one sentence');
      break;
    }
  }
  for (const marker of markersIn(text)) faults.push(`says "${marker}"`);
  return faults;
}

/** What breaks the fact rules in `text`: a marker of form. */
export function factFaults(text: string): string[] {
  return markersIn(text).map((marker) => `says "${marker}"`);
}
