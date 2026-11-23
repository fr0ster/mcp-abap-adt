/**
 * A stubbed SAP for the abapGit tools: a connection that answers each
 * request from a route table and records every request as it was sent, and
 * abapGit documents shaped as SAP's simple transformations write them
 * (sanitised: every name, key, URL and person is invented; the shapes are
 * the ones adt-strategies' own fixtures follow).
 */

import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { AbapGitAdmission } from '../../lib/abapGit/admission';
import type { HandlerContext } from '../../lib/handlers/interfaces';

/** Values a credential could take; none may reach an answer, a log or a record. */
export const CANARIES = {
  user: 'canary-user-7q3z',
  token: 'ghp_CanaryToken0123456789abcdef',
  // base64 of `canary-password-xy`, as a `Password` header carries it.
  base64Password: 'Y2FuYXJ5LXBhc3N3b3JkLXh5',
} as const;

export const ALL_CANARIES = [
  CANARIES.user,
  CANARIES.token,
  CANARIES.base64Password,
] as const;

const C = `${CANARIES.user} ${CANARIES.token} ${CANARIES.base64Password}`;
const ATOM = 'xmlns:atom="http://www.w3.org/2005/Atom"';
const REL = 'http://www.sap.com/adt/abapgit/relations';

export const REPO_KEY = '000001';
export const REPO_URL = 'https://git.example.invalid/team/repo.git';
export const REPO_PACKAGE = 'ZPKG_GIT';
export const REPO_BRANCH = 'refs/heads/feature-run';

/** R1 with the one repository, as cloud writes it (with a run state). */
export const reposDocument =
  `<?xml version="1.0" encoding="utf-8"?><abapgitrepo:repositories xmlns:abapgitrepo="http://www.sap.com/adt/abapgit/repositories" ${ATOM}>` +
  '<abapgitrepo:repository>' +
  `<abapgitrepo:key>${REPO_KEY}</abapgitrepo:key>` +
  `<abapgitrepo:package>${REPO_PACKAGE}</abapgitrepo:package>` +
  `<abapgitrepo:url>${REPO_URL}</abapgitrepo:url>` +
  `<abapgitrepo:branchName>${REPO_BRANCH}</abapgitrepo:branchName>` +
  '<abapgitrepo:status>S</abapgitrepo:status><abapgitrepo:statusText>Pull finished</abapgitrepo:statusText>' +
  `<atom:link href="/sap/bc/adt/abapgit/repos/${REPO_KEY}/log/0123456789ABCDEF0123456789ABCDEF" rel="${REL}/log" type="log_link"/>` +
  '</abapgitrepo:repository>' +
  '<abapgitrepo:repository>' +
  '<abapgitrepo:key>000002</abapgitrepo:key>' +
  '<abapgitrepo:package>ZPKG_OTHER</abapgitrepo:package>' +
  '<abapgitrepo:url>https://git.example.invalid/team/other.git</abapgitrepo:url>' +
  '<abapgitrepo:branchName>refs/heads/main</abapgitrepo:branchName>' +
  '</abapgitrepo:repository></abapgitrepo:repositories>';

/** R2/R4/R8: object results, SAP's message text holding the canaries. */
export const objectResults =
  '<?xml version="1.0" encoding="utf-8"?><abapObjects:abapObjects xmlns:abapObjects="http://www.sap.com/adt/abapgit/abapObjects">' +
  '<abapObjects:abapObject><abapObjects:type>CLAS</abapObjects:type><abapObjects:name>ZCL_DEMO</abapObjects:name>' +
  '<abapObjects:package>ZPKG</abapObjects:package><abapObjects:status>E</abapObjects:status>' +
  `<abapObjects:msgType>E</abapObjects:msgType><abapObjects:msgText>Syntax error ${C}</abapObjects:msgText></abapObjects:abapObject>` +
  '</abapObjects:abapObjects>';

/** An empty object list, as R2 and onprem R4 answer (Code). */
export const noObjects =
  '<?xml version="1.0" encoding="utf-8"?><abapObjects:abapObjects xmlns:abapObjects="http://www.sap.com/adt/abapgit/abapObjects"/>';

/** R6: what a pull would overwrite, the description holding the canaries. */
export const modifiedObjects =
  '<?xml version="1.0" encoding="utf-8"?><agitpullmodifiedobjects:abapgitpullmodifiedobjects xmlns:agitpullmodifiedobjects="http://www.sap.com/adt/abapgit/agitpullmodifiedobjects" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<agitpullmodifiedobjects:overwriteObjects>' +
  `<agitpullmodifiedobjects:abapgitobjects adtcore:uri="/sap/bc/adt/oo/classes/zcl_demo" adtcore:type="CLAS/OC" adtcore:name="ZCL_DEMO" adtcore:packageName="ZPKG" agitpullmodifiedobjects:action="2" agitpullmodifiedobjects:actionDescription="Overwrite ${C}"/>` +
  '</agitpullmodifiedobjects:overwriteObjects>' +
  '<agitpullmodifiedobjects:packageWarningObjects>' +
  '<agitpullmodifiedobjects:abapgitobjects adtcore:uri="/sap/bc/adt/programs/programs/zdemo" adtcore:type="PROG/P" adtcore:name="ZDEMO" adtcore:packageName="ZOTHER" agitpullmodifiedobjects:action="3"/>' +
  '</agitpullmodifiedobjects:packageWarningObjects>' +
  '</agitpullmodifiedobjects:abapgitpullmodifiedobjects>';

/** R9: the staging, links and the comment's text holding the canaries. */
export const staging =
  `<?xml version="1.0" encoding="utf-8"?><abapgitstaging:abapgitstaging xmlns:abapgitstaging="http://www.sap.com/adt/abapgit/staging" xmlns:adtcore="http://www.sap.com/adt/core" ${ATOM}>` +
  '<abapgitstaging:unstaged_objects>' +
  '<abapgitstaging:abapgitobject abapgitstaging:wbkey="CLASZCL_DEMO" abapgitstaging:version="active" adtcore:uri="/sap/bc/adt/oo/classes/zcl_demo" adtcore:type="CLAS/OC" adtcore:name="ZCL_DEMO" adtcore:packageName="ZPKG">' +
  '<abapgitstaging:abapgitfile abapgitstaging:name="zcl_demo.clas.abap" abapgitstaging:path="/src/" abapgitstaging:localState="M" abapgitstaging:remoteState="">' +
  `<atom:link href="/sap/bc/adt/abapgit/repos/000001/files?filename=zcl_demo.clas.abap&amp;u=${CANARIES.user}" rel="${REL}/file/local" type="file_link"/>` +
  '</abapgitstaging:abapgitfile>' +
  '</abapgitstaging:abapgitobject>' +
  '</abapgitstaging:unstaged_objects>' +
  '<abapgitstaging:staged_objects/>' +
  '<abapgitstaging:ignored_objects/>' +
  `<abapgitstaging:abapgit_comment abapgitstaging:comment="Commit ${C}">` +
  '<abapgitstaging:author abapgitstaging:name="Ada Author" abapgitstaging:email="ada@example.invalid"/>' +
  '<abapgitstaging:committer abapgitstaging:name="Carl Committer" abapgitstaging:email="carl@example.invalid"/>' +
  '</abapgitstaging:abapgit_comment>' +
  '</abapgitstaging:abapgitstaging>';

/** R13/R14: an external repository's branches, display names and links holding the canaries. */
export const externalRepo = (options: { folderLogic?: boolean } = {}) =>
  `<?xml version="1.0" encoding="utf-8"?><abapgitexternalrepo:externalRepoInfo xmlns:abapgitexternalrepo="http://www.sap.com/adt/abapgit/externalRepo" ${ATOM}>` +
  '<abapgitexternalrepo:accessMode>PRIVATE</abapgitexternalrepo:accessMode>' +
  '<abapgitexternalrepo:branch>' +
  '<abapgitexternalrepo:sha1>0123456789abcdef0123456789abcdef01234567</abapgitexternalrepo:sha1>' +
  '<abapgitexternalrepo:name>refs/heads/main</abapgitexternalrepo:name>' +
  '<abapgitexternalrepo:type>HD</abapgitexternalrepo:type>' +
  '<abapgitexternalrepo:isHead>X</abapgitexternalrepo:isHead>' +
  `<abapgitexternalrepo:displayName>main ${C}</abapgitexternalrepo:displayName>` +
  (options.folderLogic
    ? '<abapgitexternalrepo:folderLogic>FULL</abapgitexternalrepo:folderLogic>'
    : '') +
  `<atom:link href="https://git.example.invalid/${CANARIES.user}:${CANARIES.token}@repo" rel="${REL}/branch" type="branch_link"/>` +
  '</abapgitexternalrepo:branch>' +
  '</abapgitexternalrepo:externalRepoInfo>';

/** An abapGit exception as SAP writes it: the T100 key kept, every text holding the canaries. */
export const exception = (options: { httpStatus?: string } = {}) =>
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
  '<namespace id="org.abapgit.adt"/>' +
  `<type id="ExceptionResourceFailure ${CANARIES.user}"/>` +
  `<message lang="EN">Authentication failed for ${C}</message>` +
  `<localizedMessage lang="EN">Authentication failed for ${C}</localizedMessage>` +
  '<properties>' +
  '<entry key="T100KEY-ID">ABAPGIT_MSG</entry><entry key="T100KEY-NO">017</entry>' +
  `<entry key="T100KEY-V1">${CANARIES.user}</entry>` +
  `<entry key="T100KEY-V2">${CANARIES.token}</entry>` +
  `<entry key="T100KEY-V3">${CANARIES.base64Password}</entry>` +
  `<entry key="LONGTEXT">The remote answered for ${C}</entry>` +
  (options.httpStatus === undefined
    ? ''
    : `<entry key="http_status">${options.httpStatus}</entry>`) +
  '</properties></exc:exception>';

/** One request, as it was sent. */
export interface SentRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly params: unknown;
  readonly data: unknown;
  readonly stateless: boolean;
  readonly noLog: boolean;
  readonly noResend: boolean;
}

/** An answer of the stub: a status and a body (a status of 400 or more is thrown, as the connector does). */
export interface StubAnswer {
  readonly status: number;
  readonly data: string;
  readonly statusText?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/** The path of a URL, without its query. */
export function pathOf(url: string): string {
  const at = url.indexOf('?');
  return at < 0 ? url : url.slice(0, at);
}

/**
 * A connection answering each request with `route(request)`: `undefined`
 * answers `200` with an empty body. A status of 400 or more is thrown with
 * its response, as the connector throws SAP's refusal.
 */
export function stubSap(
  route: (request: SentRequest) => StubAnswer | undefined = () => undefined,
) {
  const sent: SentRequest[] = [];
  const connection: IAbapConnection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://sap.example.invalid';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest<T = unknown, D = unknown>(
      options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      const request: SentRequest = {
        method: options.method,
        url: options.url,
        headers: { ...(options.headers ?? {}) },
        params: options.params,
        data: options.data,
        stateless: options.stateless === true,
        noLog: options.noLog === true,
        noResend: options.noResend === true,
      };
      sent.push(request);
      const answer = route(request) ?? { status: 200, data: '' };
      const response = {
        status: answer.status,
        statusText: answer.statusText ?? 'OK',
        headers: { ...(answer.headers ?? {}) },
        // A recorded body is text; `T` is the caller's view of it.
        data: answer.data as T,
      };
      if (answer.status >= 400) {
        throw Object.assign(new Error(`status ${answer.status} ${C}`), {
          response,
        });
      }
      return response;
    },
  };
  return { connection, sent };
}

/** The R1 entry the admission hands a key-addressed call. */
export const ADMITTED_REPO = {
  key: REPO_KEY,
  package: REPO_PACKAGE,
  url: REPO_URL,
  branchName: REPO_BRANCH,
  runStatus: 'S',
  statusText: 'Pull finished',
  appLogKey: '0123456789ABCDEF0123456789ABCDEF',
} as const;

/** A credential the admission bound. */
export const BOUND_CREDENTIALS = {
  user: CANARIES.user,
  password: CANARIES.token,
} as const;

/** A handler's context on `connection`, with `admission` when given. */
export function contextOn(
  connection: IAbapConnection,
  admission?: AbapGitAdmission,
): HandlerContext {
  return {
    connection,
    ...(admission !== undefined ? { abapGitAdmission: admission } : {}),
  };
}

/** The text of a handler's answer. */
export function answerText(result: {
  readonly content: ReadonlyArray<{ readonly text?: string }>;
}): string {
  return result.content.map((item) => item.text ?? '').join('');
}
