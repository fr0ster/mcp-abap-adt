import * as path from 'node:path';
import { getPlatformPaths } from '../stores/platformPaths';

function normalizeEnvFileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return trimmed.toLowerCase().endsWith('.env') ? trimmed : `${trimmed}.env`;
}

function isLikelyPath(input: string): boolean {
  if (!input) return false;
  if (input.includes('/') || input.includes('\\')) return true;
  if (input.startsWith('.') || input.startsWith('~')) return true;
  if (path.isAbsolute(input)) return true;
  return false;
}

function resolvePathLike(input: string): string {
  if (path.isAbsolute(input)) return input;
  return path.resolve(process.cwd(), input);
}

function firstPlatformSessionsDir(customPath?: string): string {
  const sessionsPaths = getPlatformPaths(customPath, 'sessions');
  const cwd = path.resolve(process.cwd());
  const nonCwd = sessionsPaths.find((p) => path.resolve(p) !== cwd);
  return nonCwd || sessionsPaths[0];
}

export function resolveEnvFilePath(options: {
  envDestination?: string;
  envPath?: string;
  authBrokerPath?: string;
}): string | undefined {
  const envPath = options.envPath?.trim();
  if (envPath) {
    return resolvePathLike(envPath);
  }

  const envDestination = options.envDestination?.trim();
  if (!envDestination) {
    return undefined;
  }

  // Backward compatibility: if --env was passed with a path, treat it as a path.
  if (isLikelyPath(envDestination)) {
    return resolvePathLike(envDestination);
  }

  const fileName = normalizeEnvFileName(envDestination);
  const sessionsDir = firstPlatformSessionsDir(options.authBrokerPath);
  return path.join(sessionsDir, fileName);
}

