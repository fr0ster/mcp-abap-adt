/**
 * ADT changes are not made without a responsible person and a master system.
 *
 * `createAdtClient` hands adt-clients a system context whose `responsible`
 * and `masterSystem` refuse to be read empty. adt-clients reads them exactly
 * where it is about to send them — a create's `adtcore:responsible` /
 * `adtcore:masterSystem`, a transport's owner — and only when the tool's own
 * arguments did not state the value, so the refusal falls on exactly the
 * operations that need them, before their request is built, and on no read.
 *
 * The words are fixed and name only keys: no value reaches them (H4).
 */

import type { IAdtSystemContext } from './systemContext';

export const MISSING_RESPONSIBLE =
  'No responsible person for this change: set SAP_RESPONSIBLE (the destination .env or the environment; SAP_USERNAME is used when it is not set), or send the x-sap-responsible header, or pass the tool argument where the tool has one. ADT changes are not made without one';

export const MISSING_MASTER_SYSTEM =
  'No master system for this change: set SAP_MASTER_SYSTEM (the destination .env or the environment), or send the x-sap-master-system header. On ABAP Cloud it is asked of the system when not configured. ADT changes are not made without one';

/** The refusal of a change that lacks a responsible or a master system. */
export class SystemContextMissingError extends Error {
  constructor(readonly key: 'responsible' | 'masterSystem') {
    super(key === 'responsible' ? MISSING_RESPONSIBLE : MISSING_MASTER_SYSTEM);
    this.name = 'SystemContextMissingError';
  }
}

/** Whether a failure's words are this refusal's (adt-clients keeps only the message). */
export function isSystemContextRefusal(message: unknown): boolean {
  return message === MISSING_RESPONSIBLE || message === MISSING_MASTER_SYSTEM;
}

/**
 * The context adt-clients reads: the language as given, the responsible and
 * master system as getters that throw `SystemContextMissingError` when empty.
 */
export function guardedSystemContext(
  context: IAdtSystemContext,
): IAdtSystemContext {
  const { masterSystem, responsible, masterLanguage } = context;
  return {
    masterLanguage,
    get masterSystem(): string {
      if (!masterSystem) throw new SystemContextMissingError('masterSystem');
      return masterSystem;
    },
    get responsible(): string {
      if (!responsible) throw new SystemContextMissingError('responsible');
      return responsible;
    },
  };
}
