/**
 * The compact tool set's exposition: `ro` / `rw`, and `debug` beside either.
 *
 * Moved from `@mcp-abap-adt/compact`'s launcher into lib's `tool-set` (D49):
 * the three compact binaries (stdio, Streamable HTTP, SSE) read it the same
 * way, and none of them may take it from another.
 *
 * **Why the vocabulary is its own.** The two halves of the facade are a real
 * choice for whoever starts the server: `rw` serves all 25 tools, `ro` the 16
 * that change nothing — no create, update, delete, activate, lock, unlock,
 * unit-test run or profiler run anywhere in the list. Locally the default gives
 * every access (`rw`); `ro` is there for a host that means to hand out a surface
 * which cannot change the system. `readonly/high/low` are sets of the
 * object-oriented surface, which the compact binaries do not serve.
 *
 * Plain code over the arguments, no regular expression (D26).
 */
import {
  type Parameter,
  ParameterRefusal,
  type ParameterValue,
} from '../config/authParameters';

/** What `--exposition` means here. `rw` is the default: locally, every access. */
export type CompactExposition = 'ro' | 'rw';

/** The HANDLER EXPOSITION section of a compact binary's help. */
export const COMPACT_EXPOSITION_HELP = `
HANDLER EXPOSITION:
  --exposition=<set>               Which half of the compact facade to serve
                                   Options: ro, rw, debug — a comma list
                                   Default: rw

                                   - rw: all 25 tools — HandlerGet, HandlerCreate,
                                         HandlerUpdate, HandlerDelete,
                                         HandlerActivate, HandlerLock, ...
                                   - ro: the 16 that change nothing. No create,
                                         update, delete, activate, lock, unlock,
                                         unit-test run or profiler run is in the
                                         list at all, so a client cannot call one.
                                   - debug: beside ro or rw, never alone,
                                         the four debugger verbs
                                         (HandlerDebugStart, ...Wait, ...View,
                                         ...Step). They catch every request
                                         of the connected SAP user.

                                   The object-oriented sets (readonly, high, low)
                                   belong to the full binaries (\`mcp-abap-adt\`,
                                   \`mcp-abap-adt-http\`, \`mcp-abap-adt-sse\`); this
                                   command serves the compact facade only, where
                                   the OPERATION is the tool and the object goes in
                                   \`object_type\`.
`;

const EMPTY_WORDS =
  "--exposition was given no value. This command takes 'ro' (the 16 tools that change nothing) or 'rw' (all 25), and 'debug' beside either. An empty value is refused rather than defaulted: an unset shell variable must not silently open the write tools.";

/** `a,b` → `['a', 'b']`, each trimmed and lower-cased. Plain code. */
function splitWords(text: string): string[] {
  return text
    .trim()
    .toLowerCase()
    .split(',')
    .map((v) => v.trim());
}

/**
 * The comma list a `--exposition` flag carries, in both spellings; the last flag
 * wins. `undefined` when the flag is absent.
 *
 * **The default belongs to an ABSENT flag, never to an empty value.** The first
 * version treated the two alike, so `--exposition="$MODE"` with an unset variable
 * opened all 25 tools — writes included — and `--exposition=ro --exposition=`
 * overrode a deliberate `ro` the same way (found in review on PR #247). A flag that
 * is present but says nothing is a caller who meant something and lost it in a
 * shell; the only safe answer is to refuse.
 */
export function compactExpositionValues(
  argv: readonly string[],
): string[] | undefined {
  let seen = false;
  let value: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--exposition') {
      seen = true;
      const next = argv[index + 1];
      // `--exposition --mcp=X` gives the flag no value of its own.
      value = next !== undefined && !next.startsWith('-') ? next : undefined;
    } else if (arg.startsWith('--exposition=')) {
      seen = true;
      value = arg.slice('--exposition='.length);
    }
  }
  if (!seen) return undefined;
  if ((value ?? '').trim() === '') throw new ParameterRefusal(EMPTY_WORDS);
  return splitWords(value ?? '');
}

/**
 * Which half of the facade a list names: the last of `ro`/`rw`. A value outside
 * `ro`, `rw`, `debug` is refused by name rather than defaulted, because starting
 * with a different tool list than the one that was asked for is the failure this
 * is meant to prevent — and so is `debug` alone: it names no half, and taking
 * `rw` for it would open the write tools unasked.
 */
function halfOf(values: readonly string[]): CompactExposition {
  let base: CompactExposition | undefined;
  for (const v of values) {
    if (v === 'ro' || v === 'rw') base = v;
    else if (v !== 'debug') {
      throw new ParameterRefusal(
        `--exposition=${v} is not a compact set. This command takes 'ro' (the 16 tools that change nothing) or 'rw' (all 25, the default), and 'debug' beside either. The sets readonly/high/low belong to \`mcp-abap-adt\`.`,
      );
    }
  }
  if (!base) {
    throw new ParameterRefusal(
      "--exposition=debug alone names no half of the facade: add 'ro' or 'rw' beside it (for example ro,debug).",
    );
  }
  return base;
}

/** A list, normalised: its half, then `debug` when listed. Refused as {@link halfOf} says. */
export function compactExpositionOf(values: readonly string[]): string[] {
  const half = halfOf(values);
  return values.includes('debug') ? [half, 'debug'] : [half];
}

/** Which half the arguments name; `rw` when the flag is absent. */
export function parseCompactExposition(
  argv: readonly string[],
): CompactExposition {
  const values = compactExpositionValues(argv);
  return values ? halfOf(values) : 'rw';
}

/** Whether the four debugger verbs are served: `debug` in the `--exposition` list. */
export function parseCompactDebug(argv: readonly string[]): boolean {
  return compactExpositionValues(argv)?.includes('debug') ?? false;
}

/** A config file's (or a CLI form's) value as a word list: a string, or a YAML list. */
function wordsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => splitWords(String(item)));
  }
  const text = String(raw);
  if (text.trim() === '') throw new ParameterRefusal(EMPTY_WORDS);
  return splitWords(text);
}

/**
 * The compact binaries' `--exposition` row (spec §10.1): the help line, the
 * template's `rw`, and the config file's value read and refused by the same
 * parser as the flag — so a compact config file's `exposition` is honoured,
 * never ignored.
 */
export const COMPACT_EXPOSITION_ROW: Parameter = {
  key: 'exposition',
  cli: '--exposition',
  yaml: 'exposition',
  kind: 'custom',
  parse: (raw: unknown): ParameterValue => compactExpositionOf(wordsOf(raw)),
  default: ['rw'],
  valueHint: '=<ro|rw>[,debug]',
  section: 'OPTIONS',
  help: 'The half of the compact facade to serve: ro (the 16 tools that change nothing) or rw (all 25, the default); debug beside either (see HANDLER EXPOSITION)',
};
