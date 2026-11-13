/**
 * Logger module for MCP-compatible logging
 *
 * This file provides logging utilities that work both in regular console mode
 * and with the MCP Inspector. It avoids direct console.log calls which can
 * interfere with MCP's JSON-RPC communication.
 */

import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { entries } from './xml/tree';

/**
 * What a log line spreads of its data: an object's own members; a value
 * that is not an object adds none.
 */
function spreadable(data: unknown): object {
  return typeof data === 'object' && data !== null ? data : {};
}

/**
 * Safely stringifies an object, handling circular references
 */
/** A header map with the credentials it may hold replaced. */
function redactedHeaders(headers: unknown): Record<string, unknown> {
  const sanitizedHeaders: Record<string, unknown> = {};
  for (const [headerKey, headerValue] of entries(headers)) {
    if (
      headerKey.toLowerCase() === 'authorization' ||
      headerKey.toLowerCase() === 'cookie' ||
      headerKey.toLowerCase() === 'x-csrf-token'
    ) {
      sanitizedHeaders[headerKey] = '[REDACTED]';
    } else {
      sanitizedHeaders[headerKey] = headerValue;
    }
  }
  return sanitizedHeaders;
}

/** A log line's fields as JSON: circular and transport objects named, credentials redacted. */
function safeStringify(obj: object): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key: string, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    // Remove common circular reference sources
    if (
      key === 'socket' ||
      key === '_httpMessage' ||
      key === 'res' ||
      key === 'req'
    ) {
      return '[HTTP Object]';
    }
    // Remove sensitive headers (Authorization, Cookie, etc.)
    if (key === 'Authorization' || key === 'authorization') {
      return '[REDACTED]';
    }
    // Remove sensitive data from config.headers
    if (key === 'headers' && value && typeof value === 'object') {
      return redactedHeaders(value);
    }
    // Remove sensitive data from config object (AxiosError.config)
    if (key === 'config' && value && typeof value === 'object') {
      const sanitizedConfig: Record<string, unknown> = {};
      for (const [configKey, configValue] of entries(value)) {
        if (
          configKey === 'headers' &&
          configValue &&
          typeof configValue === 'object'
        ) {
          sanitizedConfig[configKey] = redactedHeaders(configValue);
        } else {
          sanitizedConfig[configKey] = configValue;
        }
      }
      return sanitizedConfig;
    }
    return value;
  });
}

// Logger functions for different log levels
function createLogFn(level: string) {
  return (message: string, data?: unknown) => {
    // Never log in stdio mode (MCP protocol requires clean JSON only)
    // `--transport` is gone: only the explicit `--stdio` mark is left.
    const isStdio = process.argv.includes('--stdio');
    if (isStdio) {
      return; // Suppress all logging in stdio mode
    }

    // No line is judged by what SAP said in it: every level, ERROR
    // included, is written only in debug mode, and every line then.
    // All log levels (including ERROR) require DEBUG_CONNECTORS, DEBUG_TESTS, or DEBUG_ADT_TESTS to be enabled
    // This prevents verbose error logs from appearing in test output when debug is not enabled
    const debugEnabled =
      process.env.DEBUG_CONNECTORS === 'true' ||
      process.env.DEBUG_TESTS === 'true' ||
      process.env.DEBUG_ADT_TESTS === 'true';
    const shouldLog = debugEnabled;

    if (shouldLog) {
      // In debug mode with MCP Inspector, use process.stderr instead of console.log
      // This avoids interfering with MCP's JSON-RPC protocol
      const logObject = {
        level,
        timestamp: new Date().toISOString(),
        message,
        ...spreadable(data),
      };

      // Output to stderr which won't interfere with MCP communication
      // Use safe stringify to avoid circular reference errors
      try {
        process.stderr.write(`${safeStringify(logObject)}\n`);
      } catch (_e) {
        // Fallback if safe stringify still fails
        process.stderr.write(
          `${JSON.stringify({
            level,
            timestamp: new Date().toISOString(),
            message,
            error: 'Failed to serialize log data',
          })}\n`,
        );
      }
    }
  };
}

// Export log functions
export const logger = {
  info: createLogFn('INFO'),
  warn: createLogFn('WARN'),
  error: createLogFn('ERROR'),
  debug: createLogFn('DEBUG'),

  // Special handler for TLS config
  tlsConfig: (rejectUnauthorized: boolean) => {
    // Never log in stdio mode
    // `--transport` is gone: only the explicit `--stdio` mark is left.
    const isStdio = process.argv.includes('--stdio');
    if (isStdio) {
      return; // Suppress all logging in stdio mode
    }
    const debugEnabled = process.env.DEBUG_CONNECTORS === 'true';
    if (debugEnabled) {
      const message = `TLS certificate validation is ${
        rejectUnauthorized ? 'enabled' : 'disabled'
      }`;
      process.stderr.write(
        `${JSON.stringify({
          level: 'INFO',
          timestamp: new Date().toISOString(),
          type: 'TLS_CONFIG',
          message,
          rejectUnauthorized,
        })}\n`,
      );
    }
  },

  // Special handler for CSRF token
  csrfToken: (
    type: 'fetch' | 'success' | 'error' | 'retry',
    message: string,
    data?: unknown,
  ) => {
    // Never log in stdio mode
    // `--transport` is gone: only the explicit `--stdio` mark is left.
    const isStdio = process.argv.includes('--stdio');
    if (isStdio) {
      return; // Suppress all logging in stdio mode
    }
    const debugEnabled = process.env.DEBUG_CONNECTORS === 'true';
    if (debugEnabled) {
      process.stderr.write(
        `${JSON.stringify({
          level: type === 'error' ? 'ERROR' : 'INFO',
          timestamp: new Date().toISOString(),
          type: `CSRF_${type.toUpperCase()}`,
          message,
          ...spreadable(data),
        })}\n`,
      );
    }
  },
};

/**
 * Handler-specific logger for detailed debugging
 * Enabled via DEBUG_HANDLERS=true environment variable
 */
function createHandlerLogFn(level: string) {
  return (
    handlerName: string,
    step: string,
    message: string,
    data?: unknown,
  ) => {
    // Never log in stdio mode
    // `--transport` is gone: only the explicit `--stdio` mark is left.
    const isStdio = process.argv.includes('--stdio');
    if (isStdio) {
      return; // Suppress all logging in stdio mode
    }
    const debugEnabled = process.env.DEBUG_HANDLERS === 'true';
    if (debugEnabled) {
      const logObject = {
        level,
        timestamp: new Date().toISOString(),
        handler: handlerName,
        step,
        message,
        ...spreadable(data),
      };

      try {
        process.stderr.write(`${safeStringify(logObject)}\n`);
      } catch (_e) {
        process.stderr.write(
          `${JSON.stringify({
            level,
            timestamp: new Date().toISOString(),
            handler: handlerName,
            step,
            message,
            error: 'Failed to serialize log data',
          })}\n`,
        );
      }
    }
  };
}

export const handlerLogger = {
  info: (
    handlerName: string,
    step: string,
    message: string,
    data?: unknown,
  ) => {
    createHandlerLogFn('INFO')(handlerName, step, message, data);
  },
  warn: (
    handlerName: string,
    step: string,
    message: string,
    data?: unknown,
  ) => {
    createHandlerLogFn('WARN')(handlerName, step, message, data);
  },
  error: (
    handlerName: string,
    step: string,
    message: string,
    data?: unknown,
  ) => {
    createHandlerLogFn('ERROR')(handlerName, step, message, data);
  },
  debug: (
    handlerName: string,
    step: string,
    message: string,
    data?: unknown,
  ) => {
    createHandlerLogFn('DEBUG')(handlerName, step, message, data);
  },
};

/**
 * Connection manager logger - for getManagedConnection debug logs
 * Enabled via DEBUG_CONNECTION_MANAGER=true environment variable
 */
function createConnectionManagerLogFn(level: string) {
  return (message: string, data?: unknown) => {
    // Never log in stdio mode
    // `--transport` is gone: only the explicit `--stdio` mark is left.
    const isStdio = process.argv.includes('--stdio');
    if (isStdio) {
      return; // Suppress all logging in stdio mode
    }
    const debugEnabled = process.env.DEBUG_CONNECTION_MANAGER === 'true';
    if (debugEnabled) {
      const logObject = {
        level,
        timestamp: new Date().toISOString(),
        message,
        ...spreadable(data),
      };

      try {
        process.stderr.write(`${safeStringify(logObject)}\n`);
      } catch (_e) {
        process.stderr.write(
          `${JSON.stringify({
            level,
            timestamp: new Date().toISOString(),
            message,
            error: 'Failed to serialize log data',
          })}\n`,
        );
      }
    }
  };
}

export const connectionManagerLogger: ILogger = {
  debug(message: string, data?: unknown) {
    createConnectionManagerLogFn('DEBUG')(message, data);
  },
  info(message: string, data?: unknown) {
    createConnectionManagerLogFn('INFO')(message, data);
  },
  warn(message: string, data?: unknown) {
    createConnectionManagerLogFn('WARN')(message, data);
  },
  error(message: string, data?: unknown) {
    createConnectionManagerLogFn('ERROR')(message, data);
  },
};
