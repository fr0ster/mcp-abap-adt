import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetDumpById',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] Read a specific ABAP runtime dump by its ID. First use RuntimeListFeeds to find dumps and get their IDs, then pass dump_id here to read the full dump content.',
  inputSchema: {
    type: 'object',
    properties: {
      dump_id: {
        type: 'string',
        description: 'Full runtime dump ID (e.g. from RuntimeListFeeds).',
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
          'Controls what is returned: "payload" — full parsed dump data, "summary" — compact key facts only (title, exception, program, line, user, date…), "both" — summary + full payload.',
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

function collectKeyFacts(
  value: unknown,
  target: Record<string, unknown>,
  depth: number = 0,
): void {
  if (!value || depth > 8 || Object.keys(target).length >= 20) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeyFacts(item, target, depth + 1);
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  const interestingKeys = [
    'title',
    'shorttext',
    'shortText',
    'category',
    'exception',
    'program',
    'include',
    'line',
    'user',
    'date',
    'time',
    'host',
    'application',
    'component',
    'client',
  ];

  const obj = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(obj)) {
    const keyNormalized = key.toLowerCase();
    const isInteresting = interestingKeys.some(
      (candidate) => keyNormalized === candidate.toLowerCase(),
    );

    if (
      isInteresting &&
      target[key] === undefined &&
      (typeof nested === 'string' ||
        typeof nested === 'number' ||
        typeof nested === 'boolean')
    ) {
      target[key] = nested;
    }

    collectKeyFacts(nested, target, depth + 1);
  }
}

export async function handleRuntimeGetDumpById(
  context: HandlerContext,
  args: RuntimeGetDumpByIdArgs,
) {
  const { connection, logger } = context;
  const dumpId = args?.dump_id?.trim();

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
        const summary: Record<string, unknown> = {};
        collectKeyFacts(parsedPayload, summary);
        result.summary = summary;
      }

      if (responseMode === 'payload' || responseMode === 'both') {
        result.payload = parsedPayload;
      }

      return result;
    },
  );
}
