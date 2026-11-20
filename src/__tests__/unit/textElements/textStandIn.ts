/**
 * The text elements parts as SAP answers them, in the forms measured on
 * premise and on the cloud (2026-11-19, `texts-translation.md` §3, §10,
 * §12.3): symbols under `@MaxLength`, a selection text's name padded to
 * eight with `@DDICReference` before a dictionary one, the five heading keys.
 */
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { recordingConnection } from '../../helpers/recordingConnection';

export const SYMBOLS =
  '@MaxLength:20\r\n001=First symbol\r\n\r\n@MaxLength:30\r\n002=Second symbol';

export const SELECTIONS =
  'P_TEST  =Test parameter\r\n\r\n@DDICReference\r\nP_AREA  =Application Area';

export const HEADINGS =
  'listHeader=List header\r\n\r\ncolumnHeader_1=First column\r\ncolumnHeader_2=\r\ncolumnHeader_3=\r\ncolumnHeader_4=';

/** The media type SAP answers each part in. */
export const MEDIA_TYPES = {
  symbols: 'application/vnd.sap.adt.textelements.symbols.v1',
  selections: 'application/vnd.sap.adt.textelements.selections.v1',
  headings: 'application/vnd.sap.adt.textelements.headings.v1',
} as const;

/** The body of a part, by the URL that reads it. */
export function partBody(url: string): string {
  if (url.includes('/source/symbols')) return SYMBOLS;
  if (url.includes('/source/selections')) return SELECTIONS;
  if (url.includes('/source/headings')) return HEADINGS;
  return '';
}

/**
 * A connection answering a part's read with its body and every other request
 * by `other`, recording the session type each request went in.
 */
export function textStandIn(
  answerFor: (
    request: IAbapRequestOptions,
  ) => { status?: number; data?: string } | Error | undefined = () => undefined,
) {
  const connection = recordingConnection();
  const sessions: string[] = [];
  let session = 'stateless';
  connection.setSessionType = (type) => {
    session = type;
  };
  const record = connection.makeAdtRequest.bind(connection);
  connection.makeAdtRequest = async <T, D>(options: IAbapRequestOptions) => {
    sessions.push(`${session} ${options.method} ${options.url}`);
    const recorded = await record(options);
    const answer = answerFor(options);
    if (answer instanceof Error) throw answer;
    return {
      ...recorded,
      status: answer?.status ?? 200,
      data:
        answer?.data ??
        (options.method === 'GET' ? partBody(options.url) : recorded.data),
    } as IAdtWireResponse<T, D>;
  };
  return { connection, sessions };
}
