/**
 * The destination layer's failures, as the client's answer (spec §7.1, §7.3).
 *
 * core reads first what only core knows — a `DestinationConfigError`
 * (auth-broker's `isDestinationConfigError`, structural): its destination,
 * the fields it names and the error it carries — then lib's `failureOf`.
 * Built from field names, vetted vocabulary and auth-errors' words only,
 * never a message or a stored value (H4).
 */

import { isDestinationConfigError } from '@mcp-abap-adt/auth-broker';
import { classify } from '@mcp-abap-adt/auth-errors';
import type { IAuthProviderError } from '@mcp-abap-adt/interfaces-auth';
import type { DestinationGrant } from '@mcp-abap-adt/interfaces-auth-broker';
import {
  errorClassOf,
  failureOf,
  type ReadFailure,
  readOwn,
  ServerRefusal,
} from '@mcp-abap-adt/lib/auth';
import type { AuthType } from './vocabulary';

/**
 * A refusal whose words are vetted: built from a parameter label and the
 * user's own input (a path they gave), never from a file's content. Answered
 * `destination_refused`.
 */
export class DestinationRefusal extends ServerRefusal {
  constructor(words: string) {
    super('destination_refused', words);
    this.name = 'DestinationRefusal';
  }
}

/**
 * A well-formed authentication this server does not serve. `authType` and
 * `grantType` are already vetted names, so quoting them leaks nothing.
 * Answered `destination_refused`.
 */
export class UnsupportedAuthenticationError extends ServerRefusal {
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
      'destination_refused',
      `Destination "${destination}" uses ${which}, which this server does not support`,
    );
    this.name = 'UnsupportedAuthenticationError';
    this.destination = destination;
    this.authType = authType;
    if (grantType) this.grantType = grantType;
  }
}

/** One fixed remedy per field the server knows how to fix. */
export const HINTS: Readonly<Record<string, string>> = {
  grantType:
    'Write the destination again with `mcp-auth --destination <name> --type abap|xsuaa` or `mcp-auth --service-key <file> --output <file> --type abap|xsuaa` (from @mcp-abap-adt/auth-broker-cli), or add SAP_GRANT_TYPE to its .env.',
  SAP_URL: "Set SAP_URL to the system's URL.",
  XSUAA_MCP_URL:
    "Set XSUAA_MCP_URL in the destination's sessions/<destination>.env to the system's URL.",
  'connection-type': 'SNC logs on over RFC: set --connection-type=rfc.',
  browser:
    'Start with --browser=none and open the URL the login prints on stderr, or give --browser-program=<program>.',
  authorizationToken:
    'A token in sessions/<destination>.env is read only with --unsafe: start with --unsafe, or serve the file with --env=<destination> or --env-path.',
  issuedFor:
    'the token in the session is bound to other means: write it again, or remove `SAP_ISSUED_FOR` / `SAP_ISSUED_BY`',
  issuedBy:
    'the token in the session is bound to other means: write it again, or remove `SAP_ISSUED_FOR` / `SAP_ISSUED_BY`',
};

export interface DestinationFailureOptions {
  /** The platform a browser login found no browser on (default `process.platform`). */
  readonly platform?: string;
  /** The server's own sentence beside a chain failure (§7.4). */
  readonly sentenceFor?: (error: IAuthProviderError) => string | undefined;
}

/** The headline of a destination refused for `fields`. */
function headline(
  destination: string,
  fields: readonly string[],
  platform: string,
): string {
  if (fields.length === 1 && fields[0] === 'browser') {
    return `Destination "${destination}" logs in through a browser, and none is known on this platform (${platform})`;
  }
  return `Destination "${destination}" cannot be used: ${fields.join(', ')}`;
}

/** A `DestinationConfigError` as the answer; `undefined` for anything else. */
function destinationConfigFailure(
  thrown: unknown,
  platform: string,
): ReadFailure | undefined {
  if (!isDestinationConfigError(thrown)) return undefined;
  // Each read once, as own data, and only the copies rendered: a value that
  // answers differently on a second read cannot change what was checked.
  const destination = readOwn(thrown, 'destination');
  const listed = readOwn(thrown, 'missingFields');
  if (typeof destination !== 'string' || !Array.isArray(listed)) {
    return undefined;
  }
  const copied: unknown[] = Array.from(listed as unknown[]);
  if (!copied.every((field) => typeof field === 'string')) return undefined;
  const fields = copied as string[];
  const carried = readOwn(thrown, 'error');
  const cause =
    carried === undefined ? undefined : classify(carried, 'unfamiliar-error');
  const hints: string[] = [];
  if (cause?.hint !== undefined) hints.push(cause.hint);
  for (const field of fields) {
    const hint = Object.hasOwn(HINTS, field) ? HINTS[field] : undefined;
    if (hint !== undefined && !hints.includes(hint)) hints.push(hint);
  }
  return {
    error: 'destination_refused',
    message: headline(destination, fields, platform),
    ...(hints.length > 0 ? { hint: hints.join('\n') } : {}),
    ...(cause !== undefined ? { causeKind: cause.kind, authError: cause } : {}),
  };
}

/**
 * What `thrown` is, as the client's answer: a `DestinationConfigError`
 * first, then lib's `failureOf`; `undefined` when neither knows it. Total.
 */
export function destinationFailureOf(
  thrown: unknown,
  options: DestinationFailureOptions = {},
): ReadFailure | undefined {
  try {
    const platform = options.platform ?? process.platform;
    const destination = destinationConfigFailure(thrown, platform);
    if (destination !== undefined) return destination;
    const read = failureOf(thrown);
    if (read?.authError === undefined || read.error !== 'authentication_failed')
      return read;
    const server = options.sentenceFor?.(read.authError);
    return server === undefined ? read : { ...read, server };
  } catch {
    return undefined;
  }
}

/**
 * The words a failure is reported in on stderr at the start: the answer's
 * message, then its hint and the server's sentence, each on its own line;
 * else the destination and the error's class — never its message (H4).
 */
export function destinationFailureWords(
  thrown: unknown,
  destination: string,
  options: DestinationFailureOptions = {},
): string {
  const read = destinationFailureOf(thrown, options);
  if (read === undefined) {
    return `Destination "${destination}" cannot be read: ${errorClassOf(thrown)}`;
  }
  return [read.message, read.hint, read.server]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}
