import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
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

  try {
    const dumpId = args?.dump_id?.trim();

    if (!dumpId) {
      throw new Error(
        'dump_id is required. Use RuntimeListFeeds to find dump IDs first.',
      );
    }

    const view = args.view ?? 'default';
    const responseMode = args.response_mode ?? 'both';
    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const response = await runtimeClient.getDumps().getById(dumpId, { view });
    const parsedPayload = parseRuntimePayloadToJson(response.data);

    const result: Record<string, unknown> = {
      success: true,
      dump_id: dumpId,
      view,
      status: response.status,
    };

    if (responseMode === 'summary' || responseMode === 'both') {
      const summary: Record<string, unknown> = {};
      collectKeyFacts(parsedPayload, summary);
      result.summary = summary;
    }

    if (responseMode === 'payload' || responseMode === 'both') {
      result.payload = parsedPayload;
    }

    return return_response({
      data: JSON.stringify(result, null, 2),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: response.config,
    });
  } catch (error: any) {
    logger?.error('Error reading runtime dump by ID:', error);
    return return_error(error);
  }
}
