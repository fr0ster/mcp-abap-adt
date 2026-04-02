import { AdtRuntimeClient, buildDumpIdPrefix } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { handleRuntimeListDumps } from './handleRuntimeListDumps';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetDumpById',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] Read a specific ABAP runtime dump. Identify the dump by datetime + user (preferred, e.g. from a CALM event), or pass dump_id directly if already known.',
  inputSchema: {
    type: 'object',
    properties: {
      datetime: {
        type: 'string',
        description:
          'Dump datetime (ISO or "YYYY-MM-DD HH:MM:SS"). Combined with user, uniquely identifies the dump. Preferred over dump_id.',
      },
      user: {
        type: 'string',
        description:
          'SAP username whose dump to read. Required when using datetime lookup.',
      },
      dump_id: {
        type: 'string',
        description:
          'Full runtime dump ID. Use only when already known; prefer datetime + user otherwise.',
      },
      view: {
        type: 'string',
        enum: ['default', 'summary', 'formatted'],
        description:
          'Dump view mode: default payload, summary section, or formatted long text.',
        default: 'default',
      },
    },
    required: [],
  },
} as const;

interface RuntimeGetDumpByIdArgs {
  dump_id?: string;
  datetime?: string;
  user?: string;
  view?: 'default' | 'summary' | 'formatted';
}

function parseDatetimeToMs(raw: string): number {
  const trimmed = raw.trim();
  // "2026-03-31 18:53:47" — space-separated, treat as UTC
  const spaceForm = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/,
  );
  if (spaceForm) {
    return Date.parse(`${spaceForm[1]}T${spaceForm[2]}Z`);
  }
  // ISO with or without Z/offset — let Date handle it
  const ms = Date.parse(trimmed);
  if (!isNaN(ms)) return ms;
  throw new Error(`Cannot parse datetime: "${raw}"`);
}

function datetimeToSapLocal(raw: string): string | undefined {
  // Convert UTC datetime to YYYYMMDDHHMMSS (best-effort, no TZ conversion —
  // caller should pass system-local time if known, or we use UTC as fallback)
  const ms = parseDatetimeToMs(raw);
  if (isNaN(ms)) return undefined;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

async function resolveDumpId(
  context: HandlerContext,
  datetime: string,
  user: string,
): Promise<string> {
  const targetMs = parseDatetimeToMs(datetime);

  // Build from/to window (±2 min) in YYYYMMDDHHMMSS for server-side filtering
  const fromMs = targetMs - 2 * 60_000;
  const toMs = targetMs + 2 * 60_000;
  const fromSap = datetimeToSapLocal(new Date(fromMs).toISOString());
  const toSap = datetimeToSapLocal(new Date(toMs).toISOString());

  const listResult = await handleRuntimeListDumps(context, {
    user,
    from: fromSap,
    to: toSap,
    top: 20,
  });

  if (listResult.isError) {
    const msg = listResult.content[0]?.text ?? 'unknown error';
    throw new Error(`Failed to list dumps for user "${user}": ${msg}`);
  }

  const text = listResult.content.find((c: any) => c.type === 'text')?.text;
  const data = JSON.parse(text!);
  const dumps: Array<{ dump_id: string; datetime: string }> = data.dumps ?? [];

  // Find closest match within ±60 seconds
  let best: { dump_id: string; diff: number } | undefined;
  for (const d of dumps) {
    const dMs = parseDatetimeToMs(d.datetime);
    const diff = Math.abs(dMs - targetMs);
    if (diff <= 60_000 && (!best || diff < best.diff)) {
      best = { dump_id: d.dump_id, diff };
    }
  }

  if (!best) {
    throw new Error(
      `No dump found for user="${user}" near datetime="${datetime}" (±60s). Available: ${dumps.map((d) => d.datetime).join(', ')}`,
    );
  }

  return best.dump_id;
}

export async function handleRuntimeGetDumpById(
  context: HandlerContext,
  args: RuntimeGetDumpByIdArgs,
) {
  const { connection, logger } = context;

  try {
    let dumpId = args?.dump_id?.trim();

    if (!dumpId) {
      if (!args?.datetime || !args?.user) {
        throw new Error(
          'Provide either "dump_id" or both "datetime" and "user"',
        );
      }
      dumpId = await resolveDumpId(context, args.datetime, args.user);
    }

    const view = args.view ?? 'default';
    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const response = await runtimeClient.getRuntimeDumpById(dumpId, { view });

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          dump_id: dumpId,
          view,
          status: response.status,
          payload: parseRuntimePayloadToJson(response.data),
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
    logger?.error('Error reading runtime dump by ID:', error);
    return return_error(error);
  }
}
