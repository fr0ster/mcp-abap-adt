/**
 * Logger interface for connection layer
 * Allows connection layer to be independent of specific logger implementation
 */
export interface ILogger {
  /**
   * Log informational message
   */
  info(message: string, meta?: any): void;

  /**
   * Log error message
   */
  error(message: string, meta?: any): void;

  /**
   * Log warning message
   */
  warn(message: string, meta?: any): void;

  /**
   * Log debug message
   */
  debug(message: string, meta?: any): void;

  /**
   * Log CSRF token operations
   * @param action - Type of CSRF operation: "fetch", "retry", "success", or "error"
   * @param message - Log message
   * @param meta - Additional metadata
   */
  csrfToken?(
    action: "fetch" | "retry" | "success" | "error",
    message: string,
    meta?: any
  ): void;

  /**
   * Log TLS configuration
   * @param rejectUnauthorized - Whether TLS certificate validation is enabled
   */
  tlsConfig?(rejectUnauthorized: boolean): void;
}

/**
 * Session state interface for stateful connections
 * Contains cookies and CSRF token that need to be preserved across requests
 */
export interface SessionState {
  cookies: string | null;
  csrfToken: string | null;
  cookieStore: Record<string, string>;
}

/**
 * Interface for storing and retrieving session state
 * Allows connection layer to persist session state (cookies, CSRF token) externally
 */
export interface ISessionStorage {
  /**
   * Save session state for a given session ID
   * @param sessionId - Unique session identifier
   * @param state - Session state to save
   */
  save(sessionId: string, state: SessionState): Promise<void>;

  /**
   * Load session state for a given session ID
   * @param sessionId - Unique session identifier
   * @returns Session state or null if not found
   */
  load(sessionId: string): Promise<SessionState | null>;

  /**
   * Delete session state for a given session ID
   * @param sessionId - Unique session identifier
   */
  delete(sessionId: string): Promise<void>;
}

