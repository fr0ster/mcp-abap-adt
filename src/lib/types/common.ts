/**
 * Common types for v2 server architecture
 */

/**
 * Server mode type
 */
export type ServerMode = 'LOCAL' | 'REMOTE';

/**
 * Transport type
 */
export type TransportType = 'stdio' | 'sse' | 'http';

/**
 * Session type (deprecated - using unified ISession)
 * @deprecated Use ISession instead
 */
export type SessionType = 'high-level' | 'low-level';
