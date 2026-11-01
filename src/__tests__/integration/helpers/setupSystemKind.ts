import { type AbapSystemKind, statedSystemKind } from '../../../lib/systemKind';

/** The part of the test config the system kind is read from (parsed YAML). */
export interface SystemTypeConfig {
  environment?: { system_type?: unknown } | null;
}

/**
 * The system kind the integration setup connects with: the config's
 * `environment.system_type`, else `SAP_SYSTEM_TYPE`; `undefined` when
 * neither states one. Global setup passes it to `createAbapConnection`, so a
 * destination whose session file states no kind still logs on (and refreshes)
 * as the config says.
 */
export function setupSystemKind(
  config: SystemTypeConfig | null | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AbapSystemKind | undefined {
  // Parsed YAML: outside the type system, so its value is checked here.
  const configured = config?.environment?.system_type;
  return (
    statedSystemKind(typeof configured === 'string' ? configured : undefined) ??
    statedSystemKind(env.SAP_SYSTEM_TYPE)
  );
}
