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

/**
 * Get platform-specific stores based on current OS
 * @param customPath Optional custom path (overrides platform defaults)
 * @returns Object with serviceKeyStore and sessionStore instances
 */
export function getPlatformStores(customPath?: string | string[]) {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    return {
      serviceKeyStore: new WindowsFileServiceKeyStore(customPath),
      sessionStore: new WindowsFileSessionStore(customPath),
    };
  } else {
    return {
      serviceKeyStore: new UnixFileServiceKeyStore(customPath),
      sessionStore: new UnixFileSessionStore(customPath),
    };
  }
}

