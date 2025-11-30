/**
 * Unix-specific file-based implementation of ServiceKeyStore for mcp-abap-adt
 *
 * Automatically resolves paths for Unix systems (Linux/macOS):
 * 1. Custom path (if provided)
 * 2. AUTH_BROKER_PATH environment variable
 * 3. ~/.config/mcp-abap-adt/service-keys (standard Unix location)
 * 4. Current working directory (process.cwd())
 *
 * Reads service keys from {destination}.json files in resolved paths.
 */

import {
  ServiceKeyStore,
  FileServiceKeyStore
} from '@mcp-abap-adt/auth-broker';
import { getPlatformPaths } from './platformPaths';

/**
 * Unix-specific file-based service key store for mcp-abap-adt
 *
 * Automatically uses ~/.config/mcp-abap-adt/service-keys as default location
 * for service key files, but also searches in current working directory.
 *
 * This is a wrapper around FileServiceKeyStore with platform-specific paths.
 */
export class UnixFileServiceKeyStore implements ServiceKeyStore {
  private delegate: FileServiceKeyStore;

  /**
   * Create a new UnixFileServiceKeyStore instance
   * @param customPath Optional custom path for service keys.
   *                   If not provided, uses ~/.config/mcp-abap-adt/service-keys
   *                   and current working directory.
   */
  constructor(customPath?: string | string[]) {
    const searchPaths = getPlatformPaths(customPath, 'service-keys');
    this.delegate = new FileServiceKeyStore(searchPaths);
  }

  /**
   * Get service key for destination
   * @param destination Destination name (e.g., "TRIAL")
   * @returns ServiceKey object or null if not found
   */
  async getServiceKey(destination: string) {
    return this.delegate.getServiceKey(destination);
  }

  /**
   * Get search paths (for error messages)
   * @returns Array of search paths
   */
  getSearchPaths(): string[] {
    return this.delegate.getSearchPaths();
  }
}

