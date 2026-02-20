import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeAnalyzeDump',
  description:
    '[runtime] Read runtime dump by ID and return compact analysis summary with key fields.',
  inputSchema: {
    type: 'object',
    properties: {
      dump_id: {
        type: 'string',
        description: 'Runtime dump ID.',
      },
      view: {
        type: 'string',
        enum: ['default', 'summary', 'formatted'],
        description:
          'Dump view mode to analyze: default payload, summary section, or formatted long text.',
        default: 'default',
      },
      include_payload: {
        type: 'boolean',
        description: 'Include full parsed payload in response.',
        default: true,
      },
    },
    required: ['dump_id'],
  },
} as const;

interface RuntimeAnalyzeDumpArgs {
  dump_id: string;
  view?: 'default' | 'summary' | 'formatted';
  include_payload?: boolean;
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

export async function handleRuntimeAnalyzeDump(
  context: HandlerContext,
  args: RuntimeAnalyzeDumpArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.dump_id) {
      throw new Error('Parameter "dump_id" is required');
    }

    const view = args.view ?? 'default';
    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const response = await runtimeClient.getRuntimeDumpById(args.dump_id, {
      view,
    });
    const parsedPayload = parseRuntimePayloadToJson(response.data);
    const summary: Record<string, unknown> = {};
    collectKeyFacts(parsedPayload, summary);

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          dump_id: args.dump_id,
          view,
          status: response.status,
          summary,
          payload: args.include_payload === false ? undefined : parsedPayload,
        },
        null,
        2,
      ),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: response.config,
    });
  } catch (error: any) {
    logger?.error('Error analyzing runtime dump:', error);
    return return_error(error);
  }
}
