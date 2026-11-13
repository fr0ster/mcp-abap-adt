import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { JsonValue } from '../../../lib/json';
import { afterLast, digitsAfter } from '../../../lib/plainText';
import { return_error } from '../../../lib/utils';
import { attr, child, childAt, isList } from '../../../lib/xml/tree';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetDumpById',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [runtime] Read an ABAP runtime dump by its dump_id or URI. Answers a summary — runtime error, exception, terminated program, time, user, and the source position where it terminated — and the parsed dump.',
  inputSchema: z.object({
    dump_id: z
      .string()
      .describe("The dump's id, or its URI as a dumps feed entry carries it."),
    view: z
      .enum(['default', 'summary', 'formatted'])
      .default('default')
      .optional()
      .describe(
        'Dump view mode: default payload, summary section, or formatted long text.',
      ),
    response_mode: z
      .enum(['payload', 'summary', 'both'])
      .default('both')
      .optional()
      .describe(
        'What is returned: "payload" — the parsed dump, "summary" — runtime error, exception, terminated program, time, user and termination position, "both" — summary and payload.',
      ),
  }),
} as const;

type RuntimeGetDumpByIdArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

const dumpXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
});

/**
 * The id `getById` takes. A caller may hold the dump's URI instead — the
 * entry id of the dumps feed, `/sap/bc/adt/vit/runtime/dumps/<id>`, or its
 * link — so everything up to `runtime/dumps/` is dropped.
 */
export function dumpIdFrom(value: string): string {
  return afterLast(value.trim(), '/runtime/dumps/');
}

/**
 * The relation of the link to the source position a dump terminated at, as
 * the BTP ABAP environment answered it (2026-10-01): compared as a whole.
 */
const TERMINATION_RELATION =
  'http://www.sap.com/adt/relations/runtime/dump/termination';

/** The members of a dump's summary read from its root's attributes. */
type DumpSummaryField =
  | 'runtime_error'
  | 'exception'
  | 'title'
  | 'terminated_program'
  | 'datetime'
  | 'user';

/** What a dump is about ({@link dumpSummaryOf}), in this order. */
export type DumpSummary = { [field in DumpSummaryField]?: string } & {
  termination?: { uri: string; line?: number };
};

/**
 * What a dump is about, read from the default view's `dump:dump` root: its
 * attributes name the runtime error, the exception, the terminated program,
 * when and whose; the link of relation `TERMINATION_RELATION` is the source
 * position where it terminated. That link is addressed `adt://<system>/sap/
 * bc/adt/…#start=<line>,<column>` (BTP ABAP environment, 2026-10-01): the
 * system part is dropped, so the URI is the ADT path any reader takes.
 * Nothing when the document has no such root.
 */
export function dumpSummaryOf(raw: string): DumpSummary | undefined {
  if (!raw.trim().startsWith('<')) return undefined;
  let parsed: unknown;
  try {
    parsed = dumpXmlParser.parse(raw);
  } catch {
    return undefined;
  }
  const root = child(parsed, 'dump');
  if (!root || typeof root !== 'object') return undefined;

  const summary: DumpSummary = {};
  const take = (attribute: string, as: DumpSummaryField) => {
    const value = child(root, attribute);
    if (typeof value === 'string' && value !== '') summary[as] = value;
  };
  take('error', 'runtime_error');
  take('exception', 'exception');
  take('title', 'title');
  take('terminatedProgram', 'terminated_program');
  take('datetime', 'datetime');
  take('author', 'user');

  const linksRaw = childAt(root, 'links', 'link');
  const links = (isList(linksRaw) ? linksRaw : linksRaw ? [linksRaw] : []).map(
    (link) => ({
      relation: attr(link, 'relation'),
      uri: attr(link, 'uri'),
    }),
  );
  const termination = links.find((l) => l.relation === TERMINATION_RELATION);
  if (termination?.uri) {
    const [addressed, fragment = ''] = termination.uri.split('#');
    const uri = withoutAdtSystem(addressed);
    const line = digitsAfter(fragment, 'start=');
    summary.termination = line
      ? { uri: decodeURIComponent(uri), line: Number(line) }
      : { uri: decodeURIComponent(uri) };
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
}

/** An `adt://<system>/…` URI without its `adt://<system>` part; any other URI as it is. */
function withoutAdtSystem(uri: string): string {
  if (!uri.startsWith('adt://')) return uri;
  const path = uri.indexOf('/', 'adt://'.length);
  return path === -1 ? '' : uri.slice(path);
}

export async function handleRuntimeGetDumpById(
  context: HandlerContext,
  args: RuntimeGetDumpByIdArgs,
) {
  const { connection, logger } = context;
  const dumpId = dumpIdFrom(args?.dump_id ?? '');

  if (!dumpId) {
    return return_error(
      new Error(
        'dump_id is required. Use RuntimeListFeeds to find dump IDs first.',
      ),
    );
  }

  const view = args.view ?? 'default';
  const responseMode = args.response_mode ?? 'both';
  const dumps = new AdtRuntimeClient(connection, logger).getDumps();

  // `getById` still answers the raw document (`IAdtResponse<string>`,
  // defaulted to `rawDocument` — the same transport-frame `.data` this
  // handler used to read, just reached through `.getResult().value` now).
  // `parseRuntimePayloadToJson` stays: there is still XML/JSON text here to
  // turn into an object, unlike the profiler's own views (see
  // `handleRuntimeGetProfilerTraceData.ts`), which the library now parses
  // itself. `status`/`statusText`/`headers`/`config` are dropped — the
  // envelope carries no transport state to read them from any more.
  return answer(
    { tool: 'RuntimeGetDumpById', detail: 'terse' },
    () => dumps.getById(dumpId, { analyse: analyseException, view }),
    (raw) => {
      const parsedPayload = parseRuntimePayloadToJson(raw);
      const result: {
        success: true;
        dump_id: string;
        view: typeof view;
        summary?: DumpSummary;
        payload?: JsonValue;
      } = {
        success: true,
        dump_id: dumpId,
        view,
      };

      if (responseMode === 'summary' || responseMode === 'both') {
        // The summary is the default view's root; the other views answer
        // a document without one, and then there is none to give.
        const summary = dumpSummaryOf(raw);
        if (summary) result.summary = summary;
      }

      if (responseMode === 'payload' || responseMode === 'both') {
        result.payload = parsedPayload;
      }

      return result;
    },
  );
}
