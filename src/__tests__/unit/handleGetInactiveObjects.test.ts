/**
 * GetInactiveObjects against the inactive-objects list E19 sent on
 * 2026-09-26, through a real AdtClient — the reading the handler gets is the
 * one `structured` makes, where `ioc:object` is an array.
 */
import { handleGetInactiveObjects } from '../../handlers/system/readonly/handleGetInactiveObjects';
import { recordingConnection } from '../helpers/recordingConnection';

const ONE_INACTIVE_BDEF =
  '<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects">' +
  '<ioc:entry><ioc:object ioc:user="OKYSLYTSIA" ioc:deleted="false">' +
  '<ioc:ref adtcore:uri="/sap/bc/adt/bo/behaviordefinitions/zi_mcp_shr_root" adtcore:type="BDEF/BDO" adtcore:name="ZI_MCP_SHR_ROOT" xmlns:adtcore="http://www.sap.com/adt/core"/>' +
  '</ioc:object><ioc:transport/></ioc:entry></ioc:inactiveObjects>';

const TWO_INACTIVE =
  '<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects">' +
  '<ioc:entry><ioc:object ioc:user="OKYSLYTSIA" ioc:deleted="false">' +
  '<ioc:ref adtcore:type="BDEF/BDO" adtcore:name="ZI_MCP_SHR_ROOT" xmlns:adtcore="http://www.sap.com/adt/core"/>' +
  '</ioc:object><ioc:transport/></ioc:entry>' +
  '<ioc:entry><ioc:object ioc:user="OKYSLYTSIA" ioc:deleted="false">' +
  '<ioc:ref adtcore:type="FUGR/F" adtcore:name="ZMCP_SHR_FGRP" xmlns:adtcore="http://www.sap.com/adt/core"/>' +
  '</ioc:object><ioc:transport/></ioc:entry></ioc:inactiveObjects>';

const NONE =
  '<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects"/>';

async function run(body: string) {
  const conn = recordingConnection([{ data: body }]);
  const result: any = await handleGetInactiveObjects(
    { connection: conn, logger: undefined } as any,
    {},
  );
  expect(result.isError).toBe(false);
  return JSON.parse(result.content[0].text);
}

describe('GetInactiveObjects', () => {
  it('lists an inactive object (E19 answer, one entry)', async () => {
    expect(await run(ONE_INACTIVE_BDEF)).toEqual({
      success: true,
      count: 1,
      objects: [{ type: 'BDEF/BDO', name: 'ZI_MCP_SHR_ROOT' }],
    });
  });

  it('lists every entry', async () => {
    expect((await run(TWO_INACTIVE)).objects).toEqual([
      { type: 'BDEF/BDO', name: 'ZI_MCP_SHR_ROOT' },
      { type: 'FUGR/F', name: 'ZMCP_SHR_FGRP' },
    ]);
  });

  it('answers none when nothing is inactive', async () => {
    expect(await run(NONE)).toEqual({ success: true, count: 0, objects: [] });
  });
});
