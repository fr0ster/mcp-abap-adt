/**
 * AuthBroker management for destination-based authentication
 */

import path from "path";
import { AuthBroker } from "@mcp-abap-adt/auth-broker";
import { BtpTokenProvider } from "@mcp-abap-adt/auth-providers";
import { defaultLogger } from "@mcp-abap-adt/logger";
import { getPlatformStoresAsync } from "../lib/stores";
import { logger } from "../lib/logger";

/**
 * Registry of AuthBroker instances keyed by destination and client
 * Key format: `${destination || 'default'}::${clientKey || 'global'}`
 */
const authBrokers = new Map<string, AuthBroker>();

/**
 * Build registry key for AuthBroker lookup
 */
export function buildAuthBrokerKey(destination?: string, clientKey?: string): string {
  const destPart = destination || 'default';
  const clientPart = clientKey || 'global';
  return `${destPart}::${clientPart}`;
}

/**
 * Get all registered AuthBroker instances
 */
export function getAuthBrokers(): Map<string, AuthBroker> {
  return authBrokers;
}

/**
 * Check if an AuthBroker is registered for given key
 */
export function hasAuthBroker(destination?: string, clientKey?: string): boolean {
  const key = buildAuthBrokerKey(destination, clientKey);
  return authBrokers.has(key);
}

/**
 * Get existing AuthBroker from registry
 */
export function getAuthBroker(destination?: string, clientKey?: string): AuthBroker | undefined {
  const key = buildAuthBrokerKey(destination, clientKey);
  return authBrokers.get(key);
}

/**
 * Options for creating an AuthBroker
 */
export interface CreateAuthBrokerOptions {
  /** Destination name (e.g., 'TRIAL') */
  destination?: string;
  /** Client key for per-client brokers */
  clientKey?: string;
  /** Custom path for auth broker storage */
  customPath?: string;
  /** Enable unsafe mode (file-based session storage) */
  unsafe?: boolean;
  /** Allowed transport types for auth broker */
  transportType?: 'streamable-http' | 'stdio' | 'sse';
}

/**
 * Create or retrieve an AuthBroker for a destination
 * Uses lazy initialization - creates broker only when needed
 */
export async function getOrCreateAuthBroker(options: CreateAuthBrokerOptions): Promise<AuthBroker | undefined> {
  const { destination, clientKey, customPath, unsafe = false, transportType } = options;

  // AuthBroker is only available for HTTP, stdio, and SSE transports
  if (transportType && !['streamable-http', 'stdio', 'sse'].includes(transportType)) {
    return undefined;
  }

  const brokerKey = buildAuthBrokerKey(destination, clientKey);

  // Return existing broker if available
  if (authBrokers.has(brokerKey)) {
    return authBrokers.get(brokerKey);
  }

  // Create new AuthBroker
  try {
    logger.debug("Creating AuthBroker for destination", {
      type: "AUTH_BROKER_CREATE_START",
      destination: destination || 'default',
      clientKey: clientKey || 'global',
      platform: process.platform,
      unsafe,
    });

    // Resolve custom path if provided
    const resolvedPath = customPath ? path.resolve(customPath) : undefined;

    // Use async version to auto-detect store type based on service key format
    const { serviceKeyStore, sessionStore, storeType } = await getPlatformStoresAsync(
      resolvedPath,
      unsafe,
      destination
    );

    logger.debug("Platform stores created", {
      type: "PLATFORM_STORES_CREATED",
      destination: destination || 'default',
      clientKey: clientKey || 'global',
      platform: process.platform,
      unsafe,
      storeType,
      sessionStoreType: unsafe ? 'FileSessionStore' : 'SafeSessionStore (in-memory)',
    });

    // Use BtpTokenProvider for browser-based OAuth2
    const tokenProvider = new BtpTokenProvider();

    const authBroker = new AuthBroker(
      {
        serviceKeyStore,
        sessionStore,
        tokenProvider,
      },
      'system',
      defaultLogger
    );

    authBrokers.set(brokerKey, authBroker);

    logger.info("AuthBroker created for destination", {
      type: "AUTH_BROKER_CREATED",
      destination: destination || 'default',
      clientKey: clientKey || 'global',
      platform: process.platform,
    });

    return authBroker;
  } catch (error) {
    logger.error("Failed to create AuthBroker for destination", {
      type: "AUTH_BROKER_CREATE_FAILED",
      destination: destination || 'default',
      clientKey: clientKey || 'global',
      platform: process.platform,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return undefined;
  }
}

/**
 * Remove an AuthBroker from registry
 */
export function removeAuthBroker(destination?: string, clientKey?: string): boolean {
  const key = buildAuthBrokerKey(destination, clientKey);
  return authBrokers.delete(key);
}

/**
 * Clear all AuthBroker instances
 */
export function clearAuthBrokers(): void {
  authBrokers.clear();
}

/**
 * Get count of registered AuthBrokers
 */
export function getAuthBrokerCount(): number {
  return authBrokers.size;
}

/**
 * Get all registered broker keys (for debugging)
 */
export function getAuthBrokerKeys(): string[] {
  return Array.from(authBrokers.keys());
}
