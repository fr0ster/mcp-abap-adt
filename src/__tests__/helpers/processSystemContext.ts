/**
 * The process system context for a test, as the configuration fills it:
 * the module-global setter is gone (D26 E3 — a server states its own
 * `systemContext`), so a test that calls handlers directly, outside any
 * server, states `SAP_MASTER_SYSTEM` / `SAP_RESPONSIBLE` / `SAP_LANGUAGE`
 * for one read of the configuration (`systemContextFromConfiguration`) and
 * restores the environment at once. Merged as the setter merged: a key
 * given — `undefined` included — replaces the one held.
 */

import type { IAdtSystemContext } from '../../lib/systemContext';
import {
  getSystemContext,
  resetSystemContextCache,
  systemContextFromConfiguration,
} from '../../lib/systemContext';

const KEYS = {
  masterSystem: 'SAP_MASTER_SYSTEM',
  responsible: 'SAP_RESPONSIBLE',
  masterLanguage: 'SAP_LANGUAGE',
} as const;

export function setSystemContext(context: Partial<IAdtSystemContext>): void {
  const merged: IAdtSystemContext = { ...getSystemContext(), ...context };
  const saved = {
    masterSystem: process.env[KEYS.masterSystem],
    responsible: process.env[KEYS.responsible],
    masterLanguage: process.env[KEYS.masterLanguage],
  };
  const put = (key: keyof typeof KEYS, value: string | undefined) => {
    if (value === undefined) delete process.env[KEYS[key]];
    else process.env[KEYS[key]] = value;
  };
  try {
    put('masterSystem', merged.masterSystem);
    put('responsible', merged.responsible);
    put('masterLanguage', merged.masterLanguage);
    resetSystemContextCache();
    systemContextFromConfiguration();
  } finally {
    put('masterSystem', saved.masterSystem);
    put('responsible', saved.responsible);
    put('masterLanguage', saved.masterLanguage);
  }
}
