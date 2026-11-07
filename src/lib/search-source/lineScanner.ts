import type {
  LineMatchStrategy,
  ScanHit,
  ScanInput,
  ScanResult,
} from './lineMatch';

export type { ScanHit, ScanInput, ScanResult } from './lineMatch';

const SNIPPET_MAX = 255;

function isCommentLine(line: string): boolean {
  if (line.length === 0) return false;
  if (line[0] === '*') return true;
  return line.trimStart().startsWith('"');
}

function lineMatches(
  raw: string,
  needle1: string,
  needle2: string | undefined,
  excludes: string[] | undefined,
  skipComments: boolean,
): boolean {
  if (skipComments && isCommentLine(raw)) return false;
  const lower = raw.toLowerCase();
  if (lower.indexOf(needle1) === -1) return false;
  if (needle2 !== undefined && lower.indexOf(needle2) === -1) return false;
  if (excludes && excludes.some((e) => lower.indexOf(e) !== -1)) return false;
  return true;
}

export function scanLines(
  lines: readonly string[],
  input: ScanInput,
): ScanResult {
  const hits: ScanHit[] = [];
  let capped = false;

  if (!input.query) return { hits, capped };

  const needle1 = input.query.toLowerCase();
  const needle2 = input.query2 ? input.query2.toLowerCase() : undefined;
  const excludes =
    input.exclude && input.exclude.length > 0
      ? input.exclude.map((e) => e.toLowerCase())
      : undefined;
  const skipComments = input.exclude_comments === true;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!lineMatches(raw, needle1, needle2, excludes, skipComments)) continue;
    if (input.max_hits !== undefined && hits.length >= input.max_hits) {
      capped = true;
      break;
    }
    hits.push({
      line: i + 1,
      snippet: raw.length > SNIPPET_MAX ? raw.slice(0, SNIPPET_MAX) : raw,
    });
  }

  return { hits, capped };
}

/**
 * The shipped line match: a case-insensitive substring per line — `query`,
 * and `query2` on the same line when given; a line holding an `exclude`
 * entry is dropped; with `exclude_comments`, col-1 `*` and full-line `"`
 * comment lines are skipped; a snippet is cut at 255 characters.
 */
export const substringLineMatch: LineMatchStrategy = { match: scanLines };
