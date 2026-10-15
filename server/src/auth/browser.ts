/**
 * The browser of a login (`--browser`, `--browser-program`), mapped by the
 * platform to one of auth-providers' six shipped browsers.
 *
 * `browserFor` is a pure function: it answers which factory and which
 * argument, and constructs nothing — so the table is tested cell by cell
 * without a browser. `browserOf` builds the one it answered. A word outside
 * the table, or `--browser-program` beside `--browser`, is refused at start on
 * every platform. A browser on a platform with none is *unavailable*: only a
 * destination that logs in (`jwt` / `authorization_code`) is refused for it,
 * at the startup check.
 */

import {
  linuxBrowser,
  linuxDefaultBrowser,
  macBrowser,
  macDefaultBrowser,
  windowsBrowser,
  windowsDefaultBrowser,
} from '@mcp-abap-adt/auth-providers';
import type { IBrowser } from '@mcp-abap-adt/interfaces-auth';

/** The `--browser` words, in the order the help lists them. */
export const BROWSER_NAMES = [
  'system',
  'auto',
  'chrome',
  'edge',
  'firefox',
  'none',
  'headless',
] as const;

export type BrowserName = (typeof BROWSER_NAMES)[number];

/** What the user chose: `--browser`, or `--browser-program`, never both. */
export interface BrowserChoice {
  readonly browser?: string | undefined;
  readonly program?: string | undefined;
}

/**
 * Which shipped factory and its argument. No factory: no browser — the URL
 * is shown on stderr and the login waits for the callback. `unavailable`:
 * the browser named has none on this platform; the words say what to do.
 */
export type BrowserMapping =
  | {
      readonly factory: () => IBrowser;
      readonly argument?: undefined;
      readonly unavailable?: undefined;
    }
  | {
      readonly factory: (argument: string) => IBrowser;
      readonly argument: string;
      readonly unavailable?: undefined;
    }
  | {
      readonly factory?: undefined;
      readonly argument?: undefined;
      readonly unavailable?: undefined;
    }
  | { readonly factory?: undefined; readonly unavailable: string };

/** A choice that cannot be served; its words name parameters only. */
export class BrowserChoiceError extends Error {
  /** The refusal's words: parameter names only, safe to print. */
  readonly words: string;

  constructor(words: string) {
    super(words);
    this.name = 'BrowserChoiceError';
    this.words = words;
  }
}

type Platform = 'linux' | 'darwin' | 'win32';

const DEFAULT: Readonly<Record<Platform, () => IBrowser>> = {
  linux: linuxDefaultBrowser,
  darwin: macDefaultBrowser,
  win32: windowsDefaultBrowser,
};

const NAMED: Readonly<Record<Platform, (argument: string) => IBrowser>> = {
  linux: linuxBrowser,
  darwin: macBrowser,
  win32: windowsBrowser,
};

/** Each named browser's program, per platform (auth-providers' README). */
const PROGRAMS: Readonly<
  Record<'chrome' | 'edge' | 'firefox', Readonly<Record<Platform, string>>>
> = {
  chrome: {
    linux: 'google-chrome',
    darwin: 'Google Chrome',
    win32: 'chrome',
  },
  edge: {
    linux: 'microsoft-edge',
    darwin: 'Microsoft Edge',
    win32: 'msedge',
  },
  firefox: { linux: 'firefox', darwin: 'Firefox', win32: 'firefox' },
};

const NO_BROWSER: BrowserMapping = Object.freeze({});

function isBrowserName(word: string): word is BrowserName {
  return (BROWSER_NAMES as readonly string[]).includes(word);
}

function knownPlatform(platform: string): Platform | undefined {
  return platform === 'linux' || platform === 'darwin' || platform === 'win32'
    ? platform
    : undefined;
}

function noBrowserOnThisPlatform(platform: string): BrowserMapping {
  return {
    unavailable: `No browser is known on this platform (${platform}): use --browser=none, and open the URL the login prints on stderr, or --browser-program=<program>`,
  };
}

/**
 * The factory and argument for `choice` on `platform` (`process.platform`).
 * Throws `BrowserChoiceError` for a name outside the table and for
 * `--browser-program` beside `--browser`, on every platform. A browser on a
 * platform with none answers `{ unavailable }`; `--browser-program` there runs
 * the program as `linuxBrowser` does — a plain spawn of it. No `--browser`:
 * `system`.
 */
export function browserFor(
  choice: BrowserChoice,
  platform: string,
): BrowserMapping {
  const { browser, program } = choice;
  if (program !== undefined && browser !== undefined) {
    throw new BrowserChoiceError(
      '--browser-program excludes --browser: give one of them',
    );
  }
  const known = knownPlatform(platform);
  if (program !== undefined) {
    return { factory: NAMED[known ?? 'linux'], argument: program };
  }
  const word = (browser ?? 'system').trim().toLowerCase();
  if (!isBrowserName(word)) {
    throw new BrowserChoiceError(
      `--browser must be one of ${BROWSER_NAMES.join(', ')}: use --browser=none to open the URL yourself, or --browser-program=<program>`,
    );
  }
  if (word === 'none' || word === 'headless') return NO_BROWSER;
  if (!known) return noBrowserOnThisPlatform(platform);
  if (word === 'system' || word === 'auto') return { factory: DEFAULT[known] };
  return { factory: NAMED[known], argument: PROGRAMS[word][known] };
}

/** The browser a mapping names, built; `undefined` for no browser or an unavailable one. */
export function browserOf(mapping: BrowserMapping): IBrowser | undefined {
  if (!mapping.factory) return undefined;
  if (mapping.argument === undefined) {
    return (mapping.factory as () => IBrowser)();
  }
  return mapping.factory(mapping.argument);
}
