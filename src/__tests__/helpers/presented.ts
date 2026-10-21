import { CurrentCredential } from '../../lib/auth/currentCredential';

/**
 * The credential a built connection presents: its `CurrentCredential`'s
 * credential in force; any other value as it is.
 */
export function presented(credential: unknown): unknown {
  return credential instanceof CurrentCredential
    ? credential.inForce
    : credential;
}
