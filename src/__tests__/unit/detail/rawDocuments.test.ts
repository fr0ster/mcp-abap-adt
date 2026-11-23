/**
 * A one-read tool's raw is the document as SAP sent it, no JSON of ours
 * around it (Codex round 5, P1-3): GetPackage's metadata document.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetPackage } from '../../../handlers/package/high/handleGetPackage';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const METADATA =
  '<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPKG" adtcore:description="A package" adtcore:type="DEVC/K"/>';

describe('a one-read tool answers its document at raw', () => {
  it('GetPackage: the metadata document as is', async () => {
    const connection = recordingConnection([{ data: METADATA }]);
    declareSystemKind(connection, 'onprem');
    const answered = await handleGetPackage(
      { connection, logger: undefined } as never,
      { package_name: 'zpkg', detail: 'raw' } as never,
    );
    assert.equal(answered.isError, false, answered.content[0]?.text);
    assert.equal(answered.content[0]?.text, METADATA);
  });
});
