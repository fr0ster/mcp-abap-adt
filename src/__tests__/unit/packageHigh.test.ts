/**
 * The high UpdatePackage and DeletePackage (19.0.0): one atomic tool each.
 * Compact HandlerDelete PACKAGE sends DeletePackage's deletion alone; compact's update is
 * the consumer's chain, one request per call — HandlerGet part metadata, then
 * HandlerUpdate with the changed document under lock_handle.
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

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { handleDeletePackage } from '../../handlers/package/high/handleDeletePackage';
import { handleUpdatePackage } from '../../handlers/package/high/handleUpdatePackage';
import type {
  HandlerContext,
  HandlerEntry,
  ToolArgs,
} from '../../lib/handlers/interfaces';
import { corpusBody } from '../helpers/adtCorpus';
import { holdingLockOf } from '../helpers/heldLocks';
import {
  parityConnection,
  parityRequests,
  silentLogger,
} from '../helpers/lowToCompact';
import { recordingConnection } from '../helpers/recordingConnection';
import { repositoryRoot } from '../helpers/repoRoot';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

/** The requests UpdatePackageLow sent under the caller's lock (tools/low-to-compact.json). */
const lowRequestsOf = (tool: string) =>
  (
    JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot(__dirname), 'tools', 'low-to-compact.json'),
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

/** A document with its master system as a placeholder. */
const neutral = (data: unknown) =>
  String(data).replace(
    /adtcore:masterSystem="[^"]*"/,
    'adtcore:masterSystem="SYSTEM_PLACEHOLDER"',
  );

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
    ...compactModifyEntries(),
    ...compactReadOnlyEntries(),
  ];
  const entry = entries.find((e) => e.toolDefinition.name === name);
  if (!entry) throw new Error(name);
  return (args: ToolArgs) =>
    entry.call({ ...context, heldLocks: holdingLockOf(args) }, args);
}

describe('UpdatePackage (high)', () => {
  it('locks, reads, writes the patched description and unlocks', async () => {
    const connection = parityConnection();
    const answered = (await handleUpdatePackage(ctx(connection), {
      package_name: 'pkg_a',
      description: 'New text',
      transport_request: 'XXXK900001',
    })) as { isError?: boolean };
    assert.ok(!answered.isError);
    assert.deepStrictEqual(shape(connection.requests), [
      'POST /sap/bc/adt/packages/pkg_a LOCK',
      'GET /sap/bc/adt/packages/pkg_a',
      'PUT /sap/bc/adt/packages/pkg_a',
      'POST /sap/bc/adt/packages/pkg_a UNLOCK',
    ]);
    const put = connection.requests[2];
    assert.ok(put?.url.includes('corrNr=XXXK900001'));
    assert.ok(String(put?.data).includes('adtcore:description="New text"'));
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
    assert.equal(answered.isError, true);
    assert.deepStrictEqual(shape(connection.requests), [
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
    assert.equal(answered.isError, true);
    assert.deepStrictEqual(shape(connection.requests), [
      'POST /sap/bc/adt/packages/pkg_a LOCK',
    ]);
  });

  it('inside its lock, the read and the write the low tool sent', async () => {
    const high = parityConnection();
    await handleUpdatePackage(ctx(high), {
      package_name: 'PKG_A',
      description: 'New text',
      transport_request: 'XXXK900001',
    });
    assert.equal(high.requests.length, 4);
    // Inside the lock, the write the low tool sent under the caller's lock —
    // the same GET and PUT, with the lock handle the stand-in answered.
    const inner = parityRequests(high.requests.slice(1, 3));
    const low = lowRequestsOf('UpdatePackageLow') as Array<{ url: string }>;
    assert.equal(low.length, 2);
    assert.deepStrictEqual(
      inner.map((r) => r.method),
      ['GET', 'PUT'],
    );
    assert.deepStrictEqual(inner[0], low[0]);
    // The table carries the system as a placeholder; the corpus answer the
    // stand-in serves carries the recorded one.
    assert.deepStrictEqual(
      neutral(inner[1]?.data),
      neutral((low[1] as { data?: unknown }).data),
    );
  });
});

describe('compact PACKAGE update: HandlerGet part metadata, then HandlerUpdate under lock_handle', () => {
  it('sends the GET and the PUT the low tool sent, one per call', async () => {
    const low = lowRequestsOf('UpdatePackageLow') as Array<{
      data?: unknown;
    }>;
    const connection = parityConnection();
    const read = (await compactTool(
      connection,
      'HandlerGet',
    )({
      object_type: 'PACKAGE',
      package_name: 'PKG_A',
      part: 'metadata',
    })) as { isError?: boolean };
    assert.ok(!read.isError);
    assert.equal(connection.requests.length, 1);
    // The caller changes the document it read and passes all of it back.
    const written = (await compactTool(
      connection,
      'HandlerUpdate',
    )({
      object_type: 'PACKAGE',
      package_name: 'PKG_A',
      source_code: low[1]?.data,
      lock_handle: 'LOCK_HANDLE_PLACEHOLDER',
      transport_request: 'XXXK900001',
    })) as { isError?: boolean };
    assert.ok(!written.isError);
    assert.deepStrictEqual(parityRequests(connection.requests), low);
  });
});

describe('DeletePackage (high)', () => {
  it('asks the deletion check, then sends the delete', async () => {
    const connection = parityConnection();
    await handleDeletePackage(ctx(connection), {
      package_name: 'PKG_A',
      transport_request: 'XXXK900001',
    });
    assert.deepStrictEqual(shape(connection.requests), [
      'POST /sap/bc/adt/deletion/check',
      'POST /sap/bc/adt/deletion/delete',
    ]);
    assert.ok(String(connection.requests[1]?.data).includes('pkg_a'));
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
    assert.equal(answered.isError, true);
    assert.deepStrictEqual(shape(connection.requests), [
      'POST /sap/bc/adt/deletion/check',
    ]);
  });

  // A permitted check is followed by the delete, whatever its W says: on
  // premise the check words existing objects "does not exist" (#1, #11).
  it('a package the check permits gets the delete, though its W says "does not exist"', async () => {
    const permitted =
      '<?xml version="1.0" encoding="utf-8"?><del:checkResponse xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">' +
      '<del:object adtcore:uri="/sap/bc/adt/packages/pkg_a" del:isDeletable="true">' +
      '<del:message del:type="W"><del:text>Object PKG_A does not exist</del:text></del:message>' +
      '</del:object></del:checkResponse>';
    const connection = recordingConnection([{ data: permitted }]);
    await handleDeletePackage(ctx(connection), { package_name: 'PKG_A' });
    assert.deepStrictEqual(shape(connection.requests), [
      'POST /sap/bc/adt/deletion/check',
      'POST /sap/bc/adt/deletion/delete',
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
    assert.equal(answered.isError, true);
    assert.equal(connection.requests.length, 2);
  });

  it('sends the check, then exactly what compact’s HandlerDelete PACKAGE sends', async () => {
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
    assert.equal(high.requests.length, 2);
    // Compact sends the deletion alone — the low tool's request; the high
    // tool asks the check first.
    assert.deepStrictEqual(
      parityRequests(compact.requests),
      parityRequests(high.requests.slice(1)),
    );
    assert.deepStrictEqual(
      parityRequests(compact.requests),
      lowRequestsOf('DeletePackageLow'),
    );
  });
});
