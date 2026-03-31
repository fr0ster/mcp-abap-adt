import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import type { TlsConfig } from '../lib/config/IServerConfig.js';

/**
 * Create HTTP or HTTPS server based on TLS configuration.
 *
 * When `tls` is provided with cert + key paths, creates an HTTPS server.
 * Otherwise creates a plain HTTP server.
 *
 * @param app - Express application (or any http.RequestListener)
 * @param tls - Optional TLS configuration with file paths
 * @returns http.Server or https.Server
 */
export function createServerListener(
  app: http.RequestListener,
  tls?: TlsConfig,
): http.Server | https.Server {
  if (!tls) {
    return http.createServer(app);
  }

  if (!fs.existsSync(tls.cert)) {
    throw new Error(`TLS cert file not found: ${tls.cert}`);
  }
  if (!fs.existsSync(tls.key)) {
    throw new Error(`TLS key file not found: ${tls.key}`);
  }
  if (tls.ca && !fs.existsSync(tls.ca)) {
    throw new Error(`TLS CA file not found: ${tls.ca}`);
  }

  const tlsOptions: https.ServerOptions = {
    cert: fs.readFileSync(tls.cert),
    key: fs.readFileSync(tls.key),
    ...(tls.ca && { ca: fs.readFileSync(tls.ca) }),
  };

  return https.createServer(tlsOptions, app);
}

/**
 * Returns the protocol string based on TLS configuration.
 */
export function getProtocol(tls?: TlsConfig): 'https' | 'http' {
  return tls ? 'https' : 'http';
}
