/**
 * Platform-specific storage implementations for mcp-abap-adt
 */

export { getPlatformPaths } from './platformPaths';
export { UnixFileServiceKeyStore } from './UnixFileServiceKeyStore';
export { UnixFileSessionStore } from './UnixFileSessionStore';
export { WindowsFileServiceKeyStore } from './WindowsFileServiceKeyStore';
export { WindowsFileSessionStore } from './WindowsFileSessionStore';

// Static imports for both platforms (tree-shaking will remove unused code)
import { UnixFileServiceKeyStore } from './UnixFileServiceKeyStore';
import { UnixFileSessionStore } from './UnixFileSessionStore';
import { WindowsFileServiceKeyStore } from './WindowsFileServiceKeyStore';
import { WindowsFileSessionStore } from './WindowsFileSessionStore';
import { SafeSessionStore, ISessionStore } from '@mcp-abap-adt/auth-broker';

/**
 * Get platform-specific stores based on current OS
 * @param customPath Optional custom path (overrides platform defaults)
 * @param unsafe If true, use FileSessionStore (persists to disk). If false, use SafeSessionStore (default, in-memory, secure).
 * @returns Object with serviceKeyStore and sessionStore instances
 */
export function getPlatformStores(customPath?: string | string[], unsafe: boolean = false): {
  serviceKeyStore: any;
  sessionStore: ISessionStore;
} {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    return {
      serviceKeyStore: new WindowsFileServiceKeyStore(customPath),
      sessionStore: unsafe ? new WindowsFileSessionStore(customPath) : new SafeSessionStore(),
    };
  } else {
    return {
      serviceKeyStore: new UnixFileServiceKeyStore(customPath),
      sessionStore: unsafe ? new UnixFileSessionStore(customPath) : new SafeSessionStore(),
    };
  }
}

