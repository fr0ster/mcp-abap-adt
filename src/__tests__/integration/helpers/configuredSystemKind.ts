/**
 * The system kind a test run is configured for, from explicit statements
 * only — never from the credential (a JWT session states nothing about the
 * system: the owner's rule, configuration is never guessed), never a default.
 *
 * In order:
 * 1. the test config's `environment.system_type`;
 * 2. `SAP_SYSTEM_TYPE` in the environment;
 * 3. `SAP_SYSTEM_TYPE` in the destination's session file (`testSessionFile`).
 *
 * `legacy` stays distinct here (an older on-premise system), unlike
 * production's `statedSystemKind`, which maps it to `onprem`.
 *
 * Light on purpose: Jest's `globalSetup` and `globalTeardown` import it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { resolveEnvFilePath } from '../../../../server-runtime/src/stdio/config/envResolver';

/** What a test run may state as its system kind. */
export type ConfiguredSystemKind = 'onprem' | 'cloud' | 'legacy';

/** A member of a parsed document (YAML), read by shape. */
export function memberOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}

/** A parsed document's string member, trimmed; `undefined` when absent or empty. */
function textOf(value: unknown, ...keys: string[]): string | undefined {
  let at = value;
  for (const key of keys) at = memberOf(at, key);
  if (typeof at !== 'string') return undefined;
  const trimmed = at.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** The kind a stated word names, or `undefined` for none or any other word. */
function kindWord(word: string | undefined): ConfiguredSystemKind | undefined {
  const value = word?.trim().toLowerCase();
  return value === 'onprem' || value === 'cloud' || value === 'legacy'
    ? value
    : undefined;
}

/** The base directory of the destination's stores (`auth_broker.paths.service_keys_dir`). */
function brokerBase(config: unknown): string | undefined {
  const dir = textOf(config, 'auth_broker', 'paths', 'service_keys_dir');
  if (dir === undefined) return undefined;
  return path.resolve(dir.startsWith('~') ? os.homedir() + dir.slice(1) : dir);
}

/**
 * The destination's session file, as the server resolves `--env`: the
 * config's `environment.env` (a sessions-store name or a path), else the
 * destination's name, under the stores' base directory. `undefined` when the
 * config names neither.
 */
export function testSessionFile(config: unknown): string | undefined {
  const named =
    textOf(config, 'environment', 'env') ??
    textOf(config, 'auth_broker', 'abap', 'destination') ??
    textOf(config, 'abap', 'destination') ??
    textOf(config, 'environment', 'destination');
  if (named === undefined) return undefined;
  return resolveEnvFilePath({
    envDestination: named,
    authBrokerPath: brokerBase(config),
  });
}

/** The session file's variables; empty when there is none. */
export function sessionVariables(config: unknown): Record<string, string> {
  const file = testSessionFile(config);
  if (file === undefined || !fs.existsSync(file)) return {};
  return dotenv.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The configured system kind, or `undefined` when nothing states one. Each
 * reader decides what an unstated kind means for it: a refusal, or a skip
 * naming its reason — never `onprem` by default.
 */
export function configuredSystemKindOf(
  config: unknown,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): ConfiguredSystemKind | undefined {
  return (
    kindWord(textOf(config, 'environment', 'system_type')) ??
    kindWord(env.SAP_SYSTEM_TYPE) ??
    kindWord(sessionVariables(config).SAP_SYSTEM_TYPE)
  );
}

/** The words a reader refuses or skips with when no kind is stated. */
export const NO_KIND_STATED =
  'no system kind stated: set environment.system_type in the test config, or SAP_SYSTEM_TYPE (environment or the session file)';
