/**
 * The browser of an interactive login, from the name `--browser` gives.
 *
 * auth-providers 6 takes an `IBrowser`, never a name; this is its README's
 * table from a 5.x name to one of the shipped browsers of the platform.
 * `'system'` and `'auto'` are the platform's default browser; `'chrome'`,
 * `'edge'` and `'firefox'` the named one; `'none'` and `'headless'` no browser
 * (the authorization URL is prompted on stderr); any other name the default
 * browser, which is what 5.x opened for it.
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

type Named = 'chrome' | 'edge' | 'firefox';

const LINUX: Record<Named, string> = {
  chrome: 'google-chrome',
  edge: 'microsoft-edge',
  firefox: 'firefox',
};
const MAC: Record<Named, string> = {
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  firefox: 'Firefox',
};
const WINDOWS: Record<Named, string> = {
  chrome: 'chrome',
  edge: 'msedge',
  firefox: 'firefox',
};

function isNamed(name: string): name is Named {
  return name === 'chrome' || name === 'edge' || name === 'firefox';
}

/** The browser `name` opens on `platform`; `undefined` for `none` / `headless`. */
export function browserFor(
  name: string,
  platform: NodeJS.Platform = process.platform,
): IBrowser | undefined {
  const key = name.trim().toLowerCase();
  if (key === 'none' || key === 'headless') return undefined;
  const named = isNamed(key) ? key : undefined;
  if (platform === 'darwin') {
    return named ? macBrowser(MAC[named]) : macDefaultBrowser();
  }
  if (platform === 'win32') {
    return named ? windowsBrowser(WINDOWS[named]) : windowsDefaultBrowser();
  }
  return named ? linuxBrowser(LINUX[named]) : linuxDefaultBrowser();
}
