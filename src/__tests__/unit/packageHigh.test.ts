/**
 * The high UpdatePackage and DeletePackage (19.0.0): one atomic tool each,
 * and the route of compact's HandlerUpdate / HandlerDelete PACKAGE, so both
 * send the same requests.
 *
 * - UpdatePackage locks, reads the package's metadata, writes it back with
 *   the description patched, and unlocks — the unlock sent whatever the
 *   write answered, nothing written when the lock is refused.
 * - DeletePackage asks the deletion check first, as every high delete, and
 *   sends no delete on a refusal or an absent package. What SAP answers to a
 *   package's deletion check is not measured: the stand-in answers it empty
 *   (permitted), or with the shapes `deletionRefusal.ts` reads for the other
 *   types.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly';
import { handleDeletePackage } from '../../handlers/package/high/handleDeletePackage';
import { handleUpdatePackage } from '../../handlers/package/high/handleUpdatePackage';
import { corpusBody } from '../../lib/adtCorpus';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../lib/handlers/interfaces';
import {
  parityConnection,
  parityRequests,
  silentLogger,
} from '../helpers/lowToCompact';
import { recordingConnection } from '../helpers/recordingConnection';

/** The requests UpdatePackageLow sent under the caller's lock (tools/low-to-compact.json). */
const lowRequestsOf = (tool: string) =>
  (
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'tools', 'low-to-compact.json'),
        'utf-8',
      ),
    ) as { rows: Array<{ tool: string; low_requests: unknown[] }> }
  ).rows.find((r) => r.tool === tool)?.low_requests;

const PACKAGE_DOCUMENT = corpusBody(
  'read-metadata-package--01-packages-zmcpshrpkg',
);
const REFUSAL =
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
  '<namespace id="com.sap.adt"/><type id="ExceptionResourceNoAccess"/>' +
  '<message lang="EN">refused</message></exc:exception>';

const ctx = (connection: unknown) =>
  ({ connection, logger: silentLogger }) as unknown as HandlerContext;

const shape = (requests: { method: string; url: string }[]) =>
  requests.map(
    (r) =>
      `${r.method} ${r.url.split('?')[0]}${r.url.includes('_action=LOCK') ? ' LOCK' : r.url.includes('_action=UNLOCK') ? ' UNLOCK' : ''}`,
  );

function compactTool(connection: unknown, name: string) {
  const context = ctx(connection);
  const entries: HandlerEntry[] = [
    ...compactModifyEntries(() => context),
    ...compactReadOnlyEntries(() => context),
  ];
  const entry = entries.find((e) => e.toolDefinition.name === name);
  if (!entry) throw new Error(name);
  return entry.handler as unknown as (args: unknown) => Promise<unknown>;
}

describe('UpdatePackage (high)', () => {
  it('locks, reads, writes the patched description and unlocks', async () => {
    const connection = parityConnection();
    const answered = (await handleUpdatePackage(ctx(connection), {
      package_name: 'pkg_a',
      description: 'New text',
      transport_request: 'XXXK900001',
    })) as { isError?: boolean };
    expect(answered.isError).toBeFalsy();
    expect(shape(connection.requests)).toEqual([
      'POST /sap/bc/adt/packages/pkg_a LOCK',
      'GET /sap/bc/adt/packages/pkg_a',
      'PUT /sap/bc/adt/packages/pkg_a',
      'POST /sap/bc/adt/packages/pkg_a UNLOCK',
    ]);
    const put = connection.requests[2];
    expect(put?.url).toContain('corrNr=XXXK900001');
    expect(String(put?.data)).toContain('adtcore:description="New text"');
  });

  it('a refused write is answered as refused, and the unlock is still sent', async () => {
    const connection = recordingConnection([
      undefined,
      { data: PACKAGE_DOCUMENT },
      { status: 400, statusText: 'Bad Request', data: REFUSAL },
    ]);
    const answered = (await handleUpdatePackage(ctx(connection), {
      package_name: 'pkg_a',
      description: 'New text',
    })) as { isError?: boolean };
    expect(answered.isError).toBe(true);
    expect(shape(connection.requests)).toEqual([
      'POST /sap/bc/adt/packages/pkg_a LOCK',
      'GET /sap/bc/adt/packages/pkg_a',
      'PUT /sap/bc/adt/packages/pkg_a',
      'POST /sap/bc/adt/packages/pkg_a UNLOCK',
    ]);
  });

  it('a refused lock writes nothing and unlocks nothing', async () => {
    const connection = recordingConnection([
      { status: 403, statusText: 'Forbidden', data: REFUSAL },
    ]);
    const answered = (await handleUpdatePackage(ctx(connection), {
      package_name: 'pkg_a',
      description: 'New text',
    })) as { isError?: boolean };
    expect(answered.isError).toBe(true);
    expect(shape(connection.requests)).toEqual([
      'POST /sap/bc/adt/packages/pkg_a LOCK',
    ]);
  });

  it('sends exactly what compact’s HandlerUpdate PACKAGE (no lock_handle) sends', async () => {
    const high = parityConnection();
    await handleUpdatePackage(ctx(high), {
      package_name: 'PKG_A',
      description: 'New text',
      transport_request: 'XXXK900001',
    });
    const compact = parityConnection();
    await compactTool(
      compact,
      'HandlerUpdate',
    )({
      object_type: 'PACKAGE',
      package_name: 'PKG_A',
      description: 'New text',
      transport_request: 'XXXK900001',
    });
    expect(parityRequests(compact.requests)).toEqual(
      parityRequests(high.requests),
    );
    expect(high.requests.length).toBe(4);
    // Inside the lock, the write the low tool sent under the caller's lock —
    // the same GET and PUT, with the lock handle the stand-in answered.
    const inner = parityRequests(high.requests.slice(1, 3));
    const low = lowRequestsOf('UpdatePackageLow') as Array<{ url: string }>;
    expect(low).toHaveLength(2);
    expect(inner.map((r) => r.method)).toEqual(['GET', 'PUT']);
    expect(inner[0]).toEqual(low[0]);
    expect(inner[1]?.data).toEqual((low[1] as { data?: unknown }).data);
  });
});

describe('HandlerUpdate PACKAGE under lock_handle', () => {
  it('takes no super_package: the write is the same without it', async () => {
    const send = async (extra: Record<string, unknown>) => {
      const connection = parityConnection();
      const answered = (await compactTool(
        connection,
        'HandlerUpdate',
      )({
        object_type: 'PACKAGE',
        package_name: 'PKG_A',
        description: 'New text',
        lock_handle: 'LOCK_HANDLE_PLACEHOLDER',
        ...extra,
      })) as { isError?: boolean };
      expect(answered.isError).toBeFalsy();
      return parityRequests(connection.requests);
    };
    const without = await send({});
    expect(without.map((r) => r.method)).toEqual(['GET', 'PUT']);
    expect(without).toEqual(await send({ super_package: 'PKG_SUPER' }));
  });
});

describe('DeletePackage (high)', () => {
  it('asks the deletion check, then sends the delete', async () => {
    const connection = parityConnection();
    await handleDeletePackage(ctx(connection), {
      package_name: 'PKG_A',
      transport_request: 'XXXK900001',
    });
    expect(shape(connection.requests)).toEqual([
      'POST /sap/bc/adt/deletion/check',
      'POST /sap/bc/adt/deletion/delete',
    ]);
    expect(String(connection.requests[1]?.data)).toContain('pkg_a');
  });

  it('a refused check sends no delete', async () => {
    // A captured refusal of another object type: the package's own is not
    // measured, and `analyseDeletion` reads the same `del:isDeletable`.
    const connection = recordingConnection([
      { data: corpusBody('refusal-deletion-check-refuses--01-deletion-check') },
    ]);
    const answered = (await handleDeletePackage(ctx(connection), {
      package_name: 'PKG_A',
    })) as { isError?: boolean };
    expect(answered.isError).toBe(true);
    expect(shape(connection.requests)).toEqual([
      'POST /sap/bc/adt/deletion/check',
    ]);
  });

  it('a package the check reports absent gets no delete', async () => {
    const absent =
      '<?xml version="1.0" encoding="utf-8"?><del:checkResponse xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">' +
      '<del:object adtcore:uri="/sap/bc/adt/packages/pkg_a" del:isDeletable="true">' +
      '<del:message del:type="W"><del:text>Object PKG_A does not exist</del:text></del:message>' +
      '</del:object></del:checkResponse>';
    const connection = recordingConnection([{ data: absent }]);
    await handleDeletePackage(ctx(connection), { package_name: 'PKG_A' });
    expect(shape(connection.requests)).toEqual([
      'POST /sap/bc/adt/deletion/check',
    ]);
  });

  it('a refused delete after a permitted check is answered as refused', async () => {
    const connection = recordingConnection([
      undefined,
      { status: 400, statusText: 'Bad Request', data: REFUSAL },
    ]);
    const answered = (await handleDeletePackage(ctx(connection), {
      package_name: 'PKG_A',
    })) as { isError?: boolean };
    expect(answered.isError).toBe(true);
    expect(connection.requests).toHaveLength(2);
  });

  it('sends exactly what compact’s HandlerDelete PACKAGE sends', async () => {
    const high = parityConnection();
    await handleDeletePackage(ctx(high), {
      package_name: 'PKG_A',
      transport_request: 'XXXK900001',
    });
    const compact = parityConnection();
    await compactTool(
      compact,
      'HandlerDelete',
    )({
      object_type: 'PACKAGE',
      package_name: 'PKG_A',
      transport_request: 'XXXK900001',
    });
    expect(parityRequests(compact.requests)).toEqual(
      parityRequests(high.requests),
    );
    expect(high.requests).toHaveLength(2);
    // The delete itself is the low tool's request; the check comes first.
    expect(parityRequests(high.requests.slice(1))).toEqual(
      lowRequestsOf('DeletePackageLow'),
    );
  });
});
