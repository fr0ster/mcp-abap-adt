import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { registerConnectionResetHook } from './connectionEvents';

export interface IAdtSystemContext {
  masterSystem?: string;
  responsible?: string;
}

let cached: IAdtSystemContext | undefined;

export async function resolveSystemContext(
  connection: IAbapConnection,
): Promise<IAdtSystemContext> {
  if (cached) return cached;

  // Try env vars first (on-prem or explicitly configured)
  const masterSystem = process.env.SAP_MASTER_SYSTEM;
  const responsible = process.env.SAP_RESPONSIBLE || process.env.SAP_USERNAME;

  if (masterSystem || responsible) {
    cached = { masterSystem, responsible };
    return cached;
  }

  // Cloud: try getSystemInformation API
  try {
    const { getSystemInformation } = await import('@mcp-abap-adt/adt-clients');
    const info = await getSystemInformation(connection);
    cached = {
      masterSystem: info?.systemID,
      responsible: info?.userName,
    };
  } catch {
    cached = {};
  }

  return cached;
}

export function getSystemContext(): IAdtSystemContext {
  return cached || {};
}

export function resetSystemContextCache() {
  cached = undefined;
}

registerConnectionResetHook(resetSystemContextCache);
