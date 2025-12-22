/**
 * StdioLogger - minimal logger for stdio transport
 *
 * Only writes errors to stderr, all other log levels are no-ops
 * This is required because MCP protocol over stdio requires only JSON-RPC messages on stdout
 */

/**
 * Minimal logger for stdio transport
 * Only errors are written to stderr, all other methods are no-ops
 */
export class StdioLogger {
  info(_message: string, ..._args: any[]): void {
    // No-op for stdio - MCP protocol requires only JSON-RPC messages on stdout
  }

  error(message: string, ...args: any[]): void {
    // Write errors to stderr for stdio transport
    const errorMsg =
      args.length > 0
        ? `${message} ${args.map((a) => (a instanceof Error ? a.message : JSON.stringify(a))).join(' ')}`
        : message;
    process.stderr.write(`[ERROR] ${errorMsg}\n`);
  }

  warn(_message: string, ..._args: any[]): void {
    // No-op for stdio
  }

  debug(_message: string, ..._args: any[]): void {
    // No-op for stdio
  }
}
