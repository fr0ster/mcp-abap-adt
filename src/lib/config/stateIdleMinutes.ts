/**
 * The idle bound on held state, in its three forms: `--state-idle-minutes`,
 * `MCP_STATE_IDLE_MINUTES`, and the top-level YAML key `state-idle-minutes`.
 * CLI beats env beats YAML, as for the auth parameters. A value under 30, over
 * 35791, not a whole number, or not a number is refused at startup, named in the form it
 * was given.
 */

import {
  DEFAULT_STATE_IDLE_MINUTES,
  MAX_STATE_IDLE_MINUTES,
  parseStateIdleMinutes,
} from '../state/idleBound.js';

export const STATE_IDLE_CLI = '--state-idle-minutes';
export const STATE_IDLE_ENV = 'MCP_STATE_IDLE_MINUTES';
export const STATE_IDLE_YAML = 'state-idle-minutes';

const blank = (raw: unknown) =>
  raw === undefined ||
  raw === null ||
  (typeof raw === 'string' && raw.trim() === '');

function readCli(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === STATE_IDLE_CLI) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(
          `${STATE_IDLE_CLI} needs a value: ${STATE_IDLE_CLI}=<minutes>`,
        );
      }
      return next;
    }
    if (arg.startsWith(`${STATE_IDLE_CLI}=`)) {
      return arg.slice(STATE_IDLE_CLI.length + 1);
    }
  }
  return undefined;
}

/** The bound in minutes: the first form given, or 30. */
export function readStateIdleMinutes(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): number {
  const sources: [string, unknown][] = [
    [STATE_IDLE_CLI, readCli(argv)],
    [STATE_IDLE_ENV, env[STATE_IDLE_ENV]],
    [`${STATE_IDLE_YAML} (config file)`, yaml?.[STATE_IDLE_YAML]],
  ];
  for (const [name, raw] of sources) {
    if (!blank(raw)) return parseStateIdleMinutes(raw, name);
  }
  return DEFAULT_STATE_IDLE_MINUTES;
}

/** The YAML form alone, for `validateYamlConfig`. */
export function validateStateIdleYaml(yaml: Record<string, unknown>): string[] {
  const raw = yaml[STATE_IDLE_YAML];
  if (blank(raw)) return [];
  try {
    parseStateIdleMinutes(raw, `${STATE_IDLE_YAML} (config file)`);
    return [];
  } catch (error) {
    return [(error as Error).message];
  }
}

/** The STATE block of the help text. */
export function stateIdleHelp(): string {
  return `HELD STATE:
  ${`${STATE_IDLE_CLI}=<minutes>`.padEnd(33)}Held state (a debug session) ends after this many minutes
                                   without a tool call. Default and minimum: 30; maximum: ${MAX_STATE_IDLE_MINUTES};
                                   a whole number.
                                   Activity is a tool call on the instance; a call in flight
                                   (a wait on the server) pauses the bound, and a listener's own
                                   background re-poll does not count.
                                   env: ${STATE_IDLE_ENV}, yaml: ${STATE_IDLE_YAML}
`;
}
