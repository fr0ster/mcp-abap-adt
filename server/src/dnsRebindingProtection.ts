import type { NextFunction, Request, Response } from 'express';

export interface DnsRebindingOptions {
  enable?: boolean;
  /** Exact raw Host header values, including port (e.g. "localhost:3000"). */
  allowedHosts?: string[];
  /** Exact raw Origin header values, including scheme (e.g. "https://app.example.com"). */
  allowedOrigins?: string[];
}

type RouteHandler = (
  req: Request,
  res: Response,
  next?: NextFunction,
) => void | Promise<void>;

function reject(message: string): { status: number; body: unknown } {
  return {
    status: 403,
    body: { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
  };
}

/** Returns a 403 descriptor if the request must be rejected, else null. */
export function checkDnsRebinding(
  headers: { host?: string; origin?: string },
  opts: DnsRebindingOptions,
): { status: number; body: unknown } | null {
  if (opts.enable !== true) return null;
  const hosts = opts.allowedHosts ?? [];
  const origins = opts.allowedOrigins ?? [];
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
        host: req.headers?.host as string | undefined,
        origin: req.headers?.origin as string | undefined,
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
