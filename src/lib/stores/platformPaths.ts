/**
 * Platform-specific path resolution for mcp-abap-adt
 *
 * Defines default paths for service keys and sessions:
 * - Unix: ~/.config/mcp-abap-adt/service-keys, ~/.config/mcp-abap-adt/sessions
 * - Windows: %USERPROFILE%\Documents\mcp-abap-adt\service-keys, %USERPROFILE%\Documents\mcp-abap-adt\sessions
 */

import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Get platform-specific default paths for service keys and sessions
 *
 * Priority:
 * 1. Custom path (if provided)
 * 2. AUTH_BROKER_PATH environment variable
 * 3. Platform-specific standard paths:
 *    - Unix: ~/.config/mcp-abap-adt/service-keys, ~/.config/mcp-abap-adt/sessions
 *    - Windows: %USERPROFILE%\Documents\mcp-abap-adt\service-keys, %USERPROFILE%\Documents\mcp-abap-adt\sessions
 * 4. Current working directory (process.cwd())
 *
 * @param customPath Optional custom path (highest priority)
 * @param subfolder Subfolder name ('service-keys' or 'sessions')
 * @returns Array of resolved absolute paths
 */
export function getPlatformPaths(
  customPath?: string | string[],
  subfolder?: 'service-keys' | 'sessions',
): string[] {
  const paths: string[] = [];
  const isWindows = process.platform === 'win32';

  // Priority 1: Custom path from constructor
  // customPath is ALWAYS a base path - we add subfolder to it
  if (customPath) {
    if (Array.isArray(customPath)) {
      // For arrays, add subfolder to each path if subfolder is specified
      paths.push(
        ...customPath.map((p) => {
          let resolved = path.resolve(p);
          // If path already ends with subfolder, use parent directory as base
          if (subfolder && path.basename(resolved) === subfolder) {
            resolved = path.dirname(resolved);
          }
          return subfolder ? path.join(resolved, subfolder) : resolved;
        }),
      );
    } else {
      // For single path, add subfolder if specified
      // customPath is ALWAYS a base path - we add subfolder to it
      let resolved = path.resolve(customPath);
      // If path already ends with subfolder, use parent directory as base
      if (subfolder && path.basename(resolved) === subfolder) {
        resolved = path.dirname(resolved);
      }
      paths.push(subfolder ? path.join(resolved, subfolder) : resolved);
    }
  }

  // Priority 2: AUTH_BROKER_PATH environment variable
  // AUTH_BROKER_PATH is ALWAYS a base path - we add subfolder to it
  const envPath = process.env.AUTH_BROKER_PATH;
  if (envPath) {
    // Support both colon (Unix) and semicolon (Windows) separators
    const envPaths = envPath
      .split(/[:;]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    paths.push(
      ...envPaths.map((p) => {
        let resolved = path.resolve(p);
        // If path already ends with subfolder, use parent directory as base
        if (subfolder && path.basename(resolved) === subfolder) {
          resolved = path.dirname(resolved);
        }
        return subfolder ? path.join(resolved, subfolder) : resolved;
      }),
    );
  }

  // Priority 3: Platform-specific standard paths
  if (paths.length === 0) {
    // Only add platform-specific paths if no custom paths were provided
    const homeDir = os.homedir();

    if (isWindows) {
      // Windows: %USERPROFILE%\Documents\mcp-abap-adt\{subfolder}
      const basePath = path.join(homeDir, 'Documents', 'mcp-abap-adt');
      if (subfolder) {
        paths.push(path.join(basePath, subfolder));
      } else {
        paths.push(basePath);
      }
    } else {
      // Unix (Linux/macOS): ~/.config/mcp-abap-adt/{subfolder}
      const basePath = path.join(homeDir, '.config', 'mcp-abap-adt');
      if (subfolder) {
        paths.push(path.join(basePath, subfolder));
      } else {
        paths.push(basePath);
      }
    }
  }

  // Priority 4: Current working directory (always added as fallback)
  paths.push(process.cwd());

  // Remove duplicates while preserving order
  const uniquePaths: string[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    const normalized = path.normalize(p);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniquePaths.push(normalized);
    }
  }

  return uniquePaths;
}
