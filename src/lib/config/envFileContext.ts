import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

/**
 * The keys of an `--env` file the process reads from `process.env`: the
 * client, the connection and system type, and the language.
 *
 * `--env-path` hands the file to the auth broker's session store, which
 * connects with it but never touches `process.env`, so these are bridged
 * here. `SAP_LANGUAGE` was missing from the list, and every object created
 * through a session from `--env-path` took the library's default language
 * instead of the file's (#182).
 *
 * `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM` and `SAP_USERNAME` are not bridged
 * (16.0.0): they are the file's destination's own, read per destination
 * (`IDestinations.systemContextFor`). In the process environment they would
 * become every other destination's fallback.
 */
export const ENV_FILE_CONTEXT_KEYS = [
  'SAP_CLIENT',
  'SAP_CONNECTION_TYPE',
  'SAP_SYSTEM_TYPE',
  'SAP_LANGUAGE',
] as const;

/**
 * Copies {@link ENV_FILE_CONTEXT_KEYS} from an env file into `env`, never
 * over a value already set there: the process environment wins over the file.
 * A missing or unreadable file changes nothing — the broker validates it.
 */
export function hydrateSystemContextFromEnvFile(
  envFilePath?: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!envFilePath || !fs.existsSync(envFilePath)) return;

  let parsed: Record<string, string>;
  try {
    parsed = dotenv.parse(fs.readFileSync(envFilePath, 'utf8'));
  } catch {
    return;
  }
  for (const key of ENV_FILE_CONTEXT_KEYS) {
    const value = parsed[key];
    if (!env[key] && value) env[key] = value;
  }
}
