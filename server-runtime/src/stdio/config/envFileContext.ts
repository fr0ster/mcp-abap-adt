import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

/**
 * The keys of a destination's own `.env` the process reads from
 * `process.env`: the connection type and the system type, which decide the
 * start before any destination is read.
 *
 * Nothing else of the file joins the environment (24.0.0): the client, the
 * language and the RFC address (`SAP_CLIENT`, `SAP_LANGUAGE`, `SAP_ASHOST`,
 * `SAP_SYSNR`, `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP`,
 * `SAP_SAPROUTER`) are the destination's own means, read from the file by
 * its store. A value in the environment is therefore one the process was
 * started with, and no destination's file ranks above another destination's
 * means.
 *
 * `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM` and `SAP_USERNAME` are not bridged
 * (16.0.0): they are the file's destination's own, read per destination
 * (`IDestinations.systemContextFor`).
 */
export const ENV_FILE_CONTEXT_KEYS = [
  'SAP_CONNECTION_TYPE',
  'SAP_SYSTEM_TYPE',
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
