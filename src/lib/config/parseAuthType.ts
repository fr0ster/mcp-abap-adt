import type { SapAuthType } from '@mcp-abap-adt/interfaces';

/** Resolve SAP auth type from env. SAP_JWT_TOKEN forces jwt; SAP_AUTH_TYPE is explicit; default basic. */
export function parseAuthType(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): SapAuthType {
  if (env.SAP_JWT_TOKEN) return 'jwt';
  const raw = env.SAP_AUTH_TYPE?.trim().toLowerCase();
  if (!raw) return 'basic';
  if (raw === 'xsuaa') return 'jwt';
  if (
    raw === 'basic' ||
    raw === 'jwt' ||
    raw === 'saml' ||
    raw === 'certificate' ||
    raw === 'kerberos'
  ) {
    return raw;
  }
  return 'basic';
}
