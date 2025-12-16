/**
 * Platform-specific storage implementations for mcp-abap-adt
 *
 * Updated to use new @mcp-abap-adt/auth-stores package
 */

export { getPlatformPaths } from './platformPaths';

// Import new stores from @mcp-abap-adt/auth-stores
import {
  AbapServiceKeyStore,
  AbapSessionStore,
  SafeAbapSessionStore,
  BtpServiceKeyStore,
  BtpSessionStore,
  SafeBtpSessionStore,
  JsonFileHandler,
} from '@mcp-abap-adt/auth-stores';
import type { IServiceKeyStore, ISessionStore } from '@mcp-abap-adt/interfaces';
import { getPlatformPaths } from './platformPaths';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Auto-detect service key format and return appropriate stores
 * @param directory Directory where service keys are stored
 * @param destination Destination name to check (optional, for auto-detection)
 * @returns Object with serviceKeyStore and sessionStore instances
 */
export async function detectStoreType(
  directory: string,
  destination?: string
): Promise<{ serviceKeyStore: IServiceKeyStore; sessionStore: ISessionStore; storeType: 'abap' | 'btp' }> {
  // Default to ABAP for backward compatibility
  let storeType: 'abap' | 'btp' = 'abap';

  // Try to auto-detect if destination is provided
  if (destination) {
    const fileName = `${destination}.json`;
    const filePath = path.join(directory, fileName);

    if (fs.existsSync(filePath)) {
      try {
        const rawData = await JsonFileHandler.load(fileName, directory);
        if (rawData) {
          // Check if it's ABAP format (has nested uaa object)
          if (rawData.uaa && typeof rawData.uaa === 'object') {
            storeType = 'abap';
          }
          // Check if it's XSUAA format (has url, clientid, clientsecret at root)
          else if (rawData.url && rawData.clientid && rawData.clientsecret) {
            // For now, use BTP store for XSUAA format (BTP uses XSUAA format)
            // Could also use XSUAA store, but BTP is more common
            storeType = 'btp';
          }
        }
      } catch (error) {
        // If detection fails, default to ABAP
        storeType = 'abap';
      }
    }
  }

  // Create stores based on detected type
  switch (storeType) {
    case 'abap':
      return {
        serviceKeyStore: new AbapServiceKeyStore(directory),
        sessionStore: new AbapSessionStore(directory),
        storeType: 'abap',
      };
    case 'btp':
      return {
        serviceKeyStore: new BtpServiceKeyStore(directory),
        sessionStore: new BtpSessionStore(directory, ''),
        storeType: 'btp',
      };
    // XSUAA format uses BTP stores (BTP uses XSUAA service key format)
    // case 'xsuaa':
    //   return {
    //     serviceKeyStore: new XsuaaServiceKeyStore(directory),
    //     sessionStore: new XsuaaSessionStore(directory),
    //     storeType: 'xsuaa',
    //   };
  }
}

/**
 * Get platform-specific stores based on current OS
 * @param customPath Optional custom path (overrides platform defaults)
 * @param unsafe If true, use file-based SessionStore (persists to disk). If false, use SafeSessionStore (default, in-memory, secure).
 * @param destination Optional destination name for auto-detection of store type
 * @returns Object with serviceKeyStore and sessionStore instances
 */
export function getPlatformStores(
  customPath?: string | string[],
  unsafe: boolean = false,
  destination?: string
): {
  serviceKeyStore: IServiceKeyStore;
  sessionStore: ISessionStore;
} {
  // Get platform paths and use first path as directory (new stores use single directory)
  const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
  const sessionsPaths = getPlatformPaths(customPath, 'sessions');

  // Use first path as directory (new stores use single directory, not searchPaths)
  const serviceKeysDir = serviceKeysPaths[0];
  const sessionsDir = sessionsPaths[0];

  // For now, default to ABAP stores for backward compatibility
  // Auto-detection can be added later if needed
  const serviceKeyStore = new AbapServiceKeyStore(serviceKeysDir);

  // Use file-based or in-memory session store based on unsafe flag
  const sessionStore = unsafe
    ? new AbapSessionStore(sessionsDir)
    : new SafeAbapSessionStore();

  return {
    serviceKeyStore,
    sessionStore,
  };
}

/**
 * Get platform-specific stores with auto-detection of service key format
 * This is an async version that can detect the service key format
 * @param customPath Optional custom path (overrides platform defaults)
 * @param unsafe If true, use file-based SessionStore (persists to disk). If false, use SafeSessionStore (default, in-memory, secure).
 * @param destination Destination name for auto-detection of store type
 * @returns Promise with serviceKeyStore and sessionStore instances
 */
export async function getPlatformStoresAsync(
  customPath?: string | string[],
  unsafe: boolean = false,
  destination?: string
): Promise<{
  serviceKeyStore: IServiceKeyStore;
  sessionStore: ISessionStore;
  storeType: 'abap' | 'btp';
}> {
  // Get platform paths and use first path as directory
  const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
  const sessionsPaths = getPlatformPaths(customPath, 'sessions');

  // Use first path as directory
  const serviceKeysDir = serviceKeysPaths[0];
  const sessionsDir = sessionsPaths[0];

  // Auto-detect store type
  const detected = await detectStoreType(serviceKeysDir, destination);

  // Use file-based or in-memory session store based on unsafe flag
  let sessionStore: ISessionStore;
  if (unsafe) {
    switch (detected.storeType) {
      case 'abap':
        sessionStore = new AbapSessionStore(sessionsDir);
        break;
      case 'btp':
        sessionStore = new BtpSessionStore(sessionsDir, '');
        break;
    }
  } else {
    switch (detected.storeType) {
      case 'abap':
        sessionStore = new SafeAbapSessionStore();
        break;
      case 'btp':
        sessionStore = new SafeBtpSessionStore('');
        break;
    }
  }

  return {
    serviceKeyStore: detected.serviceKeyStore,
    sessionStore,
    storeType: detected.storeType,
  };
}
