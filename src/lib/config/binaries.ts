/**
 * The twelve binaries and the tool set each fixes (C23, the owner's
 * decision): four kinds — core, core-ro, compact, compact-ro — each on
 * stdio, Streamable HTTP and SSE, and each `-ro` binary a package of its
 * own. A binary is chosen by what is installed, never by a flag:
 * `--exposition` (and the compact `ro` / `rw`) is gone, and passing it
 * stops the start with a sentence naming the binary that serves what the
 * words asked for, of the binary's own transport.
 *
 * Plain code over the words, no regular expression (D26).
 */

import type { RemovedParameter } from './authParameters.js';

/** The transport a binary serves: one binary per transport and tool set (D35, D49). */
export type ServedTransport = 'stdio' | 'http' | 'sse';

/** The four tool sets, one per kind of binary. */
export type ToolSetKind = 'core' | 'core-ro' | 'compact' | 'compact-ro';

/** A binary: its command and its npm package. */
export interface Binary {
  readonly bin: string;
  readonly pkg: string;
}

/** The binary of each kind, per transport. */
export const BINARIES: Readonly<
  Record<ServedTransport, Readonly<Record<ToolSetKind, Binary>>>
> = {
  stdio: {
    core: { bin: 'mcp-abap-adt', pkg: '@mcp-abap-adt/core' },
    'core-ro': { bin: 'mcp-abap-adt-ro', pkg: '@mcp-abap-adt/core-ro' },
    compact: { bin: 'mcp-abap-adt-compact', pkg: '@mcp-abap-adt/compact' },
    'compact-ro': {
      bin: 'mcp-abap-adt-compact-ro',
      pkg: '@mcp-abap-adt/compact-ro',
    },
  },
  http: {
    core: { bin: 'mcp-abap-adt-http', pkg: '@mcp-abap-adt/http' },
    'core-ro': { bin: 'mcp-abap-adt-http-ro', pkg: '@mcp-abap-adt/http-ro' },
    compact: {
      bin: 'mcp-abap-adt-compact-http',
      pkg: '@mcp-abap-adt/compact-http',
    },
    'compact-ro': {
      bin: 'mcp-abap-adt-compact-http-ro',
      pkg: '@mcp-abap-adt/compact-http-ro',
    },
  },
  sse: {
    core: { bin: 'mcp-abap-adt-sse', pkg: '@mcp-abap-adt/sse' },
    'core-ro': { bin: 'mcp-abap-adt-sse-ro', pkg: '@mcp-abap-adt/sse-ro' },
    compact: {
      bin: 'mcp-abap-adt-compact-sse',
      pkg: '@mcp-abap-adt/compact-sse',
    },
    'compact-ro': {
      bin: 'mcp-abap-adt-compact-sse-ro',
      pkg: '@mcp-abap-adt/compact-sse-ro',
    },
  },
};

/** "`mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`)" */
const named = ({ bin, pkg }: Binary): string => `\`${bin}\` (\`${pkg}\`)`;

/** D56: the words that refuse `low`, verbatim. */
export const LOW_SET_GONE =
  'the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)';

/**
 * The word of a removed `--exposition` its refusal answers, when the words
 * hold several: the one asking for the most (writes before reads), `low`
 * and `compact` first since no binary of the family serves them.
 */
const DECIDING_ORDER = [
  'low',
  'compact',
  'high',
  'rw',
  'debug',
  'readonly',
  'ro',
] as const;

type DecidingWord = (typeof DECIDING_ORDER)[number];

/** `a,b` / `['a','b']` → lower-cased trimmed words. Plain code. */
function wordsOf(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value.map(String)
    : [String(value ?? '')];
  return items.flatMap((item) =>
    item
      .toLowerCase()
      .split(',')
      .map((word) => word.trim())
      .filter((word) => word !== ''),
  );
}

/** The deciding word of `value`, or undefined when it holds none of them. */
export function decidingWord(value: unknown): DecidingWord | undefined {
  const words = wordsOf(value);
  return DECIDING_ORDER.find((word) => words.includes(word));
}

/**
 * The sentence that refuses a removed `--exposition` in a binary of
 * `family` serving `transport`, given the form used and its value — one
 * sentence per word (C23). It names the binary serving what the words
 * asked for, of the same transport; `low` keeps D56's sentence verbatim in
 * the full binaries, and says to drop the flag in the compact ones.
 */
export function expositionGoneWords(
  family: 'core' | 'compact',
  transport: ServedTransport,
  form: string,
  value: unknown,
): string {
  const binaries = BINARIES[transport];
  const gone = `${form} is gone (19.0.0): the binary fixes its tool set, so remove it`;
  const word = decidingWord(value);
  switch (word) {
    case 'low':
      // D56's sentence in the full binaries; a compact one already serves
      // the low set's analogue, so it says to drop the flag.
      return family === 'core'
        ? LOW_SET_GONE
        : `${gone}; the low set is gone from mcp-abap-adt / -http / -sse, and this binary serves its analogue, the compact tools`;
    case 'compact':
      return `${gone}; the compact tools are served by ${named(binaries.compact)}, those that change nothing by ${named(binaries['compact-ro'])}`;
    case 'high':
      return `${gone}; the high tools are served, beside the readonly ones, by ${named(binaries.core)}`;
    case 'rw':
      return `${gone}; all compact tools are served by ${named(binaries.compact)}`;
    case 'debug':
      return family === 'core'
        ? `${gone}; the debugger is always served by ${named(binaries.core)}, and by no -ro binary`
        : `${gone}; the compact debugger is always served by ${named(binaries.compact)}, and by no -ro binary`;
    case 'readonly':
      return `${gone}; the readonly tools alone (with system and search) are served by ${named(binaries['core-ro'])}`;
    case 'ro':
      return `${gone}; the compact tools that change nothing are served by ${named(binaries['compact-ro'])}`;
    default:
      return family === 'core'
        ? `${gone}; ${named(binaries.core)} serves readonly, high and debug, ${named(binaries['core-ro'])} the readonly tools alone`
        : `${gone}; ${named(binaries.compact)} serves all compact tools, ${named(binaries['compact-ro'])} those that change nothing`;
  }
}

/**
 * `--exposition` and the YAML key `exposition` as a removed parameter of a
 * binary of `family` serving `transport`: any value, or none, stops the
 * start with {@link expositionGoneWords}.
 */
export function expositionRemoved(
  family: 'core' | 'compact',
  transport: ServedTransport,
): RemovedParameter {
  return {
    cli: ['--exposition'],
    yaml: ['exposition'],
    words: (form, value) => expositionGoneWords(family, transport, form, value),
  };
}
