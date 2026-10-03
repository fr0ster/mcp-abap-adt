/**
 * Errors of the authentication layer. They name fields and vetted vocabulary
 * only — never a value read from a file (H4).
 */

import { DestinationConfigError } from '@mcp-abap-adt/auth-broker';
import type { DestinationGrant } from '@mcp-abap-adt/interfaces-auth-broker';
import type { AuthType } from './vocabulary.js';

/**
 * A well-formed authentication this server does not serve. `authType` and
 * `grantType` are already vetted names, so quoting them leaks nothing.
 */
export class UnsupportedAuthenticationError extends Error {
  readonly code = 'UNSUPPORTED_AUTHENTICATION' as const;
  readonly destination: string;
  readonly authType: AuthType;
  readonly grantType?: DestinationGrant;

  constructor(
    destination: string,
    authType: AuthType,
    grantType?: DestinationGrant,
  ) {
    const which = grantType ? `${authType} / ${grantType}` : authType;
    super(
      `Destination '${destination}' uses the authentication '${which}', which this server does not support.`,
    );
    this.name = 'UnsupportedAuthenticationError';
    this.destination = destination;
    this.authType = authType;
    if (grantType) this.grantType = grantType;
  }
}

/**
 * A refusal whose words are vetted: built from a parameter label and the
 * user's own input (a path they gave), never from a file's content. Its
 * message may be shown as it is.
 */
export class DestinationRefusal extends Error {
  readonly code = 'DESTINATION_REFUSED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'DestinationRefusal';
  }
}

/**
 * A thrown value's class, never its message: what a log line or an answer
 * may say about an error the server has no words for (H4).
 */
export function errorClassOf(error: unknown): string {
  if (error instanceof Error) {
    const name = error.constructor?.name;
    return name && /^[A-Za-z_$][\w$]*$/.test(name) ? name : 'Error';
  }
  return typeof error;
}

/** Settings an authentication cannot use; `setting` names the parameter. */
export class SettingsError extends Error {
  readonly code = 'UNSUPPORTED_SETTINGS' as const;
  readonly setting: string;

  constructor(setting: string, reason: string) {
    super(`Setting '${setting}': ${reason}`);
    this.name = 'SettingsError';
    this.setting = setting;
  }
}

/** One fixed remedy per field the server knows how to fix. */
const HINTS: Readonly<Record<string, string>> = {
  grantType:
    'Regenerate the destination with `mcp-auth generate-env --grant <grant>` (from @mcp-abap-adt/auth-broker-cli).',
  SAP_URL: "Set SAP_URL to the system's URL.",
  XSUAA_MCP_URL:
    "Set XSUAA_MCP_URL in the destination's sessions/<destination>.env to the system's URL.",
  'connection-type': 'SNC logs on over RFC: set --connection-type=rfc.',
  authorizationToken:
    'A token in sessions/<destination>.env is read only with --unsafe: start with --unsafe, or serve the file with --env=<destination> or --env-path.',
};

/**
 * The words a user reads for an authentication error the server knows:
 * a `DestinationConfigError` (the fields it lacks, then one fixed hint per
 * field with a known remedy), an `UnsupportedAuthenticationError`, or a
 * `DestinationRefusal` (its own vetted words).
 * `undefined` for anything else — the caller reports it as before. Built from
 * field names and vetted vocabulary only, never a message or a stored value.
 */
export function describeAuthError(error: unknown): string | undefined {
  if (error instanceof DestinationConfigError) {
    const fields = error.missingFields;
    const lines = [
      `Destination "${error.destination}" lacks: ${fields.join(', ')}`,
    ];
    for (const field of fields) {
      const hint = Object.hasOwn(HINTS, field) ? HINTS[field] : undefined;
      if (hint && !lines.includes(hint)) lines.push(hint);
    }
    return lines.join('\n');
  }
  if (error instanceof DestinationRefusal) return error.message;
  if (error instanceof UnsupportedAuthenticationError) {
    const which = error.grantType
      ? `${error.authType} / ${error.grantType}`
      : error.authType;
    return `Destination "${error.destination}" uses ${which}, which this server does not support`;
  }
  return undefined;
}
