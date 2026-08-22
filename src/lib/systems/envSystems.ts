/**
 * Discovery of switchable SAP systems from .env files.
 *
 * A "system" is just a .env file that carries a full SAP connection profile.
 * Files are looked up in (first match wins on name collision):
 *   1. MCP_SYSTEMS_PATH — colon/semicolon separated dirs (escape hatch)
 *   2. the directory of the .env file the server was started with
 *   3. the current working directory
 *   4. the platform sessions folder (~/.config/mcp-abap-adt/sessions, ...)
 *
 * Naming follows the same convention as `--env=<name>`:
 *   .env            → "default"
 *   .env.kalog      → "kalog"
 *   kalog.env       → "kalog"
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import type { SapEnvironment } from '../handlers/interfaces.js';
import { getPlatformPaths } from '../stores/platformPaths.js';

export interface SystemDescriptor {
  /** Short name used by SwitchSystem, e.g. "kalog" */
  name: string;
  /** Absolute path of the .env file */
  envPath: string;
  url: string;
  client?: string;
  authType: string;
  username?: string;
  systemType: SapEnvironment;
  connectionType: 'http' | 'rfc';
  masterSystem?: string;
  saprouter?: string;
  sysnr?: string;
  language?: string;
  /** Parsed .env contents — includes secrets, never serialize this to the client. */
  env: Record<string, string>;
}

/** Templates and samples are not connectable systems. */
const EXCLUDED_NAMES = new Set(['example', 'template', 'sample', 'dist']);

export function systemNameFromFileName(fileName: string): string | undefined {
  if (fileName === '.env') return 'default';
  if (fileName.startsWith('.env.')) {
    const name = fileName.slice('.env.'.length);
    return name.length > 0 ? name : undefined;
  }
  if (fileName.endsWith('.env') && fileName.length > '.env'.length) {
    return fileName.slice(0, -'.env'.length);
  }
  return undefined;
}

function isExcluded(name: string): boolean {
  const parts = name.toLowerCase().split('.');
  return parts.some((part) => EXCLUDED_NAMES.has(part));
}

export function toSystemType(raw?: string): SapEnvironment {
  const value = raw?.trim().toLowerCase();
  if (value === 'legacy') return 'legacy';
  if (value === 'onprem') return 'onprem';
  return 'cloud';
}

function toConnectionType(raw?: string): 'http' | 'rfc' {
  return raw?.trim().toLowerCase() === 'rfc' ? 'rfc' : 'http';
}

function detectAuthType(env: Record<string, string>): string {
  if (env.SAP_JWT_TOKEN) return 'jwt';
  return (env.SAP_AUTH_TYPE || 'basic').trim().toLowerCase();
}

/**
 * Parse a single .env file into a descriptor.
 * Returns undefined when the file is unreadable or carries no SAP_URL.
 */
export function describeSystemFile(
  envPath: string,
  name?: string,
): SystemDescriptor | undefined {
  let env: Record<string, string>;
  try {
    env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  } catch {
    return undefined;
  }

  const url = env.SAP_URL?.trim();
  if (!url) return undefined;

  const resolvedName =
    name ?? systemNameFromFileName(path.basename(envPath)) ?? 'default';

  return {
    name: resolvedName,
    envPath: path.resolve(envPath),
    url,
    client: env.SAP_CLIENT?.trim() || undefined,
    authType: detectAuthType(env),
    username: env.SAP_USERNAME?.trim() || undefined,
    systemType: toSystemType(env.SAP_SYSTEM_TYPE),
    connectionType: toConnectionType(env.SAP_CONNECTION_TYPE),
    masterSystem: env.SAP_MASTER_SYSTEM?.trim() || undefined,
    saprouter: env.SAP_SAPROUTER?.trim() || undefined,
    sysnr: env.SAP_SYSNR?.trim() || undefined,
    language: env.SAP_LANGUAGE?.trim() || undefined,
    env,
  };
}

function splitPathList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[:;]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export interface DiscoverSystemsOptions {
  /** .env the server was launched with — its directory is searched first. */
  activeEnvPath?: string;
  /** --auth-broker-path, used to locate the platform sessions folder. */
  authBrokerPath?: string;
}

export function systemSearchDirs(
  options: DiscoverSystemsOptions = {},
): string[] {
  const dirs: string[] = [];

  for (const dir of splitPathList(process.env.MCP_SYSTEMS_PATH)) {
    dirs.push(path.resolve(dir));
  }
  if (options.activeEnvPath) {
    dirs.push(path.dirname(path.resolve(options.activeEnvPath)));
  }
  dirs.push(path.resolve(process.cwd()));
  dirs.push(
    ...getPlatformPaths(
      options.authBrokerPath ? path.resolve(options.authBrokerPath) : undefined,
      'sessions',
    ),
  );

  const seen = new Set<string>();
  return dirs.filter((dir) => {
    const key = path.normalize(dir);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Scan the search dirs and return every .env file that looks like a
 * connectable SAP system, ordered by name.
 */
export function discoverSystems(
  options: DiscoverSystemsOptions = {},
): SystemDescriptor[] {
  const byName = new Map<string, SystemDescriptor>();
  const seenPaths = new Set<string>();

  for (const dir of systemSearchDirs(options)) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // dir may not exist — that is normal
    }

    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;

      const name = systemNameFromFileName(entry.name);
      if (!name || isExcluded(name)) continue;

      const fullPath = path.join(dir, entry.name);
      const resolved = path.resolve(fullPath);
      if (seenPaths.has(resolved)) continue;

      const descriptor = describeSystemFile(fullPath, name);
      if (!descriptor) continue;

      seenPaths.add(resolved);
      // First directory in the search order wins the name.
      if (!byName.has(name)) byName.set(name, descriptor);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a user-supplied system reference: either a discovered name or an
 * explicit path to a .env file.
 */
export function resolveSystemRef(
  ref: string,
  options: DiscoverSystemsOptions = {},
): { system?: SystemDescriptor; available: SystemDescriptor[] } {
  const available = discoverSystems(options);
  const trimmed = ref.trim();

  const byName = available.find(
    (candidate) => candidate.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byName) return { system: byName, available };

  // Path form: /abs/path/.env, ./.env.kalog
  const looksLikePath =
    trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.');
  if (looksLikePath) {
    const candidatePath = path.resolve(process.cwd(), trimmed);
    if (fs.existsSync(candidatePath)) {
      const system = describeSystemFile(candidatePath);
      if (system) return { system, available };
    }
  }

  return { available };
}

/** Client-safe projection — drops credentials. */
export function publicSystemInfo(
  system: SystemDescriptor,
): Omit<SystemDescriptor, 'env'> {
  const { env: _env, ...rest } = system;
  return rest;
}
