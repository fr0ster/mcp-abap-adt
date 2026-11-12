/**
 * What of a launched server's stderr may reach a live suite's failure text.
 *
 * At the start the server writes its configuration banner on stderr
 * (`formatAuthConfigForDisplay`, `src/lib/utils.ts`): a box whose lines name
 * the start of the SAP URL (or the RFC address), the UAA URL and the env
 * file the session came from. None of that belongs in a failure log. Every
 * other line — the server's own words, the failing step's status, message
 * id and text — stays, as it was written.
 *
 * Plain string code: a line belongs to the banner when its first character
 * that is not a space is one of the box's own (`╔`, `║`, `╠`, `╚`), so a
 * tail that starts inside the box keeps none of it either.
 */

import type { Child } from './testers/hardMode';

/** The characters every line of the banner's box starts with. */
const BOX_STARTS: ReadonlySet<string> = new Set(['╔', '║', '╠', '╚']);

function isBannerLine(line: string): boolean {
  return BOX_STARTS.has(line.trimStart().charAt(0));
}

/** `text` without the lines of the configuration banner; every other line as it is. */
export function withoutConfigBanner(text: string): string {
  return text
    .split('\n')
    .filter((line) => !isBannerLine(line))
    .join('\n');
}

/** A server's stderr as a suite keeps it for a failure. */
export interface StderrTail {
  /** The last 200 lines but session traces, without the configuration banner. */
  text(): string;
  /** The `session-trace` lines (`helpers/sessionTrace.ts`), every one. */
  trace(): string[];
}

/** Starts keeping `child`'s stderr: what it wrote so far, then each chunk. */
export function stderrTail(child: Child): StderrTail {
  const traced: string[] = [];
  const tail: string[] = [];
  let pending = '';
  const keep = (text: string): void => {
    const lines = (pending + text).split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('session-trace\t')) traced.push(line);
      else if (!isBannerLine(line)) tail.push(line);
    }
    if (tail.length > 200) tail.splice(0, tail.length - 200);
  };
  keep(child.stderr());
  child.process.stderr?.on('data', (chunk: Buffer | string) =>
    keep(chunk.toString()),
  );
  return { text: () => tail.join('\n'), trace: () => [...traced] };
}
