/**
 * What every abapGit handler shares beside its answer: the client, the
 * admission it was handed, and the header pairs its new forms send.
 *
 * - The client answers through `abapGitFacts` (adt-clients' default for the
 *   new-form slots, left empty): every member a handler calls is a new
 *   form, or the existing `unlink`, never a legacy form.
 * - The admission (`admitAbapGitCall`) is what the server read before
 *   dispatch: the R1 entry, the URL SAP is sent and the bound credential.
 *   A call that reaches a handler without it — a registry path that bypasses
 *   the server's dispatch — is refused in fixed words; nothing is sent
 *   without the binding.
 * - The header pairs are taken straight from `DEFAULT_ADT_HEADERS`, never
 *   through `withAdtHeaders`, which resends on 406/415 and would replay a
 *   credentialed request.
 */

import { AdtAbapGitClient } from '@mcp-abap-adt/adt-clients/abapgit';
import type {
  AdtNoFailure,
  IAbapGitCredentials,
  IAbapGitStructuredError,
  IAdtHeaders,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { HandlerContext } from '../../handlers/interfaces';
import { DEFAULT_ADT_HEADERS } from '../adtHeaders';
import { ServerRefusal } from '../auth/serverRefusal';
import type { AbapGitAdmission } from './admission';

/** The abapGit client a handler calls: the shipped facts for every new form. */
export function abapGitClientOf(
  connection: IAbapConnection,
  logger: ILogger | undefined,
) {
  return AdtAbapGitClient.create(connection, {
    ...(logger !== undefined ? { logger } : {}),
  });
}

/** The client's type, as `abapGitClientOf` builds it. */
export type AbapGitClient = ReturnType<typeof abapGitClientOf>;

/** The admission the server handed the call; refused without one. */
export function admissionOf(context: HandlerContext): AbapGitAdmission {
  const admission = context.abapGitAdmission;
  if (admission === undefined) {
    throw new ServerRefusal('abapgit_not_admitted');
  }
  return admission;
}

/** The R1 entry of a key-addressed call; refused without one. */
export function admittedRepo(admission: AbapGitAdmission) {
  const repo = admission.repo;
  if (repo === undefined) throw new ServerRefusal('abapgit_not_admitted');
  return repo;
}

/** The URL a URL route sends and its credential (`null`: anonymous); refused without one. */
export function admittedUrl(admission: AbapGitAdmission): {
  readonly url: string;
  readonly credentials: IAbapGitCredentials | null;
} {
  const url = admission.sendUrl;
  if (url === undefined) throw new ServerRefusal('abapgit_not_admitted');
  return { url, credentials: admission.credentials ?? null };
}

/** A key route's credential option: present only when one is bound. */
export function credentialOption(admission: AbapGitAdmission): {
  readonly credentials?: IAbapGitCredentials;
} {
  const credentials = admission.credentials;
  return credentials === undefined || credentials === null
    ? {}
    : { credentials };
}

/**
 * The judge every new form is given: SAP's verdict as the facts exchange
 * reached it — a failure stays one, a success stays one. Nothing is
 * retried, cleared or reread.
 */
export function abapGitVerdict(
  verdict: IAbapGitStructuredError | AdtNoFailure,
): IAbapGitStructuredError | AdtNoFailure {
  return verdict;
}

/** The header pairs the new forms that take `headers` send. */
export const ABAPGIT_HEADERS: {
  readonly link: IAdtHeaders;
  readonly pull: IAdtHeaders;
  readonly pullSelective: IAdtHeaders;
  readonly externalRepo: IAdtHeaders;
} = {
  link: DEFAULT_ADT_HEADERS['abapGit.link'],
  pull: DEFAULT_ADT_HEADERS['abapGit.pull'],
  pullSelective: DEFAULT_ADT_HEADERS['abapGit.pullSelective'],
  externalRepo: DEFAULT_ADT_HEADERS['abapGit.checkExternalRepo'],
};
