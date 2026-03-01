import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { registerConnectionResetHook } from './connectionEvents';

export interface IAdtSystemContext {
  masterSystem?: string;
  responsible?: string;
}

let cached: IAdtSystemContext | undefined;

export async function resolveSystemContext(
  _connection: IAbapConnection,
): Promise<IAdtSystemContext> {
  if (cached) return cached;

  // Try env vars (on-prem or explicitly configured)
  const masterSystem = process.env.SAP_MASTER_SYSTEM;
  const responsible = process.env.SAP_RESPONSIBLE || process.env.SAP_USERNAME;

  cached = { masterSystem, responsible };
  return cached;
}

export function getSystemContext(): IAdtSystemContext {
  return cached || {};
}

export function resetSystemContextCache() {
  cached = undefined;
}

registerConnectionResetHook(resetSystemContextCache);
