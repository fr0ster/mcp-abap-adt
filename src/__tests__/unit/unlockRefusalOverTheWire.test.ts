/**
 * UpdatePackage over the wire (real adt-clients on a recording connection),
 * its unlock refused with a 403: the unlock's error as the strategy built it,
 * with the step `unlock`, in `cleanup` — after a successful and a failed write.
 */

import { handleUpdatePackage } from '../../handlers/package/high/handleUpdatePackage';
import { corpusBody } from '../../lib/adtCorpus';
import type { HandlerContext } from '../../lib/handlers/interfaces';
import { silentLogger } from '../helpers/lowToCompact';
import { recordingConnection } from '../helpers/recordingConnection';

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
    expect(payload.cleanup.failures).toHaveLength(1);
    expect(payload.cleanup.failures[0]).toMatchObject({
      step: 'unlock',
      status: 403,
      raw_body: DOCUMENT,
    });
    expect(payload.cleanup.failures[0].adt_type).toEqual(expect.any(String));
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
    expect(result.isError).toBe(false);
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
    expect(result.isError).toBe(true);
    const payload = payloadOf(result);
    expect(payload.step).toBe('update metadata');
    expectUnlockEntry(payload);
  });
});
