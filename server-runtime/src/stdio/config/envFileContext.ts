import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

/**
 * The keys of a destination's own `.env` the start reads: the connection
 * type and the system type, which decide the start before any destination
 * is read. They are read from the file, never copied into `process.env`.
 *
 * Nothing else of the file joins the environment (24.0.0): the client, the
 * language and the RFC address (`SAP_CLIENT`, `SAP_LANGUAGE`, `SAP_ASHOST`,
 * `SAP_SYSNR`, `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP`,
 * `SAP_SAPROUTER`) are the destination's own means, read from the file by
 * its store.
 *
 * `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM` and `SAP_USERNAME` are not bridged
 * (16.0.0): they are the file's destination's own, read per destination
 * (`IDestinations.systemContextFor`).
 */
export const ENV_FILE_CONTEXT_KEYS = [
  'SAP_CONNECTION_TYPE',
  'SAP_SYSTEM_TYPE',
] as const;

/** What a destination's env file states of {@link ENV_FILE_CONTEXT_KEYS}. */
export type EnvFileContext = Partial<
  Record<(typeof ENV_FILE_CONTEXT_KEYS)[number], string>
>;

/**
 * The {@link ENV_FILE_CONTEXT_KEYS} an env file states, read as a file and
 * never copied into the process environment: the launcher resolves its
 * values from them and passes them explicitly (24.0.0). A missing or
 * unreadable file states nothing — the broker validates it.
 */
export function readEnvFileContext(envFilePath?: string): EnvFileContext {
  if (!envFilePath || !fs.existsSync(envFilePath)) return {};
  let parsed: Record<string, string>;
  try {
    parsed = dotenv.parse(fs.readFileSync(envFilePath, 'utf8'));
  } catch {
    return {};
  }
  const context: EnvFileContext = {};
  for (const key of ENV_FILE_CONTEXT_KEYS) {
    const value = parsed[key];
    if (value) context[key] = value;
  }
  return context;
}

/**
 * The values the start reads for {@link ENV_FILE_CONTEXT_KEYS}: `env`'s,
 * and the file's where `env` has none — the process environment wins over
 * the file, as before. A new object: neither `env` nor the process
 * environment is written.
 */
export function withEnvFileContext(
  env: Readonly<Record<string, string | undefined>>,
  context: EnvFileContext,
): Readonly<Record<string, string | undefined>> {
  const stated: Record<string, string | undefined> = {};
  for (const key of ENV_FILE_CONTEXT_KEYS) {
    stated[key] = env[key] || context[key];
  }
  return stated;
}
