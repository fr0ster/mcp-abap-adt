import type { NextFunction, Request, Response } from 'express';

export interface DnsRebindingOptions {
  enable?: boolean | undefined;
  /** Exact raw Host header values, including port (e.g. "localhost:3000"). */
  allowedHosts?: string[] | undefined;
  /** Exact raw Origin header values, including scheme (e.g. "https://app.example.com"). */
  allowedOrigins?: string[] | undefined;
}

type RouteHandler = (
  req: Request,
  res: Response,
  next?: NextFunction,
) => void | Promise<void>;

/** The refusal a rebinding request is answered: a JSON-RPC error, no id. */
export interface RebindingRefusal {
  status: number;
  body: {
    jsonrpc: '2.0';
    error: { code: number; message: string };
    id: null;
  };
}

function reject(message: string): RebindingRefusal {
  return {
    status: 403,
    body: { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
  };
}

/** The DNS-rebinding settings as a start or an embedder states them. */
export interface DnsRebindingSettings {
  readonly enableDnsRebindingProtection?: boolean | undefined;
  readonly allowedHosts?: readonly string[] | undefined;
  readonly allowedOrigins?: readonly string[] | undefined;
}

/** How a refusal names each setting: the form the user used. */
export interface DnsRebindingNames {
  readonly enable: string;
  readonly hosts: string;
  readonly origins: string;
}

/** The option names of the server classes, as an embedder states them. */
export const DNS_REBINDING_OPTION_NAMES: DnsRebindingNames = {
  enable: 'enableDnsRebindingProtection',
  hosts: 'allowedHosts',
  origins: 'allowedOrigins',
};

/** An incomplete combination of DNS-rebinding settings, refused at construction. */
export class DnsRebindingSettingsRefusal extends Error {
  readonly words: string;

  constructor(words: string) {
    super(words);
    this.name = 'DnsRebindingSettingsRefusal';
    this.words = words;
  }
}

/**
 * Why `settings` are incomplete, in words naming them by `names`, or
 * undefined: allowed hosts or origins without the protection enabled are
 * checked by nothing, and the protection enabled without a list has nothing
 * to check against. Both together, or neither, are complete.
 */
export function incompleteDnsRebindingWords(
  settings: DnsRebindingSettings,
  names: DnsRebindingNames,
): string | undefined {
  const lists = [
    ...((settings.allowedHosts?.length ?? 0) > 0 ? [names.hosts] : []),
    ...((settings.allowedOrigins?.length ?? 0) > 0 ? [names.origins] : []),
  ];
  const enabled = settings.enableDnsRebindingProtection === true;
  if (!enabled && lists.length > 0) {
    return `${lists.join(' and ')} without ${names.enable}: DNS-rebinding protection checks the hosts and origins only when it is enabled — add ${names.enable}, or drop them`;
  }
  if (enabled && lists.length === 0) {
    return `${names.enable} without ${names.hosts} or ${names.origins}: DNS-rebinding protection has nothing to check against — state the hosts or origins to accept`;
  }
  return undefined;
}

/** Throws {@link DnsRebindingSettingsRefusal} for incomplete settings of a server class. */
export function refuseIncompleteDnsRebinding(
  settings: DnsRebindingSettings,
): void {
  const words = incompleteDnsRebindingWords(
    settings,
    DNS_REBINDING_OPTION_NAMES,
  );
  if (words !== undefined) throw new DnsRebindingSettingsRefusal(words);
}

/**
 * Returns a 403 descriptor if the request must be rejected, else null.
 * Enabled with no list it fails closed: incomplete settings are refused at
 * construction, and nothing here lets every request through for them.
 */
export function checkDnsRebinding(
  headers: { host?: string | undefined; origin?: string | undefined },
  opts: DnsRebindingOptions,
): RebindingRefusal | null {
  if (opts.enable !== true) return null;
  const hosts = opts.allowedHosts ?? [];
  const origins = opts.allowedOrigins ?? [];
  if (hosts.length === 0 && origins.length === 0) {
    return reject('DNS-rebinding protection is enabled with nothing to accept');
  }
  if (hosts.length > 0) {
    const host = headers.host;
    if (!host || !hosts.includes(host)) {
      return reject(`Invalid Host header: ${host ?? ''}`);
    }
  }
  if (origins.length > 0) {
    const origin = headers.origin;
    if (origin && !origins.includes(origin)) {
      return reject(`Invalid Origin header: ${origin}`);
    }
  }
  return null;
}

/** Wrap an MCP route handler so it validates Host/Origin before delegating. */
export function withDnsRebindingProtection(
  handler: RouteHandler,
  opts: DnsRebindingOptions,
): RouteHandler {
  return (req, res, next) => {
    const rejection = checkDnsRebinding(
      {
        host: req.headers.host,
        origin: req.headers.origin,
      },
      opts,
    );
    if (rejection) {
      res.status(rejection.status).json(rejection.body);
      return;
    }
    return handler(req, res, next);
  };
}

/** Listener options given beside an embedder's own `app`, refused at construction. */
export class ListenerOptionsRefusal extends Error {
  readonly words: string;

  constructor(words: string) {
    super(words);
    this.name = 'ListenerOptionsRefusal';
    this.words = words;
  }
}

/**
 * `host`, `port` and `tls` configure the server's own listener: beside an
 * embedder's `app` (routes registered on it) they are read by nothing, so
 * they are refused naming the ones given.
 */
export function refuseListenerOptionsBesideApp(options: {
  readonly app?: object | undefined;
  readonly host?: string | undefined;
  readonly port?: number | undefined;
  readonly tls?: object | undefined;
}): void {
  if (options.app === undefined) return;
  const given = [
    ...(options.host !== undefined ? ['host'] : []),
    ...(options.port !== undefined ? ['port'] : []),
    ...(options.tls !== undefined ? ['tls'] : []),
  ];
  if (given.length > 0) {
    throw new ListenerOptionsRefusal(
      `${given.join(', ')} beside app: they configure the server's own listener, and routes registered on your app use your app's — drop them`,
    );
  }
}
