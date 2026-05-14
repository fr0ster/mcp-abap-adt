export interface ScanInput {
  query: string;
  query2?: string;
  exclude?: string[];
  exclude_comments?: boolean;
  max_hits: number;
}

export interface ScanHit {
  line: number;
  snippet: string;
}

export interface ScanResult {
  hits: ScanHit[];
  capped: boolean;
}

const SNIPPET_MAX = 255;

function isCommentLine(line: string): boolean {
  if (line.length === 0) return false;
  if (line[0] === '*') return true;
  const idx = line.search(/\S/);
  return idx !== -1 && line[idx] === '"';
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
    if (hits.length >= input.max_hits) {
      capped = true;
      break;
    }
    const raw = lines[i];
    if (skipComments && isCommentLine(raw)) continue;
    const lower = raw.toLowerCase();
    if (lower.indexOf(needle1) === -1) continue;
    if (needle2 !== undefined && lower.indexOf(needle2) === -1) continue;
    if (excludes && excludes.some((e) => lower.indexOf(e) !== -1)) continue;
    hits.push({
      line: i + 1,
      snippet: raw.length > SNIPPET_MAX ? raw.slice(0, SNIPPET_MAX) : raw,
    });
  }

  if (hits.length >= input.max_hits) capped = true;

  return { hits, capped };
}
