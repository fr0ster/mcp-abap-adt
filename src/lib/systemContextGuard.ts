/**
 * ADT changes are not made without a responsible person.
 *
 * `createAdtClient` hands adt-clients a system context whose `responsible`
 * refuses to be read empty. adt-clients reads it exactly where it is about to
 * send it — a create's `adtcore:responsible`, a transport's owner — and only
 * when the tool's own arguments did not state the value, so the refusal falls
 * on exactly the operations that need it, before their request is built, and
 * on no read. Some adt-clients builders write `adtcore:responsible=""` when
 * the value is empty (service definition, transformation, access control);
 * the refusal is what keeps that from being sent.
 *
 * The master system is not guarded: when none is known it is left out of the
 * request (adt-clients omits the attribute), and the system applies itself.
 *
 * The words are fixed and name only keys: no value reaches them (H4).
 */

import type { IAdtSystemContext } from './systemContext';

export const MISSING_RESPONSIBLE =
  'No responsible person for this change: set SAP_RESPONSIBLE (the destination .env or the environment), or send the x-sap-responsible header, or pass the tool argument where the tool has one. Without them the login is used (SAP_USERNAME, x-sap-login; on ABAP Cloud the user the system names), and none was found. ADT changes are not made without one';

/** The refusal of a change that lacks a responsible person. */
export class SystemContextMissingError extends Error {
  constructor() {
    super(MISSING_RESPONSIBLE);
    this.name = 'SystemContextMissingError';
  }
}

/** Whether a failure's words are this refusal's (adt-clients keeps only the message). */
export function isSystemContextRefusal(message: unknown): boolean {
  return message === MISSING_RESPONSIBLE;
}

/**
 * The context adt-clients reads: the language and master system as given,
 * the responsible as a getter that throws `SystemContextMissingError` when
 * empty.
 */
export function guardedSystemContext(
  context: IAdtSystemContext,
): IAdtSystemContext {
  const { masterSystem, responsible, masterLanguage } = context;
  return {
    masterLanguage,
    masterSystem,
    get responsible(): string {
      if (!responsible) throw new SystemContextMissingError();
      return responsible;
    },
  };
}
