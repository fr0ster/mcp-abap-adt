export type SapAuthType = "basic" | "jwt";

export interface SapConfig {
  url: string;
  client?: string;
  authType: SapAuthType;
  username?: string;
  password?: string;
  jwtToken?: string;
}

/**
 * Produces a stable string signature for a SAP configuration.
 * Used internally for caching connection instances when configuration changes.
 */
export function sapConfigSignature(config: SapConfig): string {
  return JSON.stringify({
    url: config.url,
    client: config.client ?? null,
    authType: config.authType,
    username: config.username ?? null,
    password: config.password ? "set" : null,
    jwtToken: config.jwtToken ? "set" : null
  });
}
