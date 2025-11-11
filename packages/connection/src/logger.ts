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

