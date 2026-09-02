/**
 * Active system state for runtime system switching (stdio mode).
 *
 * Several parts of the stack read SAP_* from process.env *per request*, not
 * just at startup — RFC SAProuter/sysnr inside @mcp-abap-adt/connection,
 * SAP_CONNECTION_TYPE in BaseMcpServer, SAP_SYSTEM_TYPE for tool availability,
 * SAP_MASTER_SYSTEM/SAP_RESPONSIBLE in the system-context resolver. Switching
 * systems therefore means rewriting those keys, not only rebuilding the broker.
 */

import type { SapEnvironment } from '../handlers/interfaces.js';
import { type SystemDescriptor, toSystemType } from './envSystems.js';

/**
 * Every env key that belongs to a connection profile. On switch these are
 * overwritten from the new .env — and *removed* when the new .env omits them,
 * so e.g. SAP_SAPROUTER from a routed system never leaks into a direct one.
 */
export const MANAGED_SAP_ENV_KEYS: readonly string[] = [
  'SAP_URL',
  'SAP_CLIENT',
  'SAP_AUTH_TYPE',
  'SAP_USERNAME',
  'SAP_PASSWORD',
  'SAP_LANGUAGE',
  'SAP_CONNECTION_TYPE',
  'SAP_SYSTEM_TYPE',
  'SAP_MASTER_SYSTEM',
  'SAP_RESPONSIBLE',
  // RFC transport
  'SAP_SAPROUTER',
  'SAP_SYSNR',
  // JWT / OAuth2
  'SAP_JWT_TOKEN',
  'SAP_REFRESH_TOKEN',
  'SAP_UAA_URL',
  'SAP_UAA_CLIENT_ID',
  'SAP_UAA_CLIENT_SECRET',
  'UAA_URL',
  'UAA_CLIENT_ID',
  'UAA_CLIENT_SECRET',
  // certificate / kerberos
  'SAP_CERT_PATH',
  'SAP_CERT_KEY_PATH',
  'SAP_CERT_PFX_PATH',
  'SAP_CERT_PASSPHRASE',
  'SAP_KERBEROS_SPN',
  'SAP_KERBEROS_SERVICE',
  // per-request timeouts
  'SAP_TIMEOUT_DEFAULT',
  'SAP_TIMEOUT_CSRF',
  'SAP_TIMEOUT_LONG',
  // TLS
  'TLS_REJECT_UNAUTHORIZED',
];

let active: SystemDescriptor | undefined;

/**
 * Overwrite the managed SAP_* keys in process.env from a parsed .env file.
 * Keys absent from the new profile are deleted.
 */
export function applySystemEnv(env: Record<string, string>): void {
  for (const key of MANAGED_SAP_ENV_KEYS) {
    const value = env[key];
    if (value === undefined || value === '') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export function setActiveSystem(system: SystemDescriptor | undefined): void {
  active = system;
}

export function getActiveSystem(): SystemDescriptor | undefined {
  return active;
}

/**
 * SAP environment currently in effect, used for `available_in` tool gating.
 * Follows the active system when one is set, otherwise process.env.
 */
export function currentSapEnvironment(): SapEnvironment {
  return active?.systemType ?? toSystemType(process.env.SAP_SYSTEM_TYPE);
}
