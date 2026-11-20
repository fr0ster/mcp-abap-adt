/**
 * UpdatePackage over the wire (real adt-clients on a recording connection),
 * its unlock refused with a 403: the unlock's error as the strategy built it,
 * with the step `unlock`, in `cleanup` — after a successful and a failed write.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleUpdatePackage } from '../../handlers/package/high/handleUpdatePackage';
import type { HandlerContext } from '../../lib/handlers/interfaces';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject } from '../helpers/assertions';
import { silentLogger } from '../helpers/lowToCompact';
import { recordingConnection } from '../helpers/recordingConnection';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
  '<namespace id="com.sap.adt"/><type id="ExceptionResourceNoAuthorization"/>' +
  '<message lang="EN">no authorization to unlock</message></exc:exception>';

const payloadOf = (result: any) => JSON.parse(result.content[0].text);

describe('UpdatePackage over the wire, its unlock refused with a 403', () => {
  const ctx = (connection: unknown) =>
    ({ connection, logger: silentLogger }) as unknown as HandlerContext;
  const PACKAGE_DOCUMENT = corpusBody(
    'read-metadata-package--01-packages-zmcpshrpkg',
  );
  const forbidden = { status: 403, statusText: 'Forbidden', data: DOCUMENT };

  const expectUnlockEntry = (payload: any) => {
    assert.equal(payload.cleanup.failures.length, 1);
    assertMatchObject(payload.cleanup.failures[0], {
      step: 'unlock',
      status: 403,
      raw_body: DOCUMENT,
    });
    assert.equal(typeof payload.cleanup.failures[0].adt_type, 'string');
  };

  it('after a successful write', async () => {
    const connection = recordingConnection([
      undefined,
      { data: PACKAGE_DOCUMENT },
      undefined,
      forbidden,
    ]);
    const result: any = await handleUpdatePackage(ctx(connection), {
      package_name: 'pkg_a',
      description: 'New text',
    });
    assert.equal(result.isError, false);
    expectUnlockEntry(payloadOf(result));
  });

  it('after a failed write', async () => {
    const connection = recordingConnection([
      undefined,
      { data: PACKAGE_DOCUMENT },
      { status: 400, statusText: 'Bad Request', data: DOCUMENT },
      forbidden,
    ]);
    const result: any = await handleUpdatePackage(ctx(connection), {
      package_name: 'pkg_a',
      description: 'New text',
    });
    assert.equal(result.isError, true);
    const payload = payloadOf(result);
    assert.equal(payload.step, 'update metadata');
    expectUnlockEntry(payload);
  });
});
