import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type {
  IAdtResponse as AxiosResponse,
  IAbapConnection,
  ILogger,
} from '@mcp-abap-adt/interfaces';
import { getTimeout } from '../../../lib/utils';

export type RuntimeDumpView = 'default' | 'summary' | 'formatted';

function normalizeDumpId(dumpId: string): string {
  const normalized = dumpId?.trim();
  if (!normalized) {
    throw new Error('Runtime dump ID is required');
  }
  if (normalized.includes('/')) {
    throw new Error('Runtime dump ID must not contain "/"');
  }
  return normalized;
}

function resolveDumpRequest(view: RuntimeDumpView): {
  suffix: string;
  accept: string;
} {
  if (view === 'summary') {
    return { suffix: '/summary', accept: 'text/html' };
  }
  if (view === 'formatted') {
    return { suffix: '/formatted', accept: 'text/plain' };
  }
  return {
    suffix: '',
    accept: 'application/vnd.sap.adt.runtime.dump.v1+xml',
  };
}

/**
 * Compatibility reader for runtime dumps.
 * Tries adt-clients API first; falls back to direct ADT endpoint for stale client builds.
 */
export async function readRuntimeDumpByIdCompat(
  connection: IAbapConnection,
  logger: ILogger | undefined,
  dumpId: string,
  view: RuntimeDumpView,
): Promise<AxiosResponse> {
  const runtimeClient = new AdtRuntimeClient(connection, logger) as unknown as {
    getRuntimeDumpById: (
      id: string,
      options?: { view?: RuntimeDumpView },
    ) => Promise<AxiosResponse>;
  };

  try {
    return await runtimeClient.getRuntimeDumpById(dumpId, { view });
  } catch (error) {
    const normalized = normalizeDumpId(dumpId);
    const req = resolveDumpRequest(view);
    logger?.debug?.(
      'Runtime dump read via AdtRuntimeClient failed, using compatibility fallback',
      {
        dumpId: normalized,
        view,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return connection.makeAdtRequest({
      url: `/sap/bc/adt/runtime/dump/${normalized}${req.suffix}`,
      method: 'GET',
      timeout: getTimeout('default'),
      headers: {
        Accept: req.accept,
      },
    });
  }
}
