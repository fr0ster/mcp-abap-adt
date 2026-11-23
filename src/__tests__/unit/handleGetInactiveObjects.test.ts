/**
 * GetInactiveObjects against the inactive-objects list an on-premise system sent on
 * 2026-09-26, through a real AdtClient — the reading the handler gets is the
 * one `structured` makes, where `ioc:object` is an array.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetInactiveObjects } from '../../handlers/system/readonly/handleGetInactiveObjects';
import { recordingConnection } from '../helpers/recordingConnection';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const ONE_INACTIVE_BDEF =
  '<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects">' +
  '<ioc:entry><ioc:object ioc:user="OKYSLYTSIA" ioc:deleted="false">' +
  '<ioc:ref adtcore:uri="/sap/bc/adt/bo/behaviordefinitions/zi_mcp_shr_root" adtcore:type="BDEF/BDO" adtcore:name="ZI_MCP_SHR_ROOT" xmlns:adtcore="http://www.sap.com/adt/core"/>' +
  '</ioc:object><ioc:transport/></ioc:entry></ioc:inactiveObjects>';

const TWO_INACTIVE =
  '<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects">' +
  '<ioc:entry><ioc:object ioc:user="OKYSLYTSIA" ioc:deleted="false">' +
  '<ioc:ref adtcore:uri="/sap/bc/adt/bo/behaviordefinitions/zi_mcp_shr_root" adtcore:type="BDEF/BDO" adtcore:name="ZI_MCP_SHR_ROOT" xmlns:adtcore="http://www.sap.com/adt/core"/>' +
  '</ioc:object><ioc:transport/></ioc:entry>' +
  '<ioc:entry><ioc:object ioc:user="OKYSLYTSIA" ioc:deleted="false">' +
  '<ioc:ref adtcore:uri="/sap/bc/adt/functions/groups/zmcp_shr_fgrp" adtcore:type="FUGR/F" adtcore:name="ZMCP_SHR_FGRP" xmlns:adtcore="http://www.sap.com/adt/core"/>' +
  '</ioc:object><ioc:transport/></ioc:entry></ioc:inactiveObjects>';

const NONE =
  '<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects"/>';

async function run(body: string) {
  const conn = recordingConnection([{ data: body }]);
  const result: any = await handleGetInactiveObjects(
    { connection: conn, logger: undefined } as any,
    { detail: 'medium' },
  );
  assert.equal(result.isError, false);
  return JSON.parse(result.content[0].text);
}

describe('GetInactiveObjects', () => {
  it('terse, by default: a TSV row per object, its type, name and owner', async () => {
    const conn = recordingConnection([{ data: TWO_INACTIVE }]);
    const result: any = await handleGetInactiveObjects(
      { connection: conn, logger: undefined } as any,
      {},
    );
    assert.equal(
      result.content[0].text,
      [
        '# count 2',
        'type\tname\tparent',
        'BDEF/BDO\tZI_MCP_SHR_ROOT\t',
        'FUGR/F\tZMCP_SHR_FGRP\t',
      ].join('\n'),
    );
  });

  // adt-strategies 0.28.0 refuses a list holding a reference with no address
  // (neither uri nor parentUri): an activation is matched by it, and a
  // reference dropped would read as activated.
  it('refuses a list whose reference names no address', async () => {
    const conn = recordingConnection([
      {
        data: TWO_INACTIVE.replace(
          ' adtcore:uri="/sap/bc/adt/functions/groups/zmcp_shr_fgrp"',
          '',
        ),
      },
    ]);
    const result: any = await handleGetInactiveObjects(
      { connection: conn, logger: undefined } as any,
      {},
    );
    assert.equal(result.isError, true);
  });

  it('lists an inactive object (on premise answer, one entry)', async () => {
    assert.deepStrictEqual(await run(ONE_INACTIVE_BDEF), {
      success: true,
      count: 1,
      objects: [{ type: 'BDEF/BDO', name: 'ZI_MCP_SHR_ROOT' }],
    });
  });

  it('lists every entry', async () => {
    assert.deepStrictEqual((await run(TWO_INACTIVE)).objects, [
      { type: 'BDEF/BDO', name: 'ZI_MCP_SHR_ROOT' },
      { type: 'FUGR/F', name: 'ZMCP_SHR_FGRP' },
    ]);
  });

  it('answers none when nothing is inactive', async () => {
    assert.deepStrictEqual(await run(NONE), {
      success: true,
      count: 0,
      objects: [],
    });
  });

  // BASIS 7.40 answers the same request with another document: a flat
  // `adtcore:objectReferences`, a function module carrying its group as
  // `parentUri` (measured 2026-10-01). Read as the newer shape it gave
  // `count: 0` over eight inactive objects, and an activation was confirmed
  // off it.
  const LEGACY_TWO_INACTIVE =
    '<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">' +
    '<adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zobj_fgrp" adtcore:type="FUGR/F" adtcore:name="ZOBJ_FGRP"/>' +
    '<adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zobj_fgrp/fmodules/z_obj_fm" adtcore:type="FUGR/FF" adtcore:name="Z_OBJ_FM" adtcore:parentUri="/sap/bc/adt/functions/groups/zobj_fgrp"/>' +
    '</adtcore:objectReferences>';

  it('lists the objects of the older document (BASIS 7.40)', async () => {
    assert.deepStrictEqual((await run(LEGACY_TWO_INACTIVE)).objects, [
      { type: 'FUGR/F', name: 'ZOBJ_FGRP' },
      // The group travels with the module: an activation is addressed through
      // it, and without it the module's own name lands in the group's place.
      { type: 'FUGR/FF', name: 'Z_OBJ_FM', parentName: 'ZOBJ_FGRP' },
    ]);
  });

  it('answers none for an empty older document', async () => {
    const empty =
      '<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"/>';
    assert.deepStrictEqual(await run(empty), {
      success: true,
      count: 0,
      objects: [],
    });
  });

  it('refuses a document it cannot read, rather than answer none', async () => {
    const conn = recordingConnection([
      { data: '<?xml version="1.0"?><other:list xmlns:other="urn:x"/>' },
    ]);
    const result: any = await handleGetInactiveObjects(
      { connection: conn, logger: undefined } as any,
      {},
    );
    assert.equal(result.isError, true);
  });
});
