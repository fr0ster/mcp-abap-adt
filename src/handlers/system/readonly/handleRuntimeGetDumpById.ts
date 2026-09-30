import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { XMLParser } from 'fast-xml-parser';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetDumpById',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] Read an ABAP runtime dump by its dump_id or URI. Answers a summary — runtime error, exception, terminated program, time, user, and the source position where it terminated — and the parsed dump.',
  inputSchema: {
    type: 'object',
    properties: {
      dump_id: {
        type: 'string',
        description:
          "The dump's id, or its URI as a dumps feed entry carries it.",
      },
      view: {
        type: 'string',
        enum: ['default', 'summary', 'formatted'],
        description:
          'Dump view mode: default payload, summary section, or formatted long text.',
        default: 'default',
      },
      response_mode: {
        type: 'string',
        enum: ['payload', 'summary', 'both'],
        description:
          'What is returned: "payload" — the parsed dump, "summary" — runtime error, exception, terminated program, time, user and termination position, "both" — summary and payload.',
        default: 'both',
      },
    },
    required: ['dump_id'],
  },
} as const;

interface RuntimeGetDumpByIdArgs {
  dump_id: string;
  view?: 'default' | 'summary' | 'formatted';
  response_mode?: 'payload' | 'summary' | 'both';
}

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
  return value.trim().replace(/^.*\/runtime\/dumps\//, '');
}

/**
 * What a dump is about, read from the default view's `dump:dump` root: its
 * attributes name the runtime error, the exception, the terminated program,
 * when and whose; the link that carries a `#start=` fragment is the source
 * position where it terminated. Nothing when the document has no such root.
 */
export function dumpSummaryOf(
  raw: unknown,
): Record<string, unknown> | undefined {
  if (typeof raw !== 'string' || !raw.trim().startsWith('<')) return undefined;
  let root: Record<string, unknown> | undefined;
  try {
    root = dumpXmlParser.parse(raw)?.dump;
  } catch {
    return undefined;
  }
  if (!root || typeof root !== 'object') return undefined;

  const summary: Record<string, unknown> = {};
  const take = (attribute: string, as: string) => {
    const value = root?.[attribute];
    if (typeof value === 'string' && value !== '') summary[as] = value;
  };
  take('error', 'runtime_error');
  take('exception', 'exception');
  take('title', 'title');
  take('terminatedProgram', 'terminated_program');
  take('datetime', 'datetime');
  take('author', 'user');

  const linksRaw = (root.links as { link?: unknown } | undefined)?.link;
  const links = (
    Array.isArray(linksRaw) ? linksRaw : linksRaw ? [linksRaw] : []
  ) as Array<{ relation?: string; uri?: string }>;
  const termination =
    links.find(
      (l) => /termination/i.test(l.relation ?? '') && l.uri?.includes('#'),
    ) ?? links.find((l) => /#start=\d+/.test(l.uri ?? ''));
  if (termination?.uri) {
    const [uri, fragment = ''] = termination.uri.split('#');
    const line = /start=(\d+)/.exec(fragment)?.[1];
    summary.termination = line
      ? { uri: decodeURIComponent(uri), line: Number(line) }
      : { uri: decodeURIComponent(uri) };
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
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
      const result: Record<string, unknown> = {
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
