import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeListDumps',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] List ABAP runtime dumps with optional user filter and paging. Returns structured list with dump_id, datetime, error type, title, and user.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description:
          'Optional username filter. If omitted, dumps for all users are returned.',
      },
      from: {
        type: 'string',
        description:
          'Start of time range in YYYYMMDDHHMMSS format (system local time). Narrows results to dumps on or after this datetime.',
      },
      to: {
        type: 'string',
        description:
          'End of time range in YYYYMMDDHHMMSS format (system local time). Narrows results to dumps on or before this datetime.',
      },
      inlinecount: {
        type: 'string',
        enum: ['allpages', 'none'],
        description: 'Include total count metadata.',
      },
      top: {
        type: 'number',
        description: 'Maximum number of records to return.',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip.',
      },
      orderby: {
        type: 'string',
        description: 'ADT order by expression.',
      },
    },
    required: [],
  },
} as const;

interface RuntimeListDumpsArgs {
  user?: string;
  from?: string;
  to?: string;
  inlinecount?: 'allpages' | 'none';
  top?: number;
  skip?: number;
  orderby?: string;
}

interface DumpEntry {
  dump_id: string;
  datetime: string;
  error: string;
  title: string;
  user: string;
}

function extractDumpId(href: string): string {
  const match = href.match(/\/runtime\/dump\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : href;
}

function parseDumpEntries(payload: unknown): DumpEntry[] {
  const feed = (payload as any)?.['atom:feed'];
  if (!feed) return [];

  const raw = feed['atom:entry'];
  if (!raw) return [];
  const entries: any[] = Array.isArray(raw) ? raw : [raw];

  return entries.map((e) => {
    const links: any[] = Array.isArray(e['atom:link'])
      ? e['atom:link']
      : [e['atom:link']];
    const selfLink = links.find((l) => l?.rel === 'self');
    const dump_id = selfLink?.href ? extractDumpId(selfLink.href) : '';

    const cats: any[] = Array.isArray(e['atom:category'])
      ? e['atom:category']
      : [e['atom:category']];
    const error: string = cats[0]?.term ?? '';

    return {
      dump_id,
      datetime: e['atom:published'] ?? '',
      error,
      title: e['atom:title'] ?? '',
      user: e['atom:author']?.['atom:name'] ?? '',
    };
  });
}

export async function handleRuntimeListDumps(
  context: HandlerContext,
  args: RuntimeListDumpsArgs,
) {
  const { connection, logger } = context;

  try {
    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const dumpsClient = runtimeClient.getDumps();
    const { user, from, to, inlinecount, top, skip, orderby } = args || {};

    const response = user
      ? await dumpsClient.listByUser(user, {
          from,
          to,
          inlinecount,
          top,
          skip,
          orderby,
        })
      : await dumpsClient.list({
          from,
          to,
          inlinecount,
          top,
          skip,
          orderby,
        });

    const payload = parseRuntimePayloadToJson(response.data);
    const dumps = parseDumpEntries(payload);

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          user_filter: user || null,
          count: dumps.length,
          dumps,
          status: response.status,
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
    logger?.error('Error listing runtime dumps:', error);
    return return_error(error);
  }
}
