/**
 * Errors of the authentication layer. They name fields and vetted vocabulary
 * only — never a value read from a file (H4).
 */

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
