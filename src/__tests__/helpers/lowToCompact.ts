/**
 * The ADT stand-in the low → compact parity runs against, and what a row of
 * `tools/low-to-compact.json` is.
 *
 * The stand-in is a `recordingConnection` (real adt-clients code runs, the
 * requests it sends are recorded) that answers a lock with a real lock
 * handle, a metadata read of a package, domain or data element with a
 * captured document (so a properties write has something to patch), and
 * everything else `200` with an empty body.
 */

import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody } from '../../lib/adtCorpus';
import {
  type RecordedRequest,
  type RecordingConnection,
  recordingConnection,
} from './recordingConnection';

export interface LowToCompactRow {
  tool: string;
  group: string;
  handler: string;
  low_call: Record<string, unknown>;
  compact: Array<{ tool: string; args: Record<string, unknown> }>;
  accepted?: { kind: string; reason: string };
  note?: string;
  low_requests?: ParityRequest[];
}

/** A request as the parity compares it. */
export interface ParityRequest {
  method: string;
  url: string;
  data?: unknown;
  params?: unknown;
  headers?: Record<string, string>;
}

const METADATA_DOCUMENTS: Array<[string, string]> = [
  ['/sap/bc/adt/packages/', 'read-metadata-package--01-packages-zmcpshrpkg'],
  ['/sap/bc/adt/ddic/domains/', 'create-domain--01-ddic-domains'],
  [
    '/sap/bc/adt/ddic/dataelements/',
    'create-dataelement--01-ddic-dataelements',
  ],
];

/** The stand-in: a recording connection with the answers above. */
export function parityConnection(): RecordingConnection {
  const inner = recordingConnection();
  return {
    ...inner,
    requests: inner.requests,
    async makeAdtRequest(options) {
      const answered = await inner.makeAdtRequest(options);
      if (options.method === 'GET') {
        const url = String(options.url).toLowerCase();
        const hit = METADATA_DOCUMENTS.find(([prefix]) =>
          url.startsWith(prefix),
        );
        if (hit) {
          return {
            ...answered,
            data: corpusBody(hit[1]),
          } as IAdtWireResponse<never, never>;
        }
      }
      return answered as never;
    },
  } as RecordingConnection;
}

/** What the parity compares of a recorded request: plain JSON. */
export function parityRequests(requests: RecordedRequest[]): ParityRequest[] {
  return JSON.parse(
    JSON.stringify(
      requests.map((r) => ({
        method: r.method,
        url: r.url,
        ...(r.data !== undefined && r.data !== '' ? { data: r.data } : {}),
        ...(r.params !== undefined ? { params: r.params } : {}),
        ...(r.headers ? { headers: r.headers } : {}),
      })),
    ),
  );
}

export const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};
