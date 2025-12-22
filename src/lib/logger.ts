/**
 * Logger module for MCP-compatible logging
 *
 * This file provides logging utilities that work both in regular console mode
 * and with the MCP Inspector. It avoids direct console.log calls which can
 * interfere with MCP's JSON-RPC communication.
 */

/**
 * Safely stringifies an object, handling circular references
 */
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
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
      const sanitizedHeaders: any = {};
      for (const [headerKey, headerValue] of Object.entries(value)) {
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
    // Remove sensitive data from config object (AxiosError.config)
    if (key === 'config' && value && typeof value === 'object') {
      const sanitizedConfig: any = {};
      for (const [configKey, configValue] of Object.entries(value)) {
        if (
          configKey === 'headers' &&
          configValue &&
          typeof configValue === 'object'
        ) {
          const sanitizedHeaders: any = {};
          for (const [headerKey, headerValue] of Object.entries(
            configValue as any,
          )) {
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
          sanitizedConfig[configKey] = sanitizedHeaders;
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
  return (message: string, data?: any) => {
    // Never log in stdio mode (MCP protocol requires clean JSON only)
    const isStdio =
      process.env.MCP_TRANSPORT === 'stdio' ||
      process.argv.includes('--transport=stdio') ||
      process.argv.includes('--stdio');
    if (isStdio) {
      return; // Suppress all logging in stdio mode
    }

    // Check if this is an expected validation/creation error (should be suppressed)
    if (level === 'ERROR' && data?.status === 400) {
      // Check if it's an expected error type (validation or resource already exists)
      const url = data?.url || '';
      const dataStr =
        typeof data?.data === 'string'
          ? data?.data
          : data?.data
            ? JSON.stringify(data.data)
            : '';
      const responseData = data?.response?.data || '';
      const allData = dataStr + responseData;

      // Check if it's a validation endpoint OR an expected error type
      const isValidationEndpoint =
        url.includes('/validation/objectname') || url.includes('/validation/');
      const isExpectedError =
        allData.includes('InvalidClifName') ||
        allData.includes('ExceptionResourceAlreadyExists') ||
        allData.includes('ResourceAlreadyExists') ||
        allData.includes('InvalidObjName') ||
        allData.includes('does already exist');

      if (isValidationEndpoint || isExpectedError) {
        // Suppress expected errors - only log if debug is enabled
        const debugEnabled =
          process.env.DEBUG_CONNECTORS === 'true' ||
          process.env.DEBUG_TESTS === 'true' ||
          process.env.DEBUG_ADT_TESTS === 'true';
        if (!debugEnabled) {
          return; // Suppress expected errors
        }
      }
    }

    // Also check AxiosError format (second ERROR log format)
    if (
      level === 'ERROR' &&
      data?.name === 'AxiosError' &&
      data?.status === 400
    ) {
      const responseData = data?.response?.data || '';
      const _configUrl = data?.config?.url || '';
      const allData =
        typeof responseData === 'string'
          ? responseData
          : JSON.stringify(responseData);

      // Check if it's an expected error type
      const isExpectedError =
        allData.includes('InvalidClifName') ||
        allData.includes('ExceptionResourceAlreadyExists') ||
        allData.includes('ResourceAlreadyExists') ||
        allData.includes('InvalidObjName') ||
        allData.includes('does already exist');

      if (isExpectedError) {
        // Suppress expected errors - only log if debug is enabled
        const debugEnabled =
          process.env.DEBUG_CONNECTORS === 'true' ||
          process.env.DEBUG_TESTS === 'true' ||
          process.env.DEBUG_ADT_TESTS === 'true';
        if (!debugEnabled) {
          return; // Suppress expected errors
        }
      }
    }

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
        ...data,
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
    const isStdio =
      process.env.MCP_TRANSPORT === 'stdio' ||
      process.argv.includes('--transport=stdio') ||
      process.argv.includes('--stdio');
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
    data?: any,
  ) => {
    // Never log in stdio mode
    const isStdio =
      process.env.MCP_TRANSPORT === 'stdio' ||
      process.argv.includes('--transport=stdio') ||
      process.argv.includes('--stdio');
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
          ...data,
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
  return (handlerName: string, step: string, message: string, data?: any) => {
    // Never log in stdio mode
    const isStdio =
      process.env.MCP_TRANSPORT === 'stdio' ||
      process.argv.includes('--transport=stdio') ||
      process.argv.includes('--stdio');
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
        ...data,
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
  info: (handlerName: string, step: string, message: string, data?: any) => {
    createHandlerLogFn('INFO')(handlerName, step, message, data);
  },
  warn: (handlerName: string, step: string, message: string, data?: any) => {
    createHandlerLogFn('WARN')(handlerName, step, message, data);
  },
  error: (handlerName: string, step: string, message: string, data?: any) => {
    createHandlerLogFn('ERROR')(handlerName, step, message, data);
  },
  debug: (handlerName: string, step: string, message: string, data?: any) => {
    createHandlerLogFn('DEBUG')(handlerName, step, message, data);
  },
};

/**
 * Connection manager logger - for getManagedConnection debug logs
 * Enabled via DEBUG_CONNECTION_MANAGER=true environment variable
 */
function createConnectionManagerLogFn(level: string) {
  return (message: string, data?: any) => {
    // Never log in stdio mode
    const isStdio =
      process.env.MCP_TRANSPORT === 'stdio' ||
      process.argv.includes('--transport=stdio') ||
      process.argv.includes('--stdio');
    if (isStdio) {
      return; // Suppress all logging in stdio mode
    }
    const debugEnabled = process.env.DEBUG_CONNECTION_MANAGER === 'true';
    if (debugEnabled) {
      const logObject = {
        level,
        timestamp: new Date().toISOString(),
        message,
        ...data,
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

export const connectionManagerLogger = {
  debug: (message: string, data?: any) => {
    createConnectionManagerLogFn('DEBUG')(message, data);
  },
  info: (message: string, data?: any) => {
    createConnectionManagerLogFn('INFO')(message, data);
  },
  warn: (message: string, data?: any) => {
    createConnectionManagerLogFn('WARN')(message, data);
  },
  error: (message: string, data?: any) => {
    createConnectionManagerLogFn('ERROR')(message, data);
  },
};
