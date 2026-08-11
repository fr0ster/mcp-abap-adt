/**
 * Bridge from `test_settings.timeouts` to the request budgets the client
 * libraries actually obey.
 *
 * `@mcp-abap-adt/adt-clients` and `@mcp-abap-adt/connection` read `SAP_TIMEOUT_*`
 * from the environment and nowhere else, re-reading it on every call. Without
 * this bridge the YAML governs only the jest test timeout while the request
 * underneath goes out with the library's built-in 45s — which is how a group
 * activation of 24 objects came to abort mid-flight while the config said 120s.
 * See issue #174.
 *
 * Deliberately dependency-free: `globalSetup` imports it, and jest resolves that
 * module outside the transform used for tests, so pulling in the helper chain
 * here would break the run before a single suite starts.
 */

/** Which `test_settings.timeouts` key feeds which client environment variable. */
const TIMEOUT_ENV_BY_KEY: Record<string, string> = {
  default: 'SAP_TIMEOUT_DEFAULT',
  long: 'SAP_TIMEOUT_LONG',
  csrf: 'SAP_TIMEOUT_CSRF',
  critical: 'SAP_TIMEOUT_CRITICAL',
};

/**
 * Publish the configured timeouts to the environment the client libraries read.
 *
 * An explicit environment variable wins: someone who exported a value for one
 * run means it, and a config file should not overrule that.
 *
 * Note that these are blunt — `SAP_TIMEOUT_DEFAULT` raises the budget for every
 * default-timeout request the client makes, not just the slow one. That is the
 * right trade for a test run against a sluggish system; the shipped server keeps
 * the library defaults, since nothing here runs in it.
 *
 * @param config Parsed test config.
 * @param onWarn Optional sink for a value that cannot be used as a duration.
 */
export function applyClientTimeoutEnv(
  config: any,
  onWarn?: (message: string) => void,
): void {
  const timeouts = config?.test_settings?.timeouts;
  if (!timeouts) {
    return;
  }
  for (const [key, envName] of Object.entries(TIMEOUT_ENV_BY_KEY)) {
    const value = timeouts[key];
    if (value === undefined || value === null || process.env[envName]) {
      continue;
    }
    const ms = Number(value);
    if (!Number.isFinite(ms) || ms <= 0) {
      onWarn?.(
        `test_settings.timeouts.${key} is not a positive number (${String(value)}); leaving ${envName} unset`,
      );
      continue;
    }
    process.env[envName] = String(Math.round(ms));
  }
}
