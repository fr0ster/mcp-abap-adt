/**
 * Unix-specific file-based implementation of SessionStore for mcp-abap-adt
 *
 * Automatically resolves paths for Unix systems (Linux/macOS):
 * 1. Custom path (if provided)
 * 2. AUTH_BROKER_PATH environment variable
 * 3. ~/.config/mcp-abap-adt/sessions (standard Unix location)
 * 4. Current working directory (process.cwd())
 *
 * Reads/writes session data from/to {destination}.env files in resolved paths.
 */

import { ISessionStore, FileSessionStore } from '@mcp-abap-adt/auth-broker';
import { EnvConfig } from '@mcp-abap-adt/auth-broker';
import { getPlatformPaths } from './platformPaths';

/**
 * Unix-specific file-based session store for mcp-abap-adt
 *
 * Automatically uses ~/.config/mcp-abap-adt/sessions as default location
 * for .env files, but also searches in current working directory.
 *
 * This is a wrapper around FileSessionStore with platform-specific paths.
 */
export class UnixFileSessionStore implements ISessionStore {
  private delegate: FileSessionStore;

  /**
   * Create a new UnixFileSessionStore instance
   * @param customPath Optional custom path for session files.
   *                   If not provided, uses ~/.config/mcp-abap-adt/sessions
   *                   and current working directory.
   */
  constructor(customPath?: string | string[]) {
    const searchPaths = getPlatformPaths(customPath, 'sessions');
    this.delegate = new FileSessionStore(searchPaths);
  }

  /**
   * Load session configuration for destination
   * @param destination Destination name (e.g., "TRIAL")
   * @returns EnvConfig object or null if not found
   */
  async loadSession(destination: string): Promise<EnvConfig | null> {
    return this.delegate.loadSession(destination);
  }

  /**
   * Save session configuration for destination
   * @param destination Destination name (e.g., "TRIAL")
   * @param config Session configuration to save
   */
  async saveSession(destination: string, config: EnvConfig): Promise<void> {
    return this.delegate.saveSession(destination, config);
  }

  /**
   * Delete session for destination
   * @param destination Destination name (e.g., "TRIAL")
   */
  async deleteSession(destination: string): Promise<void> {
    if (this.delegate.deleteSession) {
      return this.delegate.deleteSession(destination);
    }
  }

  /**
   * Get search paths (for error messages)
   * @returns Array of search paths
   */
  getSearchPaths(): string[] {
    return this.delegate.getSearchPaths();
  }
}

