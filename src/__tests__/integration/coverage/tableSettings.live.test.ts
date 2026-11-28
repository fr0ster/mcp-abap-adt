/**
 * A table's technical settings, live, on both systems: the case creates a
 * table of its own in the package the coverage suites create in
 * (`ownPackage`), its name read free first and recorded for cleanup before
 * its create, and writes its DDL without activating it.
 *
 * - SAP creates the settings with the table: a read right after the create
 *   answers the defaults, data class APPL0 and size category 0 (measured on
 *   premise and on the cloud, 2026-11-19, `table-settings.md` §8 step 1).
 *
 * - UpdateTableSettings writes non-default values and activates the table;
 *   the active read answers them, every other setting as it was (SAP writes
 *   every field from the document and resets one left out, Code both systems
 *   `CL_TABT_WB_PERSIST->move_adt_to_ddv`; the patch writes the rest as read).
 * - A data class SAP does not know is stored, and the table's activation is
 *   answered as an error with SAP's message (measured on both, 2026-11-19).
 * - On the cloud: the AMDP flag is kept as read; set with logging on, the
 *   activation is refused with DT 771 (Code, cloud: `RADTTCHK` FORM
 *   `chk_writable_amdp_usage`; measured in adt-clients' 46.1.0 live run); set
 *   with buffering N and logging off, it activates.
 *
 * The cleanup deletes the table and reads it absent.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import { skipRunningTest } from '../helpers/runningTest';
import {
  holdLock,
  lockReleased,
  member,
  onPremise,
  onRequest,
  ownPackage,
  payloadOf,
  releaseHeldLocks,
  request,
  succeeded,
  unlockSending,
} from './ownObjects';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const TABLE = `ZMCP_TS_${SUFFIX}`;
const DESCRIPTION = 'MCP table settings live case';

/** The table's DDL: a transparent table with a client and a key. */
const DDL = [
  `@EndUserText.label : '${DESCRIPTION}'`,
  '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
  '@AbapCatalog.tableCategory : #TRANSPARENT',
  '@AbapCatalog.deliveryClass : #A',
  '@AbapCatalog.dataMaintenance : #RESTRICTED',
  `define table ${TABLE.toLowerCase()} {`,
  '  key client : abap.clnt not null;',
  '  key id     : abap.char(10) not null;',
  '  name       : abap.char(30);',
  '}',
].join('\n');

liveSuite(['onprem', 'cloud'], "A table's technical settings", () => {
  after(async () => {
    await releaseHeldLocks();
    await deleteRecorded();
    await expectAbsent({ tool: 'GetTable', args: { table_name: TABLE } });
  });

  it('GetTableSettings reads the defaults SAP created with the table', async () => {
    await expectNameFree({ tool: 'GetTable', args: { table_name: TABLE } });
    recordCreated('DeleteTable', { table_name: TABLE, ...onRequest() });
    succeeded(
      'CreateTable',
      await livePrepare('CreateTable', {
        table_name: TABLE,
        description: DESCRIPTION,
        package_name: ownPackage(),
        ...onRequest(),
      }),
    );
    succeeded(
      'UpdateTable',
      await livePrepare('UpdateTable', {
        table_name: TABLE,
        ddl_code: DDL,
        activate: false,
        ...onRequest(),
      }),
    );
    const read = await liveCall('GetTableSettings', {
      table_name: TABLE,
      version: 'inactive',
    });
    const settings = payloadOf(succeeded('GetTableSettings', read));
    assert.equal(member(settings, 'table_name'), TABLE);
    assert.equal(member(settings, 'data_class'), 'APPL0');
    assert.equal(member(settings, 'size_category'), '0');
  });

  it('UpdateTableSettings writes non-default settings and activates the table', async () => {
    const written = await liveCall('UpdateTableSettings', {
      table_name: TABLE,
      data_class: 'APPL1',
      size_category: '1',
      transport_request: request(),
      activate: true,
    });
    succeeded('UpdateTableSettings', written);
    const read = await liveCall('GetTableSettings', {
      table_name: TABLE,
      version: 'active',
    });
    const settings = payloadOf(succeeded('GetTableSettings active', read));
    assert.equal(member(settings, 'data_class'), 'APPL1');
    assert.equal(member(settings, 'size_category'), '1');
    assert.equal(member(member(settings, 'buffering'), 'allowed'), 'N');
  });

  it('compact: HandlerLock, HandlerUpdate and HandlerUnlock write the settings, HandlerActivate the table, HandlerGet reads them', async () => {
    const locked = await liveCall('HandlerLock', {
      object_type: 'TABLE_SETTINGS',
      object_name: TABLE,
    });
    const handle = member(
      payloadOf(succeeded('HandlerLock TABLE_SETTINGS', locked)),
      'lock_handle',
    );
    assert.equal(typeof handle, 'string', locked.text);
    if (typeof handle === 'string') {
      holdLock({
        object_type: 'TABLE_SETTINGS',
        object_name: TABLE,
        lock_handle: handle,
      });
    }
    const written = await liveCall('HandlerUpdate', {
      object_type: 'TABLE_SETTINGS',
      table_name: TABLE,
      data_class: 'APPL2',
      lock_handle: handle,
      transport_request: request(),
    });
    unlockSending(String(handle));
    const unlocked = await liveCall('HandlerLock', {
      action: 'unlock',
      object_type: 'TABLE_SETTINGS',
      object_name: TABLE,
      lock_handle: handle,
    });
    if (unlocked.isError !== true) lockReleased(String(handle));
    succeeded('HandlerUpdate TABLE_SETTINGS', written);
    succeeded('HandlerUnlock TABLE_SETTINGS', unlocked);
    succeeded(
      'HandlerActivate TABLE',
      await livePrepare('HandlerActivate', {
        object_type: 'TABLE',
        object_name: TABLE,
      }),
    );
    const read = await liveCall('HandlerGet', {
      object_type: 'TABLE_SETTINGS',
      part: 'source',
      table_name: TABLE,
      version: 'active',
    });
    const settings = payloadOf(succeeded('HandlerGet TABLE_SETTINGS', read));
    assert.equal(member(settings, 'data_class'), 'APPL2');
  });

  it("answers the activation of a data class SAP does not know as SAP's error", async () => {
    const answer = await liveCall('UpdateTableSettings', {
      table_name: TABLE,
      data_class: 'ZZNOP',
      transport_request: request(),
      activate: true,
    });
    assert.equal(answer.isError, true, answer.text);
    assert.match(answer.text, /ZZNOP/);
    succeeded(
      'UpdateTableSettings back to APPL1',
      await livePrepare('UpdateTableSettings', {
        table_name: TABLE,
        data_class: 'APPL1',
        activate: true,
        ...onRequest(),
      }),
    );
  });

  it('on the cloud, keeps the AMDP flag as read and activates it only with buffering N and logging off', async () => {
    if (onPremise()) {
      // The on-premise settings have no AMDP flag: `SDDIC_ADT_TTAB` and
      // `move_adt_to_ddv` map none there (Code, table-settings.md §14 S3).
      skipRunningTest("the AMDP flag is the cloud settings' field");
      return;
    }
    const before = payloadOf(
      succeeded(
        'GetTableSettings before',
        await livePrepare('GetTableSettings', { table_name: TABLE }),
      ),
    );
    const flag = member(before, 'is_writable_by_amdp');
    assert.equal(typeof flag, 'boolean');
    const sized = await liveCall('UpdateTableSettings', {
      table_name: TABLE,
      size_category: '2',
      transport_request: request(),
      activate: true,
    });
    succeeded('UpdateTableSettings size only', sized);
    const kept = payloadOf(
      succeeded(
        'GetTableSettings kept',
        await livePrepare('GetTableSettings', { table_name: TABLE }),
      ),
    );
    assert.equal(member(kept, 'is_writable_by_amdp'), flag);
    const refused = await liveCall('UpdateTableSettings', {
      table_name: TABLE,
      is_writable_by_amdp: true,
      logging_enabled: true,
      transport_request: request(),
      activate: true,
    });
    assert.equal(refused.isError, true, refused.text);
    assert.match(refused.text, /AMDP/);
    const allowed = await liveCall('UpdateTableSettings', {
      table_name: TABLE,
      is_writable_by_amdp: true,
      logging_enabled: false,
      buffering: { allowed: 'N' },
      transport_request: request(),
      activate: true,
    });
    succeeded(
      'UpdateTableSettings AMDP with buffering N and logging off',
      allowed,
    );
    const written = payloadOf(
      succeeded(
        'GetTableSettings AMDP active',
        await livePrepare('GetTableSettings', {
          table_name: TABLE,
          version: 'active',
        }),
      ),
    );
    assert.equal(member(written, 'is_writable_by_amdp'), true);
  });
});
